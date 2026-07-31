import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Logo } from "../lib/ui.jsx";

const INDUSTRIES = ["Bâtiment / artisanat", "Commerce / retail", "Services aux entreprises", "Santé / bien-être", "Immobilier", "Technologie / SaaS", "Restauration", "Autre"];
const TEAM_SIZES = ["Seul(e)", "2 à 5 personnes", "6 à 20 personnes", "Plus de 20 personnes"];

export default function Login() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "",
    companyName: "", industry: INDUSTRIES[0], teamSize: TEAM_SIZES[0],
    hasCrm: "non", existingCrm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setLoading(false);
    if (error) setError("Email ou mot de passe incorrect.");
  }

  function goToStep2(e) {
    e.preventDefault();
    setStep(2);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          company_name: form.companyName,
          industry: form.industry,
          team_size: form.teamSize,
          existing_crm: form.hasCrm === "oui" ? (form.existingCrm.trim() || "Oui (non précisé)") : "Non",
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message.includes("already registered") ? "Un compte existe déjà avec cet email." : "L'inscription a échoué. Réessaie.");
      return;
    }
    if (!data.session) {
      setSignupDone(true);
    }
  }

  function switchMode(next) {
    setMode(next);
    setStep(1);
    setError("");
    setSignupDone(false);
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

        {signupDone ? (
          <div>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px", lineHeight: 1.6 }}>
              Compte créé ! Un email de confirmation vient d'être envoyé à <b style={{ color: "var(--text)" }}>{form.email}</b>. Clique sur le lien qu'il contient pour activer ton compte et accéder à ton pipeline.
            </div>
            <button className="focusable" onClick={() => switchMode("login")} style={primaryBtnStyle}>
              Retour à la connexion
            </button>
          </div>
        ) : mode === "login" ? (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "24px" }}>Connecte-toi pour accéder à ton pipeline.</div>
            <form onSubmit={handleLogin}>
              <Field label="Email">
                <input className="focusable" type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="toi@entreprise.com" style={inputStyle} />
              </Field>
              <Field label="Mot de passe" style={{ marginTop: "14px" }}>
                <input className="focusable" type="password" required value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" style={inputStyle} />
              </Field>
              {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</div>}
              <button className="focusable" type="submit" disabled={loading} style={{ ...primaryBtnStyle, marginTop: "20px", opacity: loading ? 0.7 : 1 }}>
                {loading ? "..." : "Se connecter"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "18px", fontSize: "12.5px", color: "var(--text-dim)" }}>
              Pas encore de compte ? <button className="focusable" onClick={() => switchMode("signup")} style={linkStyle}>Créer un compte</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <StepDot active={step === 1} done={step > 1} />
              <div style={{ height: "1px", flex: 1, background: "var(--hairline)" }} />
              <StepDot active={step === 2} done={false} />
            </div>

            {step === 1 && (
              <form onSubmit={goToStep2}>
                <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Étape 1/2 — ton compte.</div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Field label="Prénom">
                    <input className="focusable" type="text" required value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Camille" style={inputStyle} />
                  </Field>
                  <Field label="Nom">
                    <input className="focusable" type="text" required value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} placeholder="Martin" style={inputStyle} />
                  </Field>
                </div>
                <Field label="Email" style={{ marginTop: "14px" }}>
                  <input className="focusable" type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="toi@entreprise.com" style={inputStyle} />
                </Field>
                <Field label="Mot de passe" style={{ marginTop: "14px" }}>
                  <input className="focusable" type="password" required minLength={6} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" style={inputStyle} />
                </Field>
                <button className="focusable" type="submit" style={{ ...primaryBtnStyle, marginTop: "20px" }}>
                  Continuer
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleSignup}>
                <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Étape 2/2 — parle-nous de ton entreprise.</div>
                <Field label="Nom de l'entreprise">
                  <input className="focusable" type="text" required value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="Ex : Girard Coiffure" style={inputStyle} />
                </Field>
                <Field label="Secteur d'activité" style={{ marginTop: "14px" }}>
                  <select className="focusable" value={form.industry} onChange={(e) => set({ industry: e.target.value })} style={inputStyle}>
                    {INDUSTRIES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Taille de l'entreprise" style={{ marginTop: "14px" }}>
                  <select className="focusable" value={form.teamSize} onChange={(e) => set({ teamSize: e.target.value })} style={inputStyle}>
                    {TEAM_SIZES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Utilisez-vous déjà un CRM ?" style={{ marginTop: "14px" }}>
                  <select className="focusable" value={form.hasCrm} onChange={(e) => set({ hasCrm: e.target.value })} style={inputStyle}>
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                  </select>
                </Field>
                {form.hasCrm === "oui" && (
                  <Field label="Lequel ?" style={{ marginTop: "14px" }}>
                    <input className="focusable" type="text" value={form.existingCrm} onChange={(e) => set({ existingCrm: e.target.value })} placeholder="Ex : Pipedrive, un tableur..." style={inputStyle} />
                  </Field>
                )}

                {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "14px" }}>{error}</div>}

                <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                  <button type="button" className="focusable" onClick={() => setStep(1)} style={ghostBtnStyle}>Retour</button>
                  <button className="focusable" type="submit" disabled={loading} style={{ ...primaryBtnStyle, flex: 1, opacity: loading ? 0.7 : 1 }}>
                    {loading ? "..." : "Créer mon compte"}
                  </button>
                </div>
              </form>
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

function StepDot({ active, done }) {
  return (
    <span
      style={{
        width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", fontWeight: 700, flexShrink: 0,
        background: active || done ? "var(--blue)" : "var(--panel2)",
        color: active || done ? "#fff" : "var(--text-faint)",
        border: active || done ? "none" : "0.5px solid var(--hairline)",
      }}
    >
      {done ? "✓" : ""}
    </span>
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
  background: "var(--panel2)",
  color: "var(--text-dim)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
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
