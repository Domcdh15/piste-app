import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";
import { PLAN_TIERS } from "../_lib/plans.js";

const VALID_STATUSES = ["trialing", "active", "cancelled"];
const APP_URL = "https://piste-app-seven.vercel.app";

// Un compte gratuit (is_comped) garde le prix "représentatif" de sa formule en base,
// pour hériter des bons quotas IA/sièges via planTierFor — l'UI l'affiche comme "Gratuit"
// plutôt que ce montant.
const COMPED_TIER_NAMES = { solo: "Solo", equipe: "Équipe", business: "Business" };

function randomPassword() {
  return `Closia-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const admin_user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(admin_user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const { userId, subscription_status, banned, action } = req.body || {};
  const admin = supabaseAdmin();

  if (action === "create_client") {
    const { email, password, firstName, lastName, companyName, tier } = req.body || {};
    if (!email || !firstName || !lastName || !companyName) {
      return res.status(400).json({ error: "Email, prénom, nom et entreprise sont requis" });
    }
    const tierName = COMPED_TIER_NAMES[tier] || "Solo";
    const planTier = PLAN_TIERS.find((t) => t.name === tierName);

    const finalPassword = password || randomPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, company_name: companyName },
    });
    if (createError) return res.status(500).json({ error: createError.message });
    const { error: settingsError } = await admin.from("user_settings").upsert({
      user_id: created.user.id,
      plan_price: planTier.maxPrice,
      is_comped: true,
      subscription_status: "active",
      first_name: firstName,
      last_name: lastName,
      company_name: companyName,
      sig_name: `${firstName} ${lastName}`,
      sig_company: companyName,
    });
    if (settingsError) return res.status(500).json({ error: settingsError.message });

    let setPasswordLink = null;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (!linkError && linkData?.properties?.hashed_token) {
      setPasswordLink = `${APP_URL}/?recovery_token=${linkData.properties.hashed_token}`;
    }

    return res.status(200).json({ ok: true, email, password: finalPassword, userId: created.user.id, setPasswordLink, tier: tierName });
  }

  if (!userId) {
    return res.status(400).json({ error: "userId manquant" });
  }

  if (action === "impersonate") {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) {
      return res.status(404).json({ error: "Compte introuvable" });
    }
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });
    if (error) return res.status(500).json({ error: "La génération du lien a échoué" });
    const link = `${APP_URL}/?impersonate_token=${data.properties.hashed_token}`;
    return res.status(200).json({ link });
  }

  if (action === "set_team") {
    const { role, teamId } = req.body;
    if (!["admin", "sales", "customer_success"].includes(role)) {
      return res.status(400).json({ error: "Rôle invalide" });
    }
    let targetTeamId = teamId;
    if (!targetTeamId) {
      const { data: team, error: teamError } = await admin.from("teams").insert({}).select().single();
      if (teamError) return res.status(500).json({ error: "La création de l'équipe a échoué" });
      targetTeamId = team.id;
    }
    const { error } = await admin
      .from("team_members")
      .upsert({ team_id: targetTeamId, user_id: userId, role }, { onConflict: "team_id,user_id" });
    if (error) return res.status(500).json({ error: "L'attribution de l'équipe a échoué" });
    return res.status(200).json({ ok: true, teamId: targetTeamId });
  }

  if (subscription_status !== undefined) {
    if (!VALID_STATUSES.includes(subscription_status)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    const { error } = await admin.from("user_settings").update({ subscription_status }).eq("user_id", userId);
    if (error) return res.status(500).json({ error: "La mise à jour du statut a échoué" });
  }

  if (banned !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: banned ? "876000h" : "none",
    });
    if (error) return res.status(500).json({ error: "La mise à jour du compte a échoué" });
  }

  res.status(200).json({ ok: true });
}
