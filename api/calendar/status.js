import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";

export default async function handler(req, res) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const { data } = await supabaseAdmin().from("calendar_connections").select("provider").eq("user_id", user.id);

  const connected = (data || []).map((r) => r.provider);
  res.status(200).json({ google: connected.includes("google"), microsoft: connected.includes("microsoft") });
}
