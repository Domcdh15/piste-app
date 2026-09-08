import { ensureFreshToken, listInboxMessages } from "./providers.js";
import { appelerClaude, jsonSouple } from "./ia.js";

// BOÎTE DE RÉCEPTION — la logique, tenue hors des fonctions serverless.
//
// Elle vit dans _lib et non dans un fichier api/ à elle : le plan Vercel plafonne
// à douze fonctions, et un fichier sous _lib n'en consomme aucune. Les routes
// sont exposées par api/calendar/status.js, qui portait déjà les échanges avec
// Gmail et Outlook.
//
// Trois gestes, et un seul déclenche l'IA :
//   relever            — lit la boîte, range ce qui se range sans IA
//   trier              — demande à l'IA de trancher sur le reste (bouton)
//   proposerColonnes   — demande à l'IA quelles colonnes tenir (bouton)

const JOURS = 14;
const MAX_MESSAGES = 30;
// Plafond par passage : une seule génération doit suffire à trier ce qu'on lui
// donne, et un lot trop gros ferait déborder la réponse avant la fin de la liste.
const MAX_TRI = 15;
const MAX_ECHANTILLON_COLONNES = 10;

// --- Lecture ---------------------------------------------------------------

async function lireBoites(admin, user) {
  const { data: conns } = await admin.from("calendar_connections").select("*").eq("user_id", user.id);
  if (!conns?.length) return { connecte: false, messages: [], erreur: "" };

  const messages = [];
  let erreur = "";

  for (const conn of conns) {
    try {
      const accessToken = await ensureFreshToken(admin, conn);
      const lot = await listInboxMessages(conn.provider, accessToken, { jours: JOURS, maxResults: MAX_MESSAGES });
      for (const m of lot) messages.push({ ...m, provider: conn.provider });
    } catch (e) {
      const scopeManquant = e.status === 403 || /insufficient|scope|permission/i.test(`${e.message} ${e.detail || ""}`);
      // Une boîte en échec ne doit pas masquer l'autre : on retient l'erreur et
      // on continue.
      erreur = scopeManquant
        ? `Permission de lecture manquante — déconnectez puis reconnectez ${conn.provider === "google" ? "Google" : "Outlook"} dans Intégrations pour autoriser la lecture de la boîte.`
        : "La relève de la boîte a échoué. Réessayez dans un instant.";
    }
  }

  messages.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
  return { connecte: true, messages, erreur };
}

// Ce qu'on sait déjà sans rien demander à l'IA : qui est client, qui a été mis
// de côté, et quelle est l'adresse de l'utilisateur lui-même.
async function contexteTri(admin, user) {
  const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", user.id).maybeSingle();
  const teamId = membership?.team_id || null;

  let q = admin.from("prospects").select("id, name, company, email").not("email", "is", null);
  // Un client suivi par un collègue reste un client : c'est l'équipe qui fait
  // foi quand il y en a une.
  q = teamId ? q.eq("team_id", teamId) : q.eq("user_id", user.id);

  const [{ data: prospects }, { data: ignores }] = await Promise.all([
    q,
    admin.from("inbox_senders_ignores").select("pattern").eq("user_id", user.id),
  ]);

  const parEmail = new Map();
  for (const p of prospects || []) {
    const cle = (p.email || "").trim().toLowerCase();
    if (cle && !parEmail.has(cle)) parEmail.set(cle, p);
  }

  return {
    teamId,
    parEmail,
    motifsIgnores: (ignores || []).map((i) => (i.pattern || "").toLowerCase()).filter(Boolean),
    moi: (user.email || "").toLowerCase(),
  };
}

function estIgnore(adresse, motifs) {
  return motifs.some((m) => (m.startsWith("@") ? adresse.endsWith(m) : adresse === m));
}

// Catégories que Gmail a déjà tranchées. Les rejouer avec l'IA coûterait une
// génération pour réapprendre ce qui est écrit sur l'étiquette.
const CATEGORIES_PAS_CLIENT = { promotions: "Gmail l'a classé en Promotions", "réseaux sociaux": "Gmail l'a classé en Réseaux sociaux", spam: "Gmail l'a classé en Spam" };

