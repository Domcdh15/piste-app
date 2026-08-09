import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { fetchEventsInRange, ensureFreshToken } from "../_lib/providers.js";

export default async function handler(req, res) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: "Paramètres start/end manquants" });

  const admin = supabaseAdmin();
  const { data: connections } = await admin.from("calendar_connections").select("*").eq("user_id", user.id);

  const events = [];
  const errors = [];

  for (const conn of connections || []) {
    try {
      const accessToken = await ensureFreshToken(admin, conn);
      const providerEvents = await fetchEventsInRange(conn.provider, accessToken, start, end);
      events.push(...providerEvents);
    } catch (e) {
      errors.push({ provider: conn.provider, message: "Échec de récupération" });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  res.status(200).json({ events, errors });
}
