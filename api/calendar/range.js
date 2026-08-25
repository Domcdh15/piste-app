import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { fetchEventsInRange, ensureFreshToken, startOfDayISO, endOfDayISO } from "../_lib/providers.js";

// Sans paramètres start/end, renvoie les événements du jour — l'ancien endpoint
// /api/calendar/today, fusionné ici pour rester sous la limite de fonctions Vercel.
export default async function handler(req, res) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const start = req.query.start || startOfDayISO();
  const end = req.query.end || endOfDayISO();

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
