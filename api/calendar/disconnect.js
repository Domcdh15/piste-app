import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const { provider } = req.body || {};
  if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });

  await supabaseAdmin().from("calendar_connections").delete().eq("user_id", user.id).eq("provider", provider);
  res.status(200).json({ ok: true });
}
