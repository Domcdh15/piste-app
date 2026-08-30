import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";
import { postSlack } from "./_lib/slack.js";

// Slack et Notion, réservés aux formules Équipe et Business.
//
// Aucune inscription développeur n'est nécessaire de notre côté : chaque client
// fournit lui-même son identifiant — une adresse de webhook entrant pour Slack,
// un jeton d'intégration interne pour Notion. C'est ce qui rend ces deux
// intégrations gratuites et immédiates, là où un parcours OAuth demanderait une
// application déclarée chez chaque éditeur.
//
// Les identifiants ne quittent jamais le serveur : ils vivent dans la table
// team_integrations, qui n'a aucune politique de lecture cliente.

const MIN_PRICE = 39;
const NOTION_VERSION = "2022-06-28";

async function contexte(userId) {
  const admin = supabaseAdmin();
  const { data: membership } = await admin.from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (!membership) return { erreur: "Aucune équipe associée à ce compte", code: 404 };

  const [{ data: team }, { data: integ }] = await Promise.all([
    admin.from("teams").select("plan_price, company_name").eq("id", membership.team_id).single(),
    admin.from("team_integrations").select("*").eq("team_id", membership.team_id).maybeSingle(),
  ]);

  if (Number(team?.plan_price ?? 19) < MIN_PRICE) {
    return { erreur: "Les intégrations Slack et Notion sont incluses à partir de la formule Équipe.", code: 403 };
  }
  return { admin, membership, team, integ: integ || {} };
}

// Le nom de la propriété titre change d'une base Notion à l'autre (« Name »,
// « Nom », « Titre »…). On lit le schéma pour le trouver plutôt que de parier.
async function proprieteTitre(token, databaseId) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.code === "object_not_found"
        ? "Base introuvable. Vérifiez l'identifiant, et que la base est bien partagée avec votre intégration Notion."
        : data?.message || "Notion a refusé la requête"
    );
  }
  const entree = Object.entries(data.properties || {}).find(([, v]) => v.type === "title");
  if (!entree) throw new Error("Cette base Notion n'a pas de propriété titre.");
  return entree[0];
}

function blocsTexte(contenu) {
  return String(contenu || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 90)
    .map((p) => ({
      object: "block",
      type: "paragraph",
      // Notion refuse au-delà de 2000 caractères par fragment de texte.
      paragraph: { rich_text: [{ type: "text", text: { content: p.slice(0, 2000) } }] },
    }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const ctx = await contexte(user.id);
  if (ctx.erreur) return res.status(ctx.code).json({ error: ctx.erreur });
  const { integ } = ctx;

  const { action } = req.body || {};

  if (action === "slack_test") {
    if (!integ.slack_webhook_url) return res.status(400).json({ error: "Aucun canal Slack configuré" });
    try {
      await postSlack(integ.slack_webhook_url, "Closia est bien relié à ce canal. Le point du matin arrivera ici chaque jour.");
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(400).json({ error: `Slack a refusé le message : ${e.message}` });
    }
  }

  if (action === "notion_export") {
    if (!integ.notion_token || !integ.notion_database_id) {
      return res.status(400).json({ error: "Notion n'est pas configuré" });
    }
    const { title, content, prospectId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Titre manquant" });

    try {
      const champTitre = await proprieteTitre(integ.notion_token, integ.notion_database_id);
      const pageRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integ.notion_token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: integ.notion_database_id },
          properties: { [champTitre]: { title: [{ text: { content: title.slice(0, 200) } }] } },
          children: blocsTexte(content),
        }),
      });
      const page = await pageRes.json();
      if (!pageRes.ok) throw new Error(page?.message || "Notion a refusé la page");

      if (prospectId) {
        await ctx.admin.from("activities").insert({
          prospect_id: prospectId,
          user_id: user.id,
          team_id: ctx.membership.team_id,
          type: "note",
          note: `Exporté vers Notion : ${title.slice(0, 120)}`,
        });
      }
      return res.status(200).json({ ok: true, url: page.url || null });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.status(400).json({ error: "Action inconnue" });
}
