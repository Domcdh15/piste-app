import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Logo } from "../lib/ui.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email ou mot de passe incorrect.");
    }
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
      <form
        onSubmit={handleSubmit}
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
        <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "24px" }}>
          Connecte-toi pour accéder à ton pipeline.
        </div>

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
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
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
};
