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
    admin.from("user_settings").select("ai_calls_used, ai_calls_reset_at, ai_extra_credits").eq("user_id", user.id).maybeSingle(),
    planPriceForUser(admin, user.id),
  ]);
  const tier = planTierFor(price);
  // Les recharges achetées s'ajoutent au quota du forfait et se remettent à
  // zéro avec lui : une recharge sert le mois où elle est achetée, pas au-delà.
  const extra = settings?.ai_extra_credits || 0;
  const monthlyLimit = tier.aiQuota + extra;

  const now = new Date();
  const resetAt = settings?.ai_calls_reset_at ? new Date(settings.ai_calls_reset_at) : null;
  const needsReset = !resetAt || resetAt <= now;
  const currentUsage = needsReset ? 0 : settings?.ai_calls_used || 0;

  // Alerte à 70 % du quota. Le coût de l'API est le seul poste qui grandit avec
  // l'usage sans que personne ne le voie venir : sans ce repère, un
  // dépassement se découvre sur la facture du mois suivant. Une seule trace par
  // période — le franchissement, pas chaque appel au-delà.
  const seuil = Math.floor(monthlyLimit * 0.7);
  if (currentUsage + 1 === seuil) {
    await admin.from("admin_audit_log").insert({
      target_user_id: user.id,
      action: "quota_ia_70",
      detail: `${seuil} générations sur ${monthlyLimit} (forfait ${tier.name}${extra ? ` + ${extra} de recharge` : ""})`,
    });
  }
  const nextResetAt = needsReset ? new Date(now.getTime() + 30 * 86400000).toISOString() : settings.ai_calls_reset_at;

  if (currentUsage >= monthlyLimit) {
    // On propose une recharge plutôt qu'un changement de forfait : changer de
    // formule pour un seul mois chargé n'a pas de sens, et bloquer net
    // quelqu'un qui se sert de l'outil est le meilleur moyen de le perdre.
    return res.status(429).json({
      error: `Vos ${monthlyLimit} générations du mois sont épuisées`
        + (extra ? ` (${tier.aiQuota} du forfait ${tier.name} + ${extra} de recharge)` : ` (forfait ${tier.name})`)
        + `. Le compteur repart le ${new Date(nextResetAt).toLocaleDateString("fr-FR")}. Vous pouvez demander une recharge de 500 générations depuis l'application.`,
      quotaExhausted: true,
      limit: monthlyLimit,
      resetAt: nextResetAt,
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
