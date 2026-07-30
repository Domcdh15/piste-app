import { providerConfig } from "../_lib/providers.js";
import { supabaseAdmin, getUserFromToken, getOrigin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/?calendar_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.status(400).send("Paramètres manquants");

  const user = await getUserFromToken(state);
  if (!user) return res.status(401).send("Session invalide, reconnecte-toi puis réessaie.");

  const cfg = providerConfig("google");
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: `${getOrigin(req)}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) return res.status(500).send("Échec de connexion à Google Calendar.");

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("calendar_connections")
    .select("refresh_token")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  await admin.from("calendar_connections").upsert(
    {
      user_id: user.id,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || existing?.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  res.writeHead(302, { Location: "/?calendar=connected" });
  res.end();
}
