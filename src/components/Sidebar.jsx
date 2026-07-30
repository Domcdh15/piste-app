const NAV_GROUPS = [
  {
    section: null,
    items: [{ key: "today", label: "Aujourd'hui", emoji: "🏠" }],
  },
  {
    section: "Pipeline commercial",
    items: [
      { key: "pipeline", label: "Pipeline", emoji: "🎯" },
      { key: "planning", label: "Tâches & Agenda", emoji: "🗓️" },
    ],
  },
  {
    section: "Suivi & IA",
    items: [
      { key: "assistant", label: "Assistant IA", emoji: "☕" },
      { key: "activities", label: "Activités", emoji: "⚡" },
    ],
  },
  {
    section: "Configuration",
    items: [{ key: "integrations", label: "Intégrations", emoji: "🔌" }],
  },
];

export default function Sidebar({ activeTab, setActiveTab, userEmail }) {
  return (
    <div
      style={{
        width: "224px",
        minWidth: "224px",
        height: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        overflowY: "auto",
        background: "var(--bg)",
        borderRight: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <div style={{ marginBottom: "26px", paddingLeft: "2px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.02em" }}>Clos'IA</div>
        <div style={{ color: "var(--blue)", fontSize: "10px", fontWeight: 500 }}>Mon assistant commercial</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "18px", flex: 1 }}>
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            {group.section && (
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.04em", textTransform: "uppercase", padding: "0 10px 6px" }}>
                {group.section}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {group.items.map((item) => {
                const active = activeTab === item.key;
                return (
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
                      fontSize: "13.5px",
                      fontWeight: active ? 600 : 500,
                      background: active ? "var(--blue-dim)" : "transparent",
                      color: active ? "var(--blue)" : "var(--text-dim)",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "15px" }}>{item.emoji}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
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
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? "var(--blue-dim)" : "transparent",
          color: activeTab === "settings" ? "var(--blue)" : "var(--text-dim)",
          textAlign: "left",
          marginTop: "12px",
        }}
      >
        <span style={{ fontSize: "15px" }}>⚙️</span>
        Paramètres
      </button>
    </div>
  );
}
