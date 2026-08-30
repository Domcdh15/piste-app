import crypto from "node:crypto";
import { getUserFromToken, bearerToken, supabaseAdmin, getOrigin } from "./_lib/supabase.js";
import { ensureFreshToken, sendEmail } from "./_lib/providers.js";

// Signature électronique simple d'un document.
//
// Une seule fonction sert les deux côtés, parce qu'ils ne se distinguent que
// par la manière dont l'appelant prouve son identité : le commercial par son
// jeton de session, le signataire par le jeton imprévisible de son lien. Ce
// dernier n'a aucun compte Closia et ne doit pas en créer un — exiger une
// inscription pour signer un devis est le meilleur moyen de ne pas le faire
// signer.
//
// Portée juridique : signature simple au sens d'eIDAS. Valable en droit
// français, mais sans présomption de fiabilité — celle-ci suppose une signature
// qualifiée. En cas de contestation, la preuve incombe à celui qui invoque le
// document : d'où le dossier constitué ici (empreinte du fichier, vérification
// de l'adresse email par code à usage unique, horodatages, adresse IP,
// navigateur). Ne jamais présenter cette signature comme « qualifiée ».

const OTP_TTL_MIN = 15;
const OTP_MAX_ESSAIS = 5;
const BUCKET = "prospect-documents";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const hashCode = (code, token) => crypto.createHash("sha256").update(`${code}:${token}`).digest("hex");

function adresseIp(req) {
  const xff = req.headers["x-forwarded-for"];
  return (Array.isArray(xff) ? xff[0] : (xff || "")).split(",")[0].trim() || null;
}

