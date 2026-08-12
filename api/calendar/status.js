import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { ensureFreshToken, sendEmail, listRecentMessages, setGmailSignature } from "../_lib/providers.js";

function buildVacationReply(s) {
  const lines = [(s.vacation_message || "").trim() || "Je suis actuellement absent(e)."];
  if (s.vacation_return_at) {
    lines.push(`Je serai de retour le ${new Date(s.vacation_return_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`);
  }
  if (s.vacation_redirect_name || s.vacation_redirect_email) {
    lines.push(`En cas d'urgence, vous pouvez contacter ${[s.vacation_redirect_name, s.vacation_redirect_email && `(${s.vacation_redirect_email})`].filter(Boolean).join(" ")}.`);
  }
  return lines.join("\n\n");
}

async function runVacationCheck(admin) {
  const { data: rows } = await admin.from("user_settings").select("*").eq("vacation_mode_enabled", true);
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
// fichier) pour rester sous la limite de 12 fonctions serverless du plan Vercel Hobby.
export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.action === "vacation_check") {
    const auth = req.headers.authorization || "";
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Non autorisé" });
    }
    const repliesSent = await runVacationCheck(supabaseAdmin());
    return res.status(200).json({ ok: true, repliesSent });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  if (req.method === "POST") {
    const { action, provider, to, subject, body, signature } = req.body || {};

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

    if (action === "send_email") {
      if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });
      if (!to || !body) return res.status(400).json({ error: "Destinataire ou message manquant" });

      const admin = supabaseAdmin();
      const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return res.status(400).json({ error: `Aucune connexion ${provider} — connecte ton compte dans Intégrations.` });

      try {
        const accessToken = await ensureFreshToken(admin, conn);
        await sendEmail(provider, accessToken, { to, subject, body });
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