export async function relever(admin, user) {
  const { connecte, messages, erreur } = await lireBoites(admin, user);
  if (!connecte) return { notConnected: true, messages: [] };

  const ctx = await contexteTri(admin, user);

  const nouveaux = [];
  for (const m of messages) {
    // Un message qu'on s'est envoyé à soi-même n'a rien à faire dans une liste
    // de demandes entrantes.
    if (!m.from || m.from === ctx.moi) continue;

    const ligne = {
      user_id: user.id,
      team_id: ctx.teamId,
      provider: m.provider,
      message_id: m.id,
      sender_email: m.from,
      sender_name: m.fromName || null,
      subject: m.subject || null,
      received_at: m.receivedAt,
      verdict: "a_trier",
      verdict_source: null,
      raison: null,
    };

    const client = ctx.parEmail.get(m.from);
    if (estIgnore(m.from, ctx.motifsIgnores)) {
      ligne.verdict = "pas_client";
      ligne.verdict_source = "expediteur_ignore";
      ligne.raison = "Expéditeur que vous avez mis de côté.";
    } else if (client) {
      ligne.verdict = "demande";
      ligne.verdict_source = "expediteur_connu";
      ligne.raison = `Déjà dans vos opportunités${client.company ? ` — ${client.company}` : ""}.`;
      ligne.prospect_id = client.id;
    } else if (CATEGORIES_PAS_CLIENT[m.category]) {
      ligne.verdict = "pas_client";
      ligne.verdict_source = "categorie";
      ligne.raison = `${CATEGORIES_PAS_CLIENT[m.category]}.`;
    }

    nouveaux.push(ligne);
  }

  if (nouveaux.length) {
    // ignoreDuplicates : une relève ne réécrit jamais un verdict déjà posé.
    // Sans ça, un message trié à la main serait remis « à trier » au prochain
    // passage, et le tri ne tiendrait jamais.
    await admin.from("inbox_messages").upsert(nouveaux, {
      onConflict: "user_id,provider,message_id",
      ignoreDuplicates: true,
    });
  }

  // L'erreur d'une boîte accompagne les lignes déjà connues plutôt que de
  // remplacer l'écran : ce qui a été trié hier reste consultable aujourd'hui.
  return { messages: await lignesVivantes(admin, user, messages), erreur };
}

// Les lignes en base, remises dans l'ordre de la boîte, avec l'extrait du
// message rattaché en mémoire — jamais enregistré.
async function lignesVivantes(admin, user, messages) {
  const depuis = new Date(Date.now() - JOURS * 86400000).toISOString();
  const { data: lignes } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .gte("received_at", depuis)
    .order("received_at", { ascending: false });

  const extraits = new Map(messages.map((m) => [m.id, m.snippet || ""]));
  return (lignes || []).map((l) => ({ ...l, extrait: extraits.get(l.message_id) || "" }));
}

// --- Tri par l'IA ----------------------------------------------------------

function activiteDe(settings) {
  const morceaux = [settings?.industry, settings?.company_name].filter((v) => v && String(v).trim());
  return morceaux.length ? morceaux.join(" — ") : "non précisée";
}

function colonnesDe(settings) {
  const brut = settings?.inbox_columns;
  if (!Array.isArray(brut)) return [];
  return brut.map((c) => (typeof c === "string" ? c : c?.nom)).filter(Boolean).slice(0, 8);
}

function bloc(m, i) {
  return [
    `### Message ${i + 1}`,
    `id: ${m.id}`,
    `De: ${m.fromName ? `${m.fromName} <${m.from}>` : m.from}`,
    `Objet: ${m.subject || "(sans objet)"}`,
    `Texte: ${(m.body || m.snippet || "").replace(/\s+/g, " ").trim() || "(vide)"}`,
  ].join("\n");
}

export async function trier(admin, user) {
  const { connecte, messages, erreur } = await lireBoites(admin, user);
  if (!connecte) return { notConnected: true };
  if (erreur && messages.length === 0) return { erreur };

  const { data: lignes } = await admin
    .from("inbox_messages")
    .select("id, message_id, provider")
    .eq("user_id", user.id)
    .eq("verdict", "a_trier")
    .is("archived_at", null);

  const parMessageId = new Map((lignes || []).map((l) => [l.message_id, l]));
  const aTrier = messages.filter((m) => parMessageId.has(m.id)).slice(0, MAX_TRI);
  if (aTrier.length === 0) return { tries: 0, restants: 0 };

  const { data: settings } = await admin
    .from("user_settings").select("first_name, industry, company_name, inbox_columns")
    .eq("user_id", user.id).maybeSingle();
  const colonnes = colonnesDe(settings);

  const prompt = [
    `Tu tries la boîte de réception professionnelle de ${settings?.first_name || "l'utilisateur"}.`,
    `Son activité : ${activiteDe(settings)}.`,
    "",
    "Pour chaque message, choisis un verdict :",
    `- "demande" : une vraie personne attend quelque chose de lui — un projet, un devis, une question, une relance, une négociation, une réponse à un échange en cours.`,
    `- "pas_client" : tout le reste — newsletter, publicité, notification automatique, facture d'un fournisseur, réseau social, démarchage, candidature spontanée.`,
    "",
    "Dans le doute, choisis \"demande\" : une vraie demande perdue coûte plus cher qu'une newsletter à écarter à la main.",
    "",
    "Donne aussi une raison, en une phrase courte, qui cite ce qui, dans le message, t'a décidé.",
    colonnes.length
      ? [
          "",
          `Pour les messages classés "demande", remplis ces colonnes à partir du texte : ${colonnes.map((c) => `"${c}"`).join(", ")}.`,
          "N'invente jamais une valeur : si le message ne la donne pas, laisse la chaîne vide. Un budget ou une date inventés dans un suivi valent moins que rien.",
        ].join("\n")
      : "",
    "",
    "Réponds uniquement par cet objet JSON, sans commentaire autour :",
    `{"resultats":[{"id":"<id du message>","verdict":"demande|pas_client","raison":"…"${colonnes.length ? ',"champs":{"' + colonnes[0] + '":"…"}' : ""}}]}`,
    "",
    "Les messages :",
    "",
    aTrier.map(bloc).join("\n\n"),
  ].filter(Boolean).join("\n");

  const { text, used, limit } = await appelerClaude(admin, user.id, prompt, { maxTokens: 2000 });
  const parse = jsonSouple(text);
  const resultats = Array.isArray(parse?.resultats) ? parse.resultats : null;
  if (!resultats) return { erreur: "La réponse de l'IA n'a pas pu être lue. Réessayez.", used, limit };

  const attendus = new Set(colonnes);
  let tries = 0;

  for (const r of resultats) {
    const ligne = parMessageId.get(String(r?.id || ""));
    if (!ligne) continue;
    const verdict = r.verdict === "pas_client" ? "pas_client" : r.verdict === "demande" ? "demande" : null;
    if (!verdict) continue;

    // On ne garde que les colonnes que l'utilisateur a validées : une colonne
    // inventée par l'IA au passage n'apparaîtrait dans aucun en-tête.
    const champs = {};
    if (verdict === "demande" && r.champs && typeof r.champs === "object") {
      for (const [k, v] of Object.entries(r.champs)) {
        if (attendus.has(k) && v != null && String(v).trim()) champs[k] = String(v).trim().slice(0, 200);
      }
    }

    await admin.from("inbox_messages").update({
      verdict,
      verdict_source: "ia",
      raison: r.raison ? String(r.raison).slice(0, 300) : null,
      champs,
    }).eq("id", ligne.id);
    tries++;
  }

  const restants = Math.max(0, (lignes?.length || 0) - tries);
  return { tries, restants, used, limit };
}

