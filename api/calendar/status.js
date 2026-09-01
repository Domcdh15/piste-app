import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { ensureFreshToken, sendEmail, listRecentMessages, setGmailSignature, getGmailSignature, fetchEmailThreadWith } from "../_lib/providers.js";
import { postSlack } from "../_lib/slack.js";

function buildVacationReply(s) {
  const lines = [(s.vacation_message || "").trim() || "Je suis actuellement absent(e)."];
  // La date de retour vient désormais de la période d'absence ; l'ancien champ
  // reste lu pour les absences déclarées avant ce changement.
  const retour = s.vacation_to || s.vacation_return_at;
  if (retour) {
    lines.push(`Je serai de retour le ${new Date(retour).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`);
  }
  if (s.vacation_redirect_name || s.vacation_redirect_email) {
    lines.push(`En cas d'urgence, vous pouvez contacter ${[s.vacation_redirect_name, s.vacation_redirect_email && `(${s.vacation_redirect_email})`].filter(Boolean).join(" ")}.`);
  }
  return lines.join("\n\n");
}

// Absent aujourd'hui ? Sans bornes de dates, une absence dure indéfiniment.
function absentAujourdHui(s) {
  if (!s?.vacation_mode_enabled) return false;
  const jour = new Date().toISOString().slice(0, 10);
  if (s.vacation_from && jour < s.vacation_from) return false;
  if (s.vacation_to && jour > s.vacation_to) return false;
  return true;
}

async function runVacationCheck(admin) {
  // Bornée par les dates : sans elles, une absence oubliée répondait encore
  // « je suis absent » des mois plus tard.
  const { data: toutes } = await admin.from("user_settings").select("*").eq("vacation_mode_enabled", true);
  const rows = (toutes || []).filter(absentAujourdHui);
  let repliesSent = 0;

  for (const s of rows || []) {
    const { data: conns } = await admin.from("calendar_connections").select("*").eq("user_id", s.user_id);
    const since = s.vacation_last_checked_at || new Date(Date.now() - 2 * 3600000).toISOString();
    const already = new Set(s.vacation_replied_senders || []);
    const newlyReplied = [];

    for (const conn of conns || []) {
      try {
        const accessToken = await ensureFreshToken(admin, conn);
        const messages = await listRecentMessages(conn.provider, accessToken, since);
        for (const msg of messages) {
          if (already.has(msg.from) || newlyReplied.includes(msg.from)) continue;
          await sendEmail(conn.provider, accessToken, {
            to: msg.from,
            subject: msg.subject ? `Re: ${msg.subject}` : "Réponse automatique",
            body: buildVacationReply(s),
          });
          newlyReplied.push(msg.from);
          repliesSent++;
        }
      } catch (e) {
        // une connexion en échec (token expiré, scope manquant, etc.) ne doit pas bloquer les autres utilisateurs
        continue;
      }
    }

    await admin
      .from("user_settings")
      .update({ vacation_last_checked_at: new Date().toISOString(), vacation_replied_senders: [...already, ...newlyReplied] })
      .eq("user_id", s.user_id);
  }

  return repliesSent;
}

// L'envoi d'email et la vérification du mode absence vivent ici (et non dans leur propre

