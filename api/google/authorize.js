import { providerConfig } from "../_lib/providers.js";
import { getOrigin } from "../_lib/supabase.js";

export default function handler(req, res) {
  const { token } = req.query;
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
  res.end();
}
