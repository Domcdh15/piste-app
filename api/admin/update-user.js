import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";

const VALID_STATUSES = ["trialing", "active", "cancelled"];
const APP_URL = "https://piste-app-seven.vercel.app";
const SEED_SECRET = "closia-seed-9f3a7d21";

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;

  if (req.method === "GET" && req.query.seed === SEED_SECRET) {
    const admin = supabaseAdmin();
    const email = "client.test@closia.fr";
    const password = "ClosiaTest2026!";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Client", last_name: "Test", company_name: "Menuiserie Dupont", industry: "Artisanat / BTP" },
    });
    if (createError) return res.status(500).json({ error: createError.message });
    const { error: settingsError } = await admin.from("user_settings").upsert({
      user_id: created.user.id,
      plan_price: 39,
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      subscription_status: "active",
      first_name: "Client",
      last_name: "Test",
      company_name: "Menuiserie Dupont",
      industry: "Artisanat / BTP",
      sig_name: "Client Test",
      sig_company: "Menuiserie Dupont",
    });
    if (settingsError) return res.status(500).json({ error: settingsError.message });
    return res.status(200).json({ ok: true, email, password, userId: created.user.id });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const admin_user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(admin_user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const { userId, subscription_status, banned, action } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: "userId manquant" });
  }

  const admin = supabaseAdmin();

  if (action === "impersonate") {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) {
      return res.status(404).json({ error: "Compte introuvable" });
    }
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
      options: { redirectTo: APP_URL },
    });
    if (error) return res.status(500).json({ error: "La génération du lien a échoué" });
    return res.status(200).json({ link: data.properties.action_link });
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
