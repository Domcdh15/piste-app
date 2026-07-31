import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Logo } from "../lib/ui.jsx";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email ou mot de passe incorrect.");
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
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
    setError("");
    setSignupDone(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "0.5px solid var(--hairline)",
          borderRadius: "12px",
          padding: "32px",
          width: "100%",
          maxWidth: "360px",
        }}
      >
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
              Compte créé ! Un email de confirmation vient d'être envoyé à <b style={{ color: "var(--text)" }}>{email}</b>. Clique sur le lien qu'il contient pour activer ton compte et accéder à ton pipeline.
            </div>
            <button className="focusable" onClick={() => switchMode("login")} style={{ width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "10px 14px", fontSize: "14px", fontWeight: 500 }}>
              Retour à la connexion
            </button>
          </div>
        ) : (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "24px" }}>
              {mode === "login" ? "Connecte-toi pour accéder à ton pipeline." : "Crée ton compte et démarre ton essai de 14 jours."}
            </div>

            <form onSubmit={mode === "login" ? handleLogin : handleSignup}>
              {mode === "signup" && (
                <>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>
                    Nom complet
                  </label>
                  <input
                    className="focusable"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Camille Martin"
                    style={{ ...inputStyle, marginBottom: "14px" }}
                  />
                </>
              )}

              <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>
                Email
              </label>
              <input
                className="focusable"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@entreprise.com"
                style={inputStyle}
              />

              <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", margin: "14px 0 6px" }}>
                Mot de passe
              </label>
              <input
                className="focusable"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />

              {error && (
                <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px" }}>{error}</div>
              )}

              <button
                className="focusable"
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  marginTop: "20px",
                  background: "var(--blue-dim)",
                  color: "var(--blue)",
                  border: "0.5px solid #2563eb55",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 500,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: "18px", fontSize: "12.5px", color: "var(--text-dim)" }}>
              {mode === "login" ? (
                <>Pas encore de compte ? <button className="focusable" onClick={() => switchMode("signup")} style={linkStyle}>Créer un compte</button></>
              ) : (
                <>Déjà un compte ? <button className="focusable" onClick={() => switchMode("login")} style={linkStyle}>Se connecter</button></>
              )}
            </div>
          </>
        )}
      </div>
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

const linkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--blue)",
  fontWeight: 600,
  fontSize: "12.5px",
  cursor: "pointer",
};
