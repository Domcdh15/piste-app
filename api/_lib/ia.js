import { planTierFor, planPriceForUser } from "./plans.js";

// Un seul point d'appel à Claude, partagé par toutes les routes qui en ont
// besoin. Le décompte du quota vit ici et non chez l'appelant : une génération
// lancée depuis la boîte de réception doit coûter exactement ce que coûte une
// génération lancée depuis une fiche. Sans ce point unique, chaque nouvel écran
// devient une porte dérobée vers l'API, sans compteur ni plafond.

export async function appelerClaude(admin, userId, prompt, { maxTokens = 1000 } = {}) {
  const [{ data: settings }, price] = await Promise.all([
    admin.from("user_settings").select("ai_calls_used, ai_calls_reset_at, ai_extra_credits").eq("user_id", userId).maybeSingle(),
    planPriceForUser(admin, userId),
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
      target_user_id: userId,
      action: "quota_ia_70",
      detail: `${seuil} générations sur ${monthlyLimit} (forfait ${tier.name}${extra ? ` + ${extra} de recharge` : ""})`,
    });
  }
  const nextResetAt = needsReset ? new Date(now.getTime() + 30 * 86400000).toISOString() : settings.ai_calls_reset_at;

  if (currentUsage >= monthlyLimit) {
    // On propose une recharge plutôt qu'un changement de forfait : changer de
    // formule pour un seul mois chargé n'a pas de sens, et bloquer net
    // quelqu'un qui se sert de l'outil est le meilleur moyen de le perdre.
    const err = new Error(
      `Vos ${monthlyLimit} générations du mois sont épuisées`
      + (extra ? ` (${tier.aiQuota} du forfait ${tier.name} + ${extra} de recharge)` : ` (forfait ${tier.name})`)
      + `. Le compteur repart le ${new Date(nextResetAt).toLocaleDateString("fr-FR")}. Vous pouvez demander une recharge de 500 générations depuis l'application.`
    );
    err.quotaExhausted = true;
    err.limit = monthlyLimit;
    err.resetAt = nextResetAt;
    throw err;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = new Error("Erreur API Claude");
    err.apiError = true;
    err.details = await response.text();
    throw err;
  }

  const data = await response.json();
  const text = (data.content || [])
    .map((b) => b.text || "")
    .join("\n")
    .trim();

  await admin.from("user_settings").upsert({
    user_id: userId,
    ai_calls_used: currentUsage + 1,
    ai_calls_reset_at: nextResetAt,
  });

  return { text, used: currentUsage + 1, limit: monthlyLimit };
}

// Claude encadre volontiers son JSON de texte ou de balises ```json. Le parseur
// strict échouait dessus, et l'écran affichait « réponse illisible » sur une
// réponse parfaitement correcte.
export function jsonSouple(texte) {
  if (!texte) return null;
  let t = texte.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const debut = t.indexOf("{");
    const fin = t.lastIndexOf("}");
    if (debut === -1 || fin <= debut) return null;
    try {
      return JSON.parse(t.slice(debut, fin + 1));
    } catch {
      return null;
    }
  }
}