// Séquences de relance — passage quotidien.
// Règle centrale : dès que le prospect a répondu, la séquence s'arrête. Une
// relance automatique qui arrive après une réponse fait passer le commercial
// pour un robot, et c'est le premier reproche fait aux outils de séquence.
async function runSequences(admin) {
  const nowISO = new Date().toISOString();
  const { data: due } = await admin
    .from("sequence_messages")
    .select("*")
    .eq("status", "scheduled")
    .lte("send_at", nowISO)
    .order("send_at", { ascending: true })
    .limit(200);

  if (!due || due.length === 0) return { sent: 0, stopped: 0, reportes: 0 };

  let sent = 0;
  let stopped = 0;
  let reportes = 0;
  // Une séquence n'est vérifiée qu'une fois par passage, même si elle a
  // plusieurs messages en retard.
  const decided = new Map();

  for (const msg of due) {
    const { data: seq } = await admin.from("sequences").select("*").eq("id", msg.sequence_id).maybeSingle();
    if (!seq || seq.status !== "active") {
      await admin.from("sequence_messages").update({ status: "cancelled" }).eq("id", msg.id);
      continue;
    }

    const { data: prospect } = await admin.from("prospects").select("email, name, company").eq("id", msg.prospect_id).maybeSingle();
    if (!prospect?.email) {
      await admin.from("sequence_messages").update({ status: "failed", error: "Prospect sans adresse email" }).eq("id", msg.id);
      continue;
    }

    const { data: reglages } = await admin
      .from("user_settings")
      .select("vacation_mode_enabled, vacation_from, vacation_to")
      .eq("user_id", msg.user_id)
      .maybeSingle();
    if (absentAujourdHui(reglages)) {
      const reprise = reglages.vacation_to
        ? new Date(new Date(reglages.vacation_to).getTime() + 86400000)
        : new Date(Date.now() + 7 * 86400000);
      reprise.setHours(9, 0, 0, 0);
      await admin.from("sequence_messages").update({ send_at: reprise.toISOString() }).eq("id", msg.id);
      reportes += 1;
      continue;
    }

    const { data: conns } = await admin.from("calendar_connections").select("*").eq("user_id", msg.user_id);
    const conn = (conns || []).find((c) => c.provider === "google") || (conns || []).find((c) => c.provider === "microsoft");
    if (!conn) {
      await admin.from("sequence_messages").update({ status: "failed", error: "Aucune boîte mail connectée" }).eq("id", msg.id);
      continue;
    }

    try {
      const accessToken = await ensureFreshToken(admin, conn);

      // A-t-il répondu depuis le lancement de la séquence ?
      if (!decided.has(seq.id)) {
        let replied = false;
        try {
          const thread = await fetchEmailThreadWith(conn.provider, accessToken, prospect.email, 8);
          const since = new Date(seq.created_at).getTime();
          const needle = prospect.email.toLowerCase();
          // Le fil ne porte pas de sens de circulation : un message vient du
          // prospect si son adresse est dans l'expéditeur.
          replied = (thread || []).some((m) => {
            const when = new Date(m.sentAt || m.date || 0).getTime();
            return (m.from || "").toLowerCase().includes(needle) && when > since;
          });
        } catch {
          // Boîte illisible : on ne bloque pas la séquence sur une panne de
          // lecture, mais on n'invente pas non plus de réponse.
          replied = false;
        }
        decided.set(seq.id, replied);
      }

      if (decided.get(seq.id)) {
        await admin.from("sequences").update({ status: "stopped", stopped_reason: "Le prospect a répondu" }).eq("id", seq.id);
        await admin.from("sequence_messages").update({ status: "cancelled" }).eq("sequence_id", seq.id).eq("status", "scheduled");
        await admin.from("activities").insert({
          user_id: msg.user_id,
          prospect_id: msg.prospect_id,
          team_id: seq.team_id,
          type: "note",
          note: "Séquence de relance arrêtée : le prospect a répondu.",
          source: "auto",
        });
        stopped++;
        continue;
      }

      await sendEmail(conn.provider, accessToken, { to: prospect.email, subject: msg.subject || "", body: msg.body });
      await admin.from("sequence_messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", msg.id);
      await admin.from("activities").insert({
        user_id: msg.user_id,
        prospect_id: msg.prospect_id,
        team_id: seq.team_id,
        type: "note",
        note: `Relance ${msg.step} de la séquence envoyée à ${prospect.email}`,
        source: "auto",
      });
      await admin.from("prospects").update({ last_contact_at: new Date().toISOString() }).eq("id", msg.prospect_id);
      sent++;

      // Dernier message parti : la séquence est terminée.
      const { count: remaining } = await admin
        .from("sequence_messages")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", seq.id)
        .eq("status", "scheduled");
      if (!remaining) await admin.from("sequences").update({ status: "done" }).eq("id", seq.id);
    } catch (e) {
      await admin.from("sequence_messages").update({ status: "failed", error: (e.message || "Envoi impossible").slice(0, 300) }).eq("id", msg.id);
    }
  }

  return { sent, stopped, reportes };
}

