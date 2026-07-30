import { providerConfig } from "../_lib/providers.js";
import { getOrigin } from "../_lib/supabase.js";

export default function handler(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).send("Session manquante — reconnecte-toi puis réessaie.");

  const cfg = providerConfig("microsoft");
  if (!cfg.clientId) return res.status(500).send("MICROSOFT_CLIENT_ID non configuré côté serveur.");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${getOrigin(req)}/api/microsoft/callback`,
    response_type: "code",
    response_mode: "query",
    scope: cfg.scope,
    state: token,
    ...cfg.extraAuthParams,
  });
  res.writeHead(302, { Location: `${cfg.authUrl}?${params}` });
  res.end();
}
