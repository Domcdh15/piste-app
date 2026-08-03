import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser } from "../_lib/supabase.js";

const VALID_STATUSES = ["trialing", "active", "cancelled"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const admin_user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(admin_user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const { userId, subscription_status, banned } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: "userId manquant" });
  }

  const admin = supabaseAdmin();

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
