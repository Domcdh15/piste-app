import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";
import { planTierFor, planPriceForUser } from "./_lib/plans.js";

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

  const admin = supabaseAdmin();
  const [{ data: settings }, price] = await Promise.all([
    admin.from("user_settings").select("ai_calls_used, ai_calls_reset_at").eq("user_id", user.id).maybeSingle(),
    planPriceForUser(admin, user.id),
  ]);
  const tier = planTierFor(price);
  const monthlyLimit = tier.aiQuota;

  const now = new Date();
  const resetAt = settings?.ai_calls_reset_at ? new Date(settings.ai_calls_reset_at) : null;
  const needsReset = !resetAt || resetAt <= now;
  const currentUsage = needsReset ? 0 : settings?.ai_calls_used || 0;
  const nextResetAt = needsReset ? new Date(now.getTime() + 30 * 86400000).toISOString() : settings.ai_calls_reset_at;

  if (currentUsage >= monthlyLimit) {
    return res.status(429).json({
      error: `Limite de ${monthlyLimit} générations IA (forfait ${tier.name}) atteinte pour ce mois. Réessaie après le ${new Date(nextResetAt).toLocaleDateString("fr-FR")}, ou passe à un forfait supérieur dans Paramètres.`,
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "Erreur API Claude", details: errText });
    }

    const data = await response.json();
    const text = (data.content || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    await admin.from("user_settings").upsert({
      user_id: user.id,
      ai_calls_used: currentUsage + 1,
      ai_calls_reset_at: nextResetAt,
    });

    res.status(200).json({ text, aiCallsUsed: currentUsage + 1, aiCallsLimit: monthlyLimit });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur" });
  }
}