function masqueEmail(email) {
  const [nom, domaine] = String(email || "").split("@");
  if (!domaine) return "";
  const visible = nom.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(nom.length - 2, 1))}@${domaine}`;
}

// L'email part de la boîte du commercial, jamais d'un expéditeur générique :
// le client reconnaît son interlocuteur. Si la boîte n'est pas reliée, on
// renvoie le lien pour qu'il l'envoie lui-même plutôt que d'échouer.
async function envoyerDepuisLeCommercial(admin, userId, { to, subject, body }) {
  const { data: conn } = await admin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!conn) return false;
  try {
    const accessToken = await ensureFreshToken(admin, conn);
    await sendEmail("google", accessToken, { to, subject, body });
    return true;
  } catch (e) {
    return false;
  }
}

async function chargerParJeton(admin, token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  const { data } = await admin.from("document_signatures").select("*").eq("token", token).maybeSingle();
  return data || null;
}

export default async function handler(req, res) {
  const admin = supabaseAdmin();

  // ---------------------------------------------------------------- création
  if (req.method === "POST" && req.body?.action === "create") {
    const user = await getUserFromToken(bearerToken(req));
    if (!user) return res.status(401).json({ error: "Non authentifié" });

    const { documentId, signerEmail, signerName, message } = req.body;
    if (!documentId || !signerEmail) return res.status(400).json({ error: "Document et adresse du signataire requis" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail)) return res.status(400).json({ error: "Adresse email invalide" });

    const { data: doc } = await admin
      .from("prospect_documents")
      .select("id, user_id, prospect_id, team_id, storage_path, file_name")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: "Document introuvable" });
    if (doc.user_id !== user.id) return res.status(403).json({ error: "Ce document ne vous appartient pas" });

    // L'empreinte est prise maintenant : elle date le fichier tel qu'il a été
    // envoyé, et rend détectable toute substitution ultérieure.
    const { data: fichier, error: dlError } = await admin.storage.from(BUCKET).download(doc.storage_path);
    if (dlError || !fichier) return res.status(500).json({ error: "Le document n'a pas pu être lu" });
    const empreinte = sha256(Buffer.from(await fichier.arrayBuffer()));

    const token = crypto.randomBytes(24).toString("base64url");
    const { error } = await admin.from("document_signatures").insert({
      document_id: doc.id,
      prospect_id: doc.prospect_id,
      user_id: user.id,
      team_id: doc.team_id,
      token,
      signer_email: signerEmail.trim().toLowerCase(),
      signer_name: signerName?.trim() || null,
      message: message?.trim() || null,
      doc_sha256: empreinte,
    });
    if (error) return res.status(500).json({ error: "La demande n'a pas pu être créée" });

    const lien = `${getOrigin(req)}/?sign=${token}`;
    const { data: settings } = await admin
      .from("user_settings")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const expediteur = [settings?.first_name, settings?.last_name].filter(Boolean).join(" ") || "Votre interlocuteur";

    const envoye = await envoyerDepuisLeCommercial(admin, user.id, {
      to: signerEmail,
      subject: `Document à signer : ${doc.file_name}`,
      body: `Bonjour,\n\n${message?.trim() || `${expediteur} vous invite à signer le document « ${doc.file_name} ».`}\n\nVous pouvez le lire et le signer en ligne ici :\n${lien}\n\nAucun compte n'est nécessaire. Un code de vérification vous sera envoyé à cette adresse au moment de signer.\n\n${expediteur}`,
    });

    await admin.from("activities").insert({
      prospect_id: doc.prospect_id,
      user_id: user.id,
      team_id: doc.team_id,
      type: "note",
      note: `Document « ${doc.file_name} » envoyé à ${signerEmail} pour signature`,
    });

    return res.status(200).json({ ok: true, link: lien, emailSent: envoye });
  }

  // ------------------------------------------------------- lecture publique
  if (req.method === "GET") {
    const { token, action } = req.query;
    const sig = await chargerParJeton(admin, token);
    if (!sig) return res.status(404).json({ error: "Ce lien n'est plus valide." });

    const { data: doc } = await admin
      .from("prospect_documents")
      .select("file_name, storage_path, file_size")
      .eq("id", sig.document_id)
      .maybeSingle();

    // Le fichier lui-même, derrière une URL signée de courte durée : le
    // signataire doit pouvoir lire ce qu'il signe.
    if (action === "file") {
      if (!doc) return res.status(404).json({ error: "Document introuvable" });
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
      if (!data?.signedUrl) return res.status(500).json({ error: "Le document n'a pas pu être ouvert" });
      return res.status(200).json({ url: data.signedUrl });
    }

    if (sig.status === "envoye") {
      await admin
        .from("document_signatures")
        .update({ status: "vu", viewed_at: new Date().toISOString() })
        .eq("id", sig.id);
    }

    const { data: settings } = await admin
      .from("user_settings")
      .select("first_name, last_name")
      .eq("user_id", sig.user_id)
      .maybeSingle();
    const { data: team } = sig.team_id
      ? await admin.from("teams").select("company_name").eq("id", sig.team_id).maybeSingle()
      : { data: null };

    return res.status(200).json({
      fileName: doc?.file_name || "Document",
      fileSize: doc?.file_size || null,
      signerEmail: masqueEmail(sig.signer_email),
      signerName: sig.signer_name,
      message: sig.message,
      status: sig.status,
      signedAt: sig.signed_at,
      signedName: sig.signed_name,
      refusedAt: sig.refused_at,
      sender: [settings?.first_name, settings?.last_name].filter(Boolean).join(" ") || null,
      company: team?.company_name || null,
    });
  }

  // ------------------------------------------------------ actions publiques
  if (req.method === "POST") {
    const { token, action } = req.body || {};
    const sig = await chargerParJeton(admin, token);
    if (!sig) return res.status(404).json({ error: "Ce lien n'est plus valide." });
    if (sig.status === "signe") return res.status(400).json({ error: "Ce document est déjà signé." });
    if (sig.status === "annule") return res.status(400).json({ error: "Cette demande a été annulée." });

    if (action === "code") {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      await admin
        .from("document_signatures")
        .update({
          otp_hash: hashCode(code, sig.token),
          otp_expires_at: new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString(),
          otp_attempts: 0,
        })
        .eq("id", sig.id);

      const envoye = await envoyerDepuisLeCommercial(admin, sig.user_id, {
        to: sig.signer_email,
        subject: `Votre code de signature : ${code}`,
        body: `Bonjour,\n\nVoici votre code de vérification pour signer le document :\n\n${code}\n\nIl est valable ${OTP_TTL_MIN} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
      if (!envoye) return res.status(500).json({ error: "Le code n'a pas pu être envoyé. Contactez votre interlocuteur." });
      return res.status(200).json({ ok: true, sentTo: masqueEmail(sig.signer_email) });
    }

    if (action === "sign") {
      const { code, name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Indiquez votre nom." });
      if (!sig.otp_hash || !sig.otp_expires_at) return res.status(400).json({ error: "Demandez d'abord un code." });
      if (new Date(sig.otp_expires_at) < new Date()) return res.status(400).json({ error: "Ce code a expiré. Demandez-en un nouveau." });
      if (sig.otp_attempts >= OTP_MAX_ESSAIS) return res.status(429).json({ error: "Trop d'essais. Demandez un nouveau code." });

      if (hashCode(String(code || ""), sig.token) !== sig.otp_hash) {
        await admin.from("document_signatures").update({ otp_attempts: sig.otp_attempts + 1 }).eq("id", sig.id);
        return res.status(400).json({ error: "Code incorrect." });
      }

      const signeLe = new Date().toISOString();
      await admin
        .from("document_signatures")
        .update({
          status: "signe",
          signed_at: signeLe,
          signed_name: name.trim(),
          signer_ip: adresseIp(req),
          signer_user_agent: String(req.headers["user-agent"] || "").slice(0, 400),
          // Le code a servi : on l'efface pour qu'il ne puisse plus resservir.
          otp_hash: null,
          otp_expires_at: null,
        })
        .eq("id", sig.id);

      const { data: doc } = await admin
        .from("prospect_documents")
        .select("file_name")
        .eq("id", sig.document_id)
        .maybeSingle();

      await admin.from("activities").insert({
        prospect_id: sig.prospect_id,
        user_id: sig.user_id,
        team_id: sig.team_id,
        type: "note",
        note: `Document « ${doc?.file_name || "document"} » signé par ${name.trim()} (${sig.signer_email})`,
      });

      await envoyerDepuisLeCommercial(admin, sig.user_id, {
        to: sig.signer_email,
        subject: `Signature enregistrée : ${doc?.file_name || "document"}`,
        body: `Bonjour,\n\nVotre signature a bien été enregistrée le ${new Date(signeLe).toLocaleString("fr-FR")}.\n\nEmpreinte du document signé (SHA-256) :\n${sig.doc_sha256}\n\nConservez ce message : il fait partie du dossier de preuve.`,
      });

      return res.status(200).json({ ok: true, signedAt: signeLe });
    }

    if (action === "refuse") {
      const { reason } = req.body;
      await admin
        .from("document_signatures")
        .update({
          status: "refuse",
          refused_at: new Date().toISOString(),
          refusal_reason: reason?.trim()?.slice(0, 500) || null,
          signer_ip: adresseIp(req),
        })
        .eq("id", sig.id);

      await admin.from("activities").insert({
        prospect_id: sig.prospect_id,
        user_id: sig.user_id,
        team_id: sig.team_id,
        type: "note",
        note: `Signature refusée par ${sig.signer_email}${reason?.trim() ? ` — ${reason.trim().slice(0, 200)}` : ""}`,
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Action inconnue" });
  }

  res.status(405).json({ error: "Méthode non autorisée" });
}