// Le point du matin dans Slack. Un seul message par équipe, volontairement
// court : trois nombres et ce qui brûle. Un canal qu'on doit lire en entier
// finit par n'être plus lu du tout.
async function runSlackBriefs(admin) {
  const { data: canaux } = await admin
    .from("team_integrations")
    .select("team_id, slack_webhook_url")
    .not("slack_webhook_url", "is", null)
    .eq("slack_daily_brief", true);

  if (!canaux?.length) return 0;

  const finDuJour = new Date();
  finDuJour.setHours(23, 59, 59, 999);
  const maintenant = new Date().toISOString();
  let envoyes = 0;

  for (const canal of canaux) {
    try {
      const [{ data: taches }, { data: prospects }] = await Promise.all([
        admin.from("tasks").select("due_at").eq("team_id", canal.team_id).eq("done", false),
        admin.from("prospects").select("id, company, name, deal_value, last_contact_at, stage").eq("team_id", canal.team_id),
      ]);

      const aFaire = (taches || []).filter((t) => t.due_at && t.due_at <= finDuJour.toISOString()).length;
      const enRetard = (taches || []).filter((t) => t.due_at && t.due_at < maintenant).length;

      const ouverts = (prospects || []).filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
      const silencieux = ouverts
        .filter((p) => !p.last_contact_at || (Date.now() - new Date(p.last_contact_at)) / 86400000 >= 7)
        .sort((a, b) => Number(b.deal_value || 0) - Number(a.deal_value || 0));

      const lignes = [`*Closia — le point du matin*`, `${aFaire} action${aFaire > 1 ? "s" : ""} à mener aujourd'hui · ${enRetard} en retard · ${silencieux.length} dossier${silencieux.length > 1 ? "s" : ""} sans nouvelles depuis une semaine`];

      for (const p of silencieux.slice(0, 3)) {
        const jours = p.last_contact_at ? Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000) : null;
        const montant = p.deal_value ? ` — ${Math.round(Number(p.deal_value)).toLocaleString("fr-FR")} €` : "";
        lignes.push(`• ${p.company || p.name}${montant} · ${jours === null ? "jamais contacté" : `${jours} jours sans échange`}`);
      }

      await postSlack(canal.slack_webhook_url, lignes.join("\n"));
      envoyes++;
    } catch (e) {
      // Un canal révoqué ou une équipe en erreur ne doit pas priver les autres
      // de leur point du matin.
      continue;
    }
  }
  return envoyes;
}

