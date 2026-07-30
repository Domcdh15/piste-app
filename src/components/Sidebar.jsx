import { getInitials } from "../lib/ui.jsx";

const NAV_ITEMS = [
  { key: "today", label: "Aujourd'hui", emoji: "🏠" },
  { key: "agenda", label: "Agenda", emoji: "🗓️" },
  { key: "pipeline", label: "Pipeline", emoji: "🎯" },
  { key: "opportunities", label: "Opportunités", emoji: "💼" },
  { key: "tasks", label: "Tâches", emoji: "✅" },
  { key: "assistant", label: "Assistant IA", emoji: "☕" },
  { key: "activities", label: "Activités", emoji: "⚡" },
  { key: "integrations", label: "Intégrations", emoji: "🔌" },
];

export default function Sidebar({ activeTab, setActiveTab, userEmail }) {
  return (
    <div
      style={{
        width: "220px",
        minWidth: "220px",
        minHeight: "100vh",
        background: "var(--bg)",
        borderRight: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <div
        className="mono"
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          background: "var(--blue-dim)",
          color: "var(--blue)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 700,
          marginBottom: "28px",
          border: "0.5px solid #2563eb40",
        }}
        title={userEmail}
      >
        {getInitials(userEmail?.split("@")[0]?.replace(/[._]/g, " "))}
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className="focusable"
            onClick={() => setActiveTab(item.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 10px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: activeTab === item.key ? 600 : 500,
              background: activeTab === item.key ? "var(--blue-dim)" : "transparent",
              color: activeTab === item.key ? "var(--blue)" : "var(--text-dim)",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: "15px" }}>{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <button
        className="focusable"
        onClick={() => setActiveTab("settings")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "9px 10px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? "var(--blue-dim)" : "transparent",
          color: activeTab === "settings" ? "var(--blue)" : "var(--text-dim)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "15px" }}>⚙️</span>
        Paramètres
      </button>
    </div>
  );
}
