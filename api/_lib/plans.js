// Source unique des paliers tarifaires et de leurs quotas IA — utilisé par
// api/team.js (dépassement de sièges) et api/generate.js (plafond IA mensuel).
// maxPrice est un SEUIL HAUT : planTierFor retient le premier palier dont le
// prix payé ne dépasse pas la borne. Ces bornes doivent donc suivre la grille
// publiée — sans quoi un client Équipe à 69 € basculerait dans Business.
//
// Grille au 30 août 2026 : Solo 19 €, Équipe 69 € (5 sièges), Business 129 €
// (10 sièges). Les quotas d'IA sont comptés PAR UTILISATEUR, pas par équipe :
// un Business à dix personnes dispose donc de 6 000 générations par mois.
//
// Ce que ça coûte, au 11 septembre 2026 : api/generate.js appelle Sonnet 5,
// plafonné à 1 000 jetons de réponse, soit au pire un centime la génération.
// Business coûte donc jusqu'à 61 € d'API pour 129 € facturés, Équipe 25 € pour
// 69 €, Solo 3 € pour 19 €. La marge de Business est la plus étroite des
// trois : c'est elle qu'il faut surveiller si les quotas remontent.
//
// Le commentaire précédent annonçait 10 000 générations et 110 € — deux
// chiffres périmés, l'un par un changement de quota, l'autre par un
// changement de modèle. Un raisonnement sur les marges vaut ce que valent
// ses chiffres : les redater à chaque fois que l'un des deux bouge.
// Solo et Équipe sont PLAFONNÉES : au-delà de leur nombre de sièges, il faut
// changer de formule. C'est ce qui rend la grille honnête — sinon Équipe et ses
// sièges supplémentaires reste moins chère que Business à tout effectif jusqu'à
// dix, et la promesse « Business, de 6 à 10 utilisateurs » ne tient pas.
//
// Business garde ses sièges supplémentaires : au-delà de dix personnes, il n'y a
// plus de palier au-dessus vers lequel renvoyer.
export const PLAN_TIERS = [
  { name: "Solo", maxPrice: 19, seats: 1, overagePrice: null, aiQuota: 300, nextTier: "Équipe" },
  { name: "Équipe", maxPrice: 69, seats: 5, overagePrice: null, aiQuota: 500, nextTier: "Business" },
  { name: "Business", maxPrice: 129, seats: 10, overagePrice: 15, aiQuota: 600, nextTier: null },
  { name: "Sur mesure", maxPrice: Infinity, seats: 20, overagePrice: 15, aiQuota: 1500, nextTier: null },
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