// Le point hebdomadaire du manager, réservé à Business. Envoyé le lundi depuis
// la boîte de l'administrateur : c'est ce qui fait qu'un dirigeant rouvre son
// CRM au lieu de l'oublier. Le cron passe tous les jours, on ne fait rien les
// six autres.
async function runWeeklyReports(admin) {
  if (new Date().getDay() !== 1) return 0;

  const { data: equipes } = await admin.from("teams").select("id, name, plan_price");
  const business = (equipes || []).filter((t) => Number(t.plan_price ?? 19) > 69);
  if (!business.length) return 0;

  const ilYAUneSemaine = new Date(Date.now() - 7 * 86400000).toISOString();
  let envoyes = 0;

  for (const equipe of business) {
    try {
      const { data: admins } = await admin
        .from("team_members").select("user_id").eq("team_id", equipe.id).eq("role", "admin");
      if (!admins?.length) continue;

      const [{ data: prospects }, { data: taches }] = await Promise.all([
        admin.from("prospects").select("company, name, stage, status, deal_value, last_contact_at, closed_at").eq("team_id", equipe.id),
        admin.from("tasks").select("due_at, done").eq("team_id", equipe.id).eq("done", false),
      ]);

      const ouverts = (prospects || []).filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
      const pipeline = ouverts.reduce((s, p) => s + Number(p.deal_value || 0), 0);
      const gagnes = (prospects || []).filter((p) => p.status === "gagne" && p.closed_at && p.closed_at >= ilYAUneSemaine);
      const perdus = (prospects || []).filter((p) => p.status === "perdu" && p.closed_at && p.closed_at >= ilYAUneSemaine);
      const enRetard = (taches || []).filter((t) => t.due_at && t.due_at < new Date().toISOString()).length;
      const silencieux = ouverts.filter(
        (p) => !p.last_contact_at || (Date.now() - new Date(p.last_contact_at)) / 86400000 >= 7
      );

      const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
      const corps = [
        `Votre point hebdomadaire — ${equipe.name || "votre équipe"}`,
        "",
        `Pipeline ouvert : ${euros(pipeline)} sur ${ouverts.length} opportunités`,
        `Cette semaine : ${gagnes.length} gagnée(s) pour ${euros(gagnes.reduce((s, p) => s + Number(p.deal_value || 0), 0))}, ${perdus.length} perdue(s)`,
        `Tâches en retard : ${enRetard}`,
        `Dossiers sans nouvelles depuis une semaine : ${silencieux.length}`,
        "",
        silencieux.length
          ? "À regarder en priorité :\n" +
            silencieux
              .sort((a, b) => Number(b.deal_value || 0) - Number(a.deal_value || 0))
              .slice(0, 5)
              .map((p) => `- ${p.company || p.name} — ${euros(Number(p.deal_value || 0))}`)
              .join("\n")
          : "Aucun dossier en souffrance cette semaine.",
      ].join("\n");

      for (const a of admins) {
        const { data: conn } = await admin
          .from("calendar_connections").select("*")
          .eq("user_id", a.user_id).eq("provider", "google").maybeSingle();
        if (!conn) continue;
        const { data: u } = await admin.auth.admin.getUserById(a.user_id);
        if (!u?.user?.email) continue;
        const accessToken = await ensureFreshToken(admin, conn);
        await sendEmail("google", accessToken, {
          to: u.user.email,
          subject: `Closia — votre point hebdomadaire`,
          body: corps,
        });
        envoyes++;
      }
    } catch (e) {
      continue;
    }
  }
  return envoyes;
}

