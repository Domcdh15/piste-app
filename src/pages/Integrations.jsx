import { useEffect, useState } from "react";

const COMING_SOON = [
  { key: "gmail", label: "Gmail", desc: "Lire et envoyer des emails depuis Piste.", permissions: "Lecture et envoi d'emails" },
  { key: "hubspot", label: "HubSpot", desc: "Synchroniser vos contacts et deals HubSpot.", permissions: "Lecture/écriture contacts et deals" },
  { key: "pipedrive", label: "Pipedrive", desc: "Synchroniser votre pipeline Pipedrive.", permissions: "Lecture/écriture pipeline" },
  { key: "salesforce", label: "Salesforce", desc: "Synchroniser comptes, contacts et opportunités.", permissions: "Lecture/écriture CRM" },
  { key: "aircall", label: "Aircall", desc: "Logger automatiquement vos appels.", permissions: "Historique d'appels" },
  { key: "stripe", label: "Stripe", desc: "Suivre les paiements liés à vos deals gagnés.", permissions: "Lecture des paiements" },
  { key: "notion", label: "Notion", desc: "Exporter comptes-rendus et notes vers Notion.", permissions: "Écriture dans un espace Notion" },
];

export default function Integrations({ session }) {
  const [status, setStatus] = useState({ google: false, microsoft: false });
  const [loading, setLoading] = useState(true);
  const [infoKey, setInfoKey] = useState(null);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
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
    <div style={{ padding: "28px 32px 48px", maxWidth: "680px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "4px" }}>🔌 Intégrations</div>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Connecte tes outils en quelques clics.</div>

      <IntegrationRow
        emoji="📅"
        label="Google Calendar"
        desc="Voir vos rendez-vous du jour directement dans Piste."
        connected={status.google}
        loading={loading}
        onConnect={() => connect("google")}
        onDisconnect={() => disconnect("google")}
        permissions="Lecture de l'agenda (calendar.readonly)"
      />
      <IntegrationRow
        emoji="📆"
        label="Outlook / Microsoft"
        desc="Voir vos rendez-vous du jour directement dans Piste."
        connected={status.microsoft}
        loading={loading}
        onConnect={() => connect("microsoft")}
        onDisconnect={() => disconnect("microsoft")}
        permissions="Lecture de l'agenda (Calendars.Read)"
      />

      {COMING_SOON.map((tool) => (
        <IntegrationRow
          key={tool.key}
          emoji="🧩"
          label={tool.label}
          desc={tool.desc}
          comingSoon
          onInfo={() => setInfoKey(infoKey === tool.key ? null : tool.key)}
          showInfo={infoKey === tool.key}
          permissions={tool.permissions}
        />
      ))}
    </div>
  );
}

function IntegrationRow({ emoji, label, desc, connected, loading, onConnect, onDisconnect, comingSoon, onInfo, showInfo, permissions }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "20px" }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="display" style={{ fontWeight: 600, fontSize: "14px" }}>{label}</span>
            {!comingSoon && !loading && (
              <span className="mono" style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", color: connected ? "#0ea968" : "var(--text-faint)", background: connected ? "#e2f7ec" : "var(--panel2)" }}>
                {connected ? "CONNECTÉ" : "NON CONNECTÉ"}
              </span>
            )}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "2px" }}>{desc}</div>
        </div>

        {comingSoon ? (
          <button className="focusable" onClick={onInfo} style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", whiteSpace: "nowrap" }}>
            Bientôt disponible
          </button>
        ) : loading ? (
          <span style={{ color: "var(--text-faint)", fontSize: "12px" }}>...</span>
        ) : connected ? (
          <button className="focusable" onClick={onDisconnect} style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55", whiteSpace: "nowrap" }}>
            Déconnecter
          </button>
        ) : (
          <button className="focusable" onClick={onConnect} style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", whiteSpace: "nowrap" }}>
            Connecter
          </button>
        )}
      </div>

      {(showInfo || (!comingSoon && connected)) && (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "0.5px solid var(--hairline)", fontSize: "11px", color: "var(--text-faint)" }}>
          {comingSoon ? (
            <>Nécessite la création d'une app développeur chez {label} (clé API/OAuth) — dis-moi si tu veux qu'on la mette en place. Permissions prévues : {permissions}</>
          ) : (
            <>Permissions utilisées : {permissions}</>
          )}
        </div>
      )}
    </div>
  );
}