// --- Proposition de colonnes ----------------------------------------------
//
// La question « quelles données mettre dans le tableau ? » n'a pas de réponse
// générique : elle dépend de ce que les clients écrivent vraiment. On la pose
// donc aux emails eux-mêmes plutôt qu'à un modèle de CRM tout fait.

export async function proposerColonnes(admin, user) {
  const { connecte, messages, erreur } = await lireBoites(admin, user);
  if (!connecte) return { notConnected: true };
  if (messages.length === 0) return { erreur: erreur || "Aucun message récent à analyser dans votre boîte." };

  const { data: lignes } = await admin
    .from("inbox_messages").select("message_id, verdict")
    .eq("user_id", user.id).eq("verdict", "demande");
  const demandes = new Set((lignes || []).map((l) => l.message_id));

  // On préfère les messages déjà reconnus comme des demandes : ce sont eux qui
  // portent les informations à suivre. À défaut, on prend la boîte telle quelle.
  const retenus = messages.filter((m) => demandes.has(m.id));
  const echantillon = (retenus.length >= 3 ? retenus : messages).slice(0, MAX_ECHANTILLON_COLONNES);

  const { data: settings } = await admin
    .from("user_settings").select("first_name, industry, company_name")
    .eq("user_id", user.id).maybeSingle();

  const prompt = [
    `Voici les derniers messages reçus par ${settings?.first_name || "un professionnel"}, dont l'activité est : ${activiteDe(settings)}.`,
    "",
    "Il veut suivre ses demandes dans un tableau, mais il ne sait pas quelles colonnes y mettre.",
    "",
    "Propose entre 4 et 6 colonnes, déduites de ce que ces messages contiennent réellement — pas de ce qu'un CRM générique proposerait.",
    "Une colonne ne vaut d'être tenue que si la plupart de ces messages permettent de la remplir : une colonne vide neuf fois sur dix est une colonne à ne pas créer.",
    "N'inclus ni l'expéditeur, ni l'objet, ni la date : ils sont déjà dans le tableau.",
    "",
    "Pour chaque colonne, donne son nom (deux ou trois mots) et, en une phrase, ce qui dans les messages la justifie.",
    "",
    "Réponds uniquement par cet objet JSON, sans commentaire autour :",
    `{"colonnes":[{"nom":"…","pourquoi":"…"}]}`,
    "",
    "Les messages :",
    "",
    echantillon.map(bloc).join("\n\n"),
  ].join("\n");

  const { text, used, limit } = await appelerClaude(admin, user.id, prompt, { maxTokens: 1200 });
  const parse = jsonSouple(text);
  const brut = Array.isArray(parse?.colonnes) ? parse.colonnes : null;
  if (!brut) return { erreur: "La réponse de l'IA n'a pas pu être lue. Réessayez.", used, limit };

  const colonnes = brut
    .map((c) => ({ nom: String(c?.nom || "").trim().slice(0, 40), pourquoi: String(c?.pourquoi || "").trim().slice(0, 200) }))
    .filter((c) => c.nom)
    .slice(0, 8);

  return { colonnes, analyses: echantillon.length, used, limit };
}
