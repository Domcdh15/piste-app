import { providerConfig } from "../_lib/providers.js";
import { supabaseAdmin, getUserFromToken, getOrigin } from "../_lib/supabase.js";

// Les deux temps de la connexion Google vivent dans ce seul fichier — l'aller
// (rediriger vers l'écran de consentement) et le retour (échanger le code contre
// des jetons) — pour rester sous le plafond de fonctions du plan Vercel.
//
// Le fichier garde volontairement le nom « callback » : c'est cette URL exacte
// qui est déclarée comme URI de redirection autorisée dans la console Google
// Cloud. La renommer obligerait à modifier la configuration Google et couperait
// les connexions le temps de la propagation.
//
//   ?token=<jeton de session>  → aller  : on part vers Google
//   ?code=…&state=…            → retour : Google nous renvoie le code
export default async function handler(req, res) {
  const { code, state, error, token } = req.query;

  if (error) return res.redirect(`/?calendar_error=${encodeURIComponent(error)}`);

  // Aller : aucune réponse de Google encore, on lance le consentement.
  if (!code) {
    if (!token) return res.status(400).send("Session manquante — reconnecte-toi puis réessaie.");

    const cfg = providerConfig("google");
    if (!cfg.clientId) return res.status(500).send("GOOGLE_CLIENT_ID non configuré côté serveur.");

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: `${getOrigin(req)}/api/google/callback`,
      response_type: "code",
      scope: cfg.scope,
      state: token,
      ...cfg.extraAuthParams,
    });
    res.writeHead(302, { Location: `${cfg.authUrl}?${params}` });
    return res.end();
  }

  // Retour : Google a validé, on échange le code contre les jetons.
  if (!state) return res.status(400).send("Paramètres manquants");

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
  if (!tokenRes.ok) {
    return res
      .status(500)
      .send(`Échec de connexion à Google Calendar : ${tokens.error || "erreur inconnue"} — ${tokens.error_description || "pas de détail"}`);
  }

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
