import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";
import { appelerClaude } from "./_lib/ia.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Prompt manquant" });
  }

  try {
    const { text, used, limit } = await appelerClaude(supabaseAdmin(), user.id, prompt);
    res.status(200).json({ text, aiCallsUsed: used, aiCallsLimit: limit });
  } catch (e) {
    if (e.quotaExhausted) {
      return res.status(429).json({ error: e.message, quotaExhausted: true, limit: e.limit, resetAt: e.resetAt });
    }
    if (e.apiError) {
      return res.status(500).json({ error: "Erreur API Claude", details: e.details });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
}
