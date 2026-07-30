import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { providerConfig, fetchEventsInRange } from "../_lib/providers.js";

async function ensureFreshToken(admin, conn) {
  if (new Date(conn.expires_at) > new Date(Date.now() + 60000)) return conn.access_token;

  const cfg = providerConfig(conn.provider);
  const body = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  };
  if (conn.provider === "microsoft") body.scope = cfg.scope;

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error("refresh_failed");

  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin
    .from("calendar_connections")
    .update({ access_token: tokens.access_token, expires_at })
    .eq("id", conn.id);

  return tokens.access_token;
}

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
