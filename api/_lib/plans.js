// Source unique des paliers tarifaires et de leurs quotas IA — utilisé par
// api/team.js (dépassement de sièges) et api/generate.js (plafond IA mensuel).
export const PLAN_TIERS = [
  { name: "Solo", maxPrice: 19, seats: 1, overagePrice: 12, aiQuota: 100 },
  { name: "Équipe", maxPrice: 39, seats: 3, overagePrice: 12, aiQuota: 300 },
  { name: "Business", maxPrice: 79, seats: 10, overagePrice: 10, aiQuota: 1000 },
  { name: "Sur mesure", maxPrice: Infinity, seats: 20, overagePrice: 8, aiQuota: 3000 },
];

export function planTierFor(price) {
  return PLAN_TIERS.find((t) => price <= t.maxPrice) || PLAN_TIERS[PLAN_TIERS.length - 1];
}

// Résout le tarif applicable à un utilisateur : celui de son équipe s'il en a une,
// sinon son tarif individuel (ou le tarif standard Solo par défaut).
export async function planPriceForUser(admin, userId) {
  const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (membership) {
    const { data: team } = await admin.from("teams").select("plan_price").eq("id", membership.team_id).single();
    if (team?.plan_price != null) return Number(team.plan_price);
  }
  const { data: settings } = await admin.from("user_settings").select("plan_price").eq("user_id", userId).maybeSingle();
  return Number(settings?.plan_price ?? 19);
}