// fichier) pour rester sous la limite de 12 fonctions serverless du plan Vercel Hobby.
export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.action === "vacation_check") {
    const auth = req.headers.authorization || "";
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Non autorisé" });
    }
    const admin = supabaseAdmin();
    const repliesSent = await runVacationCheck(admin);
    // Les deux traitements quotidiens partagent le même passage : le plan
    // Hobby ne déclenche un cron qu'une fois par jour.
    const sequences = await runSequences(admin);
    const slackBriefs = await runSlackBriefs(admin);
    const weeklyReports = await runWeeklyReports(admin);
    return res.status(200).json({ ok: true, repliesSent, sequences, slackBriefs, weeklyReports });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  // Échanges email avec un prospect — lus à la demande chez le fournisseur,
  // jamais stockés côté Closia.
  if (req.method === "GET" && req.query?.action === "thread") {
    const email = (req.query.email || "").trim();
    if (!email) return res.status(400).json({ error: "Email du contact manquant" });

    const admin = supabaseAdmin();
    const { data: conns } = await admin.from("calendar_connections").select("*").eq("user_id", user.id);
    if (!conns?.length) return res.status(200).json({ messages: [], notConnected: true });

    const messages = [];
    let lastError = "";

    for (const conn of conns) {
      try {
        const accessToken = await ensureFreshToken(admin, conn);
        messages.push(...(await fetchEmailThreadWith(conn.provider, accessToken, email)));
      } catch (e) {
        const insufficientScope = e.status === 403 || /insufficient|scope|permission/i.test(`${e.message} ${e.detail || ""}`);
        lastError = insufficientScope
          ? `Permission de lecture manquante — déconnecte puis reconnecte ${conn.provider === "google" ? "Google" : "Outlook"} dans Intégrations pour autoriser la lecture des échanges.`
          : "La récupération des échanges a échoué.";
      }
    }

    messages.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
    // Une erreur sur un fournisseur ne masque pas les messages trouvés sur l'autre.
    return res.status(200).json({ messages, error: messages.length ? "" : lastError });
  }

  if (req.method === "POST") {
    const { action, provider, to, subject, body, signature, attachment } = req.body || {};

    if (action === "set_gmail_signature") {
      if (!signature) return res.status(400).json({ error: "Signature manquante" });

      const admin = supabaseAdmin();
      const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", user.id).eq("provider", "google").maybeSingle();
      if (!conn) return res.status(400).json({ error: "Aucune connexion Gmail — connecte ton compte dans Intégrations." });

      try {
        const accessToken = await ensureFreshToken(admin, conn);
        await setGmailSignature(accessToken, signature);
        return res.status(200).json({ ok: true });
      } catch (e) {
        const insufficientScope = /insufficient|scope|permission/i.test(e.message || "");
        return res.status(500).json({
          error: insufficientScope
            ? "Permission manquante — déconnecte puis reconnecte Google Calendar dans Intégrations pour autoriser la synchronisation de signature."
            : "La synchronisation a échoué. Réessaie.",
        });
      }
    }

    if (action === "get_gmail_signature") {
      const admin = supabaseAdmin();
      const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", user.id).eq("provider", "google").maybeSingle();
      if (!conn) return res.status(400).json({ error: "Aucune connexion Gmail — connecte ton compte dans Intégrations." });

      try {
        const accessToken = await ensureFreshToken(admin, conn);
        const signature = await getGmailSignature(accessToken);
        return res.status(200).json({ ok: true, signature });
      } catch (e) {
        const insufficientScope = /insufficient|scope|permission/i.test(e.message || "");
        return res.status(500).json({
          error: insufficientScope
            ? "Permission manquante — déconnecte puis reconnecte Google Calendar dans Intégrations pour autoriser la lecture de signature."
            : "La récupération a échoué. Réessaie.",
        });
      }
    }

    if (action === "send_email") {
      if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });
      if (!to || !body) return res.status(400).json({ error: "Destinataire ou message manquant" });

      const admin = supabaseAdmin();
      const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return res.status(400).json({ error: `Aucune connexion ${provider} — connecte ton compte dans Intégrations.` });

      try {
        // Une pièce jointe trop lourde est refusée ici plutôt que par le fournisseur,
        // pour renvoyer un message compréhensible.
        if (attachment?.base64 && attachment.base64.length > 7_000_000) {
          return res.status(400).json({ error: "Pièce jointe trop volumineuse (10 Mo maximum)." });
        }
        const accessToken = await ensureFreshToken(admin, conn);
        await sendEmail(provider, accessToken, { to, subject, body, attachment });
        return res.status(200).json({ ok: true });
      } catch (e) {
        const insufficientScope = /insufficient|scope|permission/i.test(e.message || "");
        return res.status(500).json({
          error: insufficientScope
            ? `Permission d'envoi manquante — déconnecte puis reconnecte ${provider === "google" ? "Google Calendar" : "Outlook Calendar"} dans Intégrations pour autoriser l'envoi d'email.`
            : "L'envoi a échoué. Réessaie.",
        });
      }
    }

    if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });
    await supabaseAdmin().from("calendar_connections").delete().eq("user_id", user.id).eq("provider", provider);
    return res.status(200).json({ ok: true });
  }

  const { data } = await supabaseAdmin().from("calendar_connections").select("provider").eq("user_id", user.id);

  const connected = (data || []).map((r) => r.provider);
  res.status(200).json({ google: connected.includes("google"), microsoft: connected.includes("microsoft") });
}
