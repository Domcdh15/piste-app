import { supabaseAdmin, getUserFromToken, bearerToken } from "../_lib/supabase.js";
import { ensureFreshToken, sendEmail } from "../_lib/providers.js";

// L'envoi d'email vit ici (et non dans son propre fichier) pour rester sous la limite
// de 12 fonctions serverless du plan Vercel Hobby — voir les autres endpoints calendar/*.
export default async function handler(req, res) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  if (req.method === "POST") {
    const { action, provider, to, subject, body } = req.body || {};

    if (action === "send_email") {
      if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });
      if (!to || !body) return res.status(400).json({ error: "Destinataire ou message manquant" });

      const admin = supabaseAdmin();
      const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!conn) return res.status(400).json({ error: `Aucune connexion ${provider} — connecte ton compte dans Intégrations.` });

      try {
        const accessToken = await ensureFreshToken(admin, conn);
        await sendEmail(provider, accessToken, { to, subject, body });
        return res.status(200).json({ ok: true });
      } catch (e) {
        const insufficientScope = /insufficient|scope|permission/i.test(e.message || "");
        return res.status(500).json({
          error: insufficientScope
            ? `Permission d'envoi manquante — déconnecte puis reconnecte ${provider === "google" ? "Google Calendar" : "Outlook Calendar"} dans Intégrations pour autoriser l'envoi d'email.`
            : "L'envoi a échoué. Réessaie.",
        });
      }
    }

    if (!["google", "microsoft"].includes(provider)) return res.status(400).json({ error: "Fournisseur invalide" });
    await supabaseAdmin().from("calendar_connections").delete().eq("user_id", user.id).eq("provider", provider);
    return res.status(200).json({ ok: true });
  }

  const { data } = await supabaseAdmin().from("calendar_connections").select("provider").eq("user_id", user.id);

  const connected = (data || []).map((r) => r.provider);
  res.status(200).json({ google: connected.includes("google"), microsoft: connected.includes("microsoft") });
}
