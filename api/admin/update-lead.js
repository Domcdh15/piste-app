import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const { id, contacted } = req.body || {};
  if (!id || typeof contacted !== "boolean") {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("leads")
    .update({ contacted, contacted_at: contacted ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return res.status(500).json({ error: "La mise à jour a échoué" });
  res.status(200).json({ ok: true });
}
