import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Logo } from "../lib/ui.jsx";

const INDUSTRIES = ["Bâtiment / artisanat", "Commerce / retail", "Services aux entreprises", "Santé / bien-être", "Immobilier", "Technologie / SaaS", "Restauration", "Autre"];
const STEPS = 3;

export default function Login() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [lead, setLead] = useState({ firstName: "", lastName: "", companyName: "", industry: INDUSTRIES[0], email: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  function setLoginField(patch) {
    setLoginForm((f) => ({ ...f, ...patch }));
  }

  function setLeadField(patch) {
    setLead((f) => ({ ...f, ...patch }));
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginForm.email, password: loginForm.password });
    setLoading(false);
    if (error) setError("Email ou mot de passe incorrect.");
  }

  function nextStep(e) {
    e.preventDefault();
    setStep((s) => Math.min(STEPS, s + 1));
  }

  function prevStep() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function submitLead(preference) {
    setError("");
    setLoading(true);
    const { error } = await supabase.from("leads").insert({
      first_name: lead.firstName,
      last_name: lead.lastName,
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      company: lead.companyName,
      industry: lead.industry,
      email: lead.email,
      contact_preference: preference,
    });
    setLoading(false);
    if (error) {
      setError("L'envoi a échoué. Réessaie.");
      return;
    }
    setSubmitted(preference);
  }

  function switchMode(next) {
    setMode(next);
    setStep(1);
    setError("");
    setSubmitted(null);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "32px", width: "100%", maxWidth: "380px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <Logo size={44} />
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "22px", letterSpacing: "0.04em" }}>Clos'IA</div>
            <div style={{ color: "var(--blue)", fontSize: "12px", fontWeight: 500 }}>Mon assistant commercial</div>
          </div>
        </div>

        {mode === "login" ? (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "24px" }}>Connecte-toi pour accéder à ton pipeline.</div>
            <form onSubmit={handleLogin}>
              <Field label="Email">
                <input className="focusable" type="email" required value={loginForm.email} onChange={(e) => setLoginField({ email: e.target.value })} placeholder="toi@entreprise.com" style={inputStyle} />
              </Field>
              <Field label="Mot de passe" style={{ marginTop: "14px" }}>
                <input className="focusable" type="password" required value={loginForm.password} onChange={(e) => setLoginField({ password: e.target.value })} placeholder="••••••••" style={inputStyle} />
              </Field>
              {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</div>}
              <button className="focusable" type="submit" disabled={loading} style={{ ...primaryBtnStyle, marginTop: "20px", opacity: loading ? 0.7 : 1 }}>
                {loading ? "..." : "Se connecter"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "18px", fontSize: "12.5px", color: "var(--text-dim)" }}>
              Pas encore de compte ? <button className="focusable" onClick={() => switchMode("lead")} style={linkStyle}>Découvrir Clos'IA</button>
            </div>
          </>
        ) : submitted ? (
          <div>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>
              {submitted === "rdv"
                ? <>Merci <b style={{ color: "var(--text)" }}>{lead.firstName}</b> ! On te recontacte très vite pour caler un créneau de démo.</>
                : <>Merci <b style={{ color: "var(--text)" }}>{lead.firstName}</b> ! On revient vers toi rapidement par email.</>}
            </div>
            <button className="focusable" onClick={() => switchMode("login")} style={primaryBtnStyle}>
              Retour à la connexion
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px" }}>
              {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
                <span key={n} style={{ flex: 1, height: "4px", borderRadius: "2px", background: n <= step ? "var(--blue)" : "var(--hairline)" }} />
              ))}
            </div>

            {step === 1 && (
              <form onSubmit={nextStep}>
                <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Comment tu t'appelles ?</div>
                <Field label="Prénom">
                  <input className="focusable" type="text" required autoFocus value={lead.firstName} onChange={(e) => setLeadField({ firstName: e.target.value })} placeholder="Camille" style={inputStyle} />
                </Field>
                <Field label="Nom" style={{ marginTop: "14px" }}>
                  <input className="focusable" type="text" required value={lead.lastName} onChange={(e) => setLeadField({ lastName: e.target.value })} placeholder="Martin" style={inputStyle} />
                </Field>
                <button className="focusable" type="submit" style={{ ...primaryBtnStyle, marginTop: "20px" }}>Continuer</button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={nextStep}>
                <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Parle-nous de ton entreprise.</div>
                <Field label="Nom de l'entreprise">
                  <input className="focusable" type="text" required autoFocus value={lead.companyName} onChange={(e) => setLeadField({ companyName: e.target.value })} placeholder="Ex : Girard Coiffure" style={inputStyle} />
                </Field>
                <Field label="Secteur d'activité" style={{ marginTop: "14px" }}>
                  <select className="focusable" value={lead.industry} onChange={(e) => setLeadField({ industry: e.target.value })} style={inputStyle}>
                    {INDUSTRIES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                  <button type="button" className="focusable" onClick={prevStep} style={ghostBtnStyle}>Retour</button>
                  <button className="focusable" type="submit" style={{ ...primaryBtnStyle, flex: 1 }}>Continuer</button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div>
                <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Ta meilleure adresse email.</div>
                <Field label="Email">
                  <input className="focusable" type="email" required autoFocus value={lead.email} onChange={(e) => setLeadField({ email: e.target.value })} placeholder="toi@entreprise.com" style={inputStyle} />
                </Field>

                {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "14px" }}>{error}</div>}

                <div style={{ fontSize: "12px", color: "var(--text-dim)", margin: "20px 0 10px" }}>Comment veux-tu qu'on continue ?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <button
                    className="focusable"
                    disabled={!lead.email || loading}
                    onClick={() => submitLead("rdv")}
                    style={{ ...primaryBtnStyle, opacity: !lead.email || loading ? 0.6 : 1 }}
                  >
                    📅 Prendre rendez-vous
                  </button>
                  <button
                    className="focusable"
                    disabled={!lead.email || loading}
                    onClick={() => submitLead("recontact")}
                    style={{ ...ghostBtnStyle, opacity: !lead.email || loading ? 0.6 : 1 }}
                  >
                    ✉️ Être recontacté(e) par email
                  </button>
                </div>

                <button type="button" className="focusable" onClick={prevStep} style={{ ...linkStyle, marginTop: "16px", display: "block" }}>← Retour</button>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: "18px", fontSize: "12.5px", color: "var(--text-dim)" }}>
              Déjà un compte ? <button className="focusable" onClick={() => switchMode("login")} style={linkStyle}>Se connecter</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ flex: 1, ...style }}>
      <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "14px",
  padding: "9px 12px",
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  width: "100%",
  background: "var(--blue-dim)",
  color: "var(--blue)",
  border: "0.5px solid #2563eb55",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  fontWeight: 500,
};

const ghostBtnStyle = {
  width: "100%",
  background: "var(--panel2)",
  color: "var(--text-dim)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const linkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--blue)",
  fontWeight: 600,
  fontSize: "12.5px",
  cursor: "pointer",
};
