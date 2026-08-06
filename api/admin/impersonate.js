import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";

const APP_URL = "https://piste-app-seven.vercel.app";

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const admin_user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(admin_user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: "userId manquant" });
  }

  const admin = supabaseAdmin();
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

  res.status(200).json({ link: data.properties.action_link });
}
