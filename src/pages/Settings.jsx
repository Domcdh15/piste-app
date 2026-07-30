import { supabase } from "../lib/supabaseClient";

export default function Settings({ session }) {
  return (
    <div style={{ padding: "28px 32px 48px", maxWidth: "480px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "20px" }}>⚙️ Paramètres</div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "4px" }}>COMPTE</div>
        <div style={{ fontSize: "14px", marginBottom: "2px" }}>{session.user.email}</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>Connecté via Supabase</div>
      </div>

      <button
        className="focusable"
        onClick={() => supabase.auth.signOut()}
        style={{ background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55", borderRadius: "8px", padding: "9px 14px", fontSize: "13px" }}
      >
        Se déconnecter
      </button>
    </div>
  );
}
