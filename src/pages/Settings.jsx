import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getFirstName, inputStyle, selectStyle } from "../lib/ui.jsx";

export default function Settings({ session }) {
  const [status, setStatus] = useState({ google: false, microsoft: false });
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState(session.user.user_metadata?.first_name || getFirstName(session.user));
  const [lastName, setLastName] = useState(session.user.user_metadata?.last_name || "");
  const [civility, setCivility] = useState(session.user.user_metadata?.civility || "-");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    await supabase.auth.updateUser({ data: { first_name: firstName.trim(), last_name: lastName.trim(), civility } });
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  }

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setStatus({ google: !!data.google, microsoft: !!data.microsoft });
    } catch (e) {
      // silencieux — l'état reste "non connecté"
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function disconnect(provider) {
    await fetch("/api/calendar/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ provider }),
    });
    loadStatus();
  }

  function connect(provider) {
    window.location.href = `/api/${provider}/authorize?token=${encodeURIComponent(session.access_token)}`;
  }

  return (
    <div style={{ padding: "28px 32px 48px", maxWidth: "480px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "20px" }}>⚙️ Paramètres</div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "4px" }}>COMPTE</div>
        <div style={{ fontSize: "14px", marginBottom: "2px" }}>{session.user.email}</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>Connecté via Supabase</div>
      </div>

      <form onSubmit={saveProfile} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "10px" }}>PROFIL</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
          <div>
            <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>CIVILITÉ</div>
            <select value={civility} onChange={(e) => setCivility(e.target.value)} style={selectStyle}>
              <option value="-">-</option>
              <option value="Monsieur">Monsieur</option>
              <option value="Madame">Madame</option>
            </select>
          </div>
          <div>
            <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>PRÉNOM</div>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>NOM</div>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
        </div>
        <button type="submit" disabled={savingProfile} className="focusable" style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 14px", fontSize: "13px" }}>
          {profileSaved ? "Enregistré" : savingProfile ? "Enregistrement..." : "Enregistrer le profil"}
        </button>
      </form>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "10px" }}>AGENDA</div>
        <CalendarRow
          label="Google Calendar"
          connected={status.google}
          loading={loading}
          onConnect={() => connect("google")}
          onDisconnect={() => disconnect("google")}
        />
        <CalendarRow
          label="Outlook / Microsoft"
          connected={status.microsoft}
          loading={loading}
          onConnect={() => connect("microsoft")}
          onDisconnect={() => disconnect("microsoft")}
        />
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

function CalendarRow({ label, connected, loading, onConnect, onDisconnect }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ fontSize: "13px" }}>{label}</div>
      {loading ? (
        <span style={{ color: "var(--text-faint)", fontSize: "12px" }}>...</span>
      ) : connected ? (
        <button
          className="focusable"
          onClick={onDisconnect}
          style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55" }}
        >
          Déconnecter
        </button>
      ) : (
        <button
          className="focusable"
          onClick={onConnect}
          style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55" }}
        >
          Connecter
        </button>
      )}
    </div>
  );
}
