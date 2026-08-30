import { useEffect, useState } from "react";

// Page publique de signature. Elle vit hors de l'application : le signataire
// n'a pas de compte, n'en crée pas, et n'a donc ni barre latérale ni session.
// Son jeton, dans l'adresse, tient lieu d'identification.

const carte = {
  background: "var(--panel)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "14px",
  padding: "26px",
  maxWidth: "540px",
  width: "100%",
  boxShadow: "var(--shadow-md)",
};

const champ = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "14px",
  padding: "10px 12px",
};

const bouton = (principal) => ({
  fontSize: "13.5px",
  fontWeight: 600,
  padding: "10px 18px",
  borderRadius: "9px",
  border: principal ? "none" : "0.5px solid var(--hairline)",
  background: principal ? "var(--blue)" : "var(--panel2)",
  color: principal ? "#fff" : "var(--text-dim)",
});

function formatTaille(o) {
  if (!o) return "";
  if (o < 1024) return `${o} o`;
  if (o < 1048576) return `${Math.round(o / 1024)} Ko`;
  return `${(o / 1048576).toFixed(1)} Mo`;
}

export default function Sign({ token }) {
  const [doc, setDoc] = useState(undefined);
  const [etape, setEtape] = useState("lecture");
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    fetch(`/api/sign?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => setDoc(ok ? d : null))
      .catch(() => setDoc(null));
  }, [token]);

  async function appel(corps) {
    const res = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...corps }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "L'opération a échoué");
    return data;
  }

  async function ouvrirDocument() {
    setErreur("");
    try {
      const res = await fetch(`/api/sign?token=${encodeURIComponent(token)}&action=file`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, "_blank", "noopener");
    } catch (e) {
      setErreur(e.message || "Le document n'a pas pu être ouvert.");
    }
  }

  async function demanderCode() {
    if (!nom.trim()) return setErreur("Indiquez votre nom avant de continuer.");
    setBusy(true); setErreur(""); setInfo("");
    try {
      const d = await appel({ action: "code" });
      setInfo(`Un code à six chiffres vient d'être envoyé à ${d.sentTo}.`);
      setEtape("code");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function signer() {
    setBusy(true); setErreur("");
    try {
      await appel({ action: "sign", code: code.trim(), name: nom.trim() });
      setDoc((d) => ({ ...d, status: "signe", signedAt: new Date().toISOString(), signedName: nom.trim() }));
      setEtape("lecture");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function refuser() {
    setBusy(true); setErreur("");
    try {
      await appel({ action: "refuse", reason: motif });
      setDoc((d) => ({ ...d, status: "refuse", refusedAt: new Date().toISOString() }));
      setEtape("lecture");
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cadre = { minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" };

  if (doc === undefined) {
    return <div style={{ ...cadre, color: "var(--text-dim)", fontSize: "14px" }}>Chargement du document...</div>;
  }

  if (doc === null) {
    return (
      <div style={cadre}>
        <div style={carte}>
          <div className="display" style={{ fontWeight: 700, fontSize: "17px", marginBottom: "8px" }}>Lien invalide</div>
          <div style={{ fontSize: "13.5px", color: "var(--text-dim)", lineHeight: 1.6 }}>
            Ce lien de signature n'existe plus, ou il a été remplacé. Demandez-en un nouveau à votre interlocuteur.
          </div>
        </div>
      </div>
    );
  }

  const signe = doc.status === "signe";
  const refuse = doc.status === "refuse";

  return (
    <div style={cadre}>
      <div style={carte}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: "10px" }}>
          {doc.company ? doc.company.toUpperCase() : "SIGNATURE EN LIGNE"}
        </div>

        <div className="display" style={{ fontWeight: 700, fontSize: "19px", marginBottom: "4px", lineHeight: 1.3 }}>{doc.fileName}</div>
        <div style={{ fontSize: "12.5px", color: "var(--text-faint)", marginBottom: "18px" }}>
          {[doc.sender && `Envoyé par ${doc.sender}`, formatTaille(doc.fileSize)].filter(Boolean).join(" · ")}
        </div>

        {doc.message && (
          <div style={{ fontSize: "13.5px", color: "var(--text-dim)", lineHeight: 1.6, background: "var(--panel2)", borderRadius: "9px", padding: "13px 15px", marginBottom: "18px" }}>
            {doc.message}
          </div>
        )}

        <button className="focusable" onClick={ouvrirDocument} style={{ ...bouton(false), width: "100%", marginBottom: "18px" }}>
          Lire le document
        </button>

        {signe ? (
          <div style={{ background: "var(--blue-dim)", borderRadius: "9px", padding: "15px", fontSize: "13.5px", color: "var(--blue-deep)", lineHeight: 1.6 }}>
            <strong>Signé.</strong> {doc.signedName ? `Par ${doc.signedName}, le ` : "Le "}
            {new Date(doc.signedAt).toLocaleString("fr-FR")}. Un récapitulatif vient de vous être envoyé par email — conservez-le, il fait partie du dossier de preuve.
          </div>
        ) : refuse ? (
          <div style={{ background: "var(--panel2)", borderRadius: "9px", padding: "15px", fontSize: "13.5px", color: "var(--text-dim)", lineHeight: 1.6 }}>
            Vous avez refusé de signer ce document. Votre interlocuteur en a été informé.
          </div>
        ) : etape === "refus" ? (
          <>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "6px" }}>
              Motif (facultatif)
            </label>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} style={{ ...champ, marginBottom: "14px", resize: "vertical" }} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="focusable" disabled={busy} onClick={() => setEtape("lecture")} style={bouton(false)}>Annuler</button>
              <button className="focusable" disabled={busy} onClick={refuser} style={{ ...bouton(true), background: "var(--red)" }}>Confirmer le refus</button>
            </div>
          </>
        ) : etape === "code" ? (
          <>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "6px" }}>
              Code de vérification
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="mono"
              style={{ ...champ, letterSpacing: "0.3em", fontSize: "18px", textAlign: "center", marginBottom: "12px" }}
            />
            <div style={{ fontSize: "11.5px", color: "var(--text-faint)", lineHeight: 1.55, marginBottom: "14px" }}>
              En saisissant ce code, vous signez le document au nom de <strong>{nom}</strong>. La date, votre adresse IP et votre navigateur
              sont enregistrés avec la signature.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="focusable" disabled={busy} onClick={() => setEtape("lecture")} style={bouton(false)}>Retour</button>
              <button className="focusable" disabled={busy || code.length !== 6} onClick={signer} style={bouton(true)}>
                {busy ? "..." : "Signer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "6px" }}>
              Votre nom et prénom
            </label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...champ, marginBottom: "12px" }} />
            <div style={{ fontSize: "11.5px", color: "var(--text-faint)", lineHeight: 1.55, marginBottom: "16px" }}>
              Un code de vérification sera envoyé à {doc.signerEmail} pour confirmer que c'est bien vous.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="focusable" disabled={busy} onClick={() => setEtape("refus")} style={bouton(false)}>Refuser</button>
              <button className="focusable" disabled={busy} onClick={demanderCode} style={bouton(true)}>
                {busy ? "..." : "Recevoir le code"}
              </button>
            </div>
          </>
        )}

        {erreur && <div style={{ fontSize: "12.5px", color: "var(--red)", marginTop: "12px", lineHeight: 1.5 }}>{erreur}</div>}
        {info && !erreur && <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "12px" }}>{info}</div>}

        <div style={{ fontSize: "10.5px", color: "var(--text-faint)", marginTop: "20px", lineHeight: 1.5, borderTop: "0.5px solid var(--hairline)", paddingTop: "14px" }}>
          Signature électronique simple. Closia conserve l'empreinte du document, la vérification de votre adresse email,
          l'horodatage, votre adresse IP et votre navigateur.
        </div>
      </div>
    </div>
  );
}
