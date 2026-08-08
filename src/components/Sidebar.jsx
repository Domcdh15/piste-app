import { Logo, HomeIcon, TargetIcon, CalendarIcon, SparklesIcon, ListIcon, PlugIcon, GearIcon } from "../lib/ui.jsx";

const NAV_COLOR = "#2a3ed6";
const AI_COLOR = "#7c3aed";

const NAV_GROUPS = [
  {
    section: null,
    items: [{ key: "today", label: "Aujourd'hui", Icon: HomeIcon, color: NAV_COLOR }],
  },
  {
    section: "Pipeline commercial",
    items: [
      { key: "pipeline", label: "Pipeline", Icon: TargetIcon, color: NAV_COLOR },
      { key: "planning", label: "Tâches & Agenda", Icon: CalendarIcon, color: NAV_COLOR },
    ],
  },
  {
    section: "Suivi & IA",
    items: [
      { key: "assistant", label: "Assistant IA", Icon: SparklesIcon, color: AI_COLOR },
      { key: "activities", label: "Activités", Icon: ListIcon, color: NAV_COLOR },
    ],
  },
  {
    section: "Configuration",
    items: [{ key: "integrations", label: "Intégrations", Icon: PlugIcon, color: NAV_COLOR }],
  },
];

const SETTINGS_COLOR = NAV_COLOR;

export default function Sidebar({ activeTab, setActiveTab }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "26px", paddingLeft: "2px" }}>
        <Logo size={32} />
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.02em" }}>Closia</div>
          <div style={{ color: "var(--blue)", fontSize: "10px", fontWeight: 500 }}>L'assistant du commercial</div>
        </div>
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
                const Icon = item.Icon;
                return (
                  <button
                    key={item.key}
                    className="focusable"
                    onClick={() => setActiveTab(item.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "7px 10px",
                      borderRadius: "9px",
                      fontSize: "13.5px",
                      fontWeight: active ? 600 : 500,
                      background: active ? `${item.color}1c` : "transparent",
                      color: active ? item.color : "var(--text-dim)",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        background: active ? item.color : `${item.color}17`,
                        boxShadow: active ? `0 2px 6px ${item.color}55` : "none",
                      }}
                    >
                      <Icon size={15} color={active ? "#fff" : item.color} />
                    </span>
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
          padding: "7px 10px",
          borderRadius: "9px",
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? `${SETTINGS_COLOR}1c` : "transparent",
          color: activeTab === "settings" ? SETTINGS_COLOR : "var(--text-dim)",
          textAlign: "left",
          marginTop: "12px",
        }}
      >
        <span
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: activeTab === "settings" ? SETTINGS_COLOR : `${SETTINGS_COLOR}17`,
            boxShadow: activeTab === "settings" ? `0 2px 6px ${SETTINGS_COLOR}55` : "none",
          }}
        >
          <GearIcon size={15} color={activeTab === "settings" ? "#fff" : SETTINGS_COLOR} />
        </span>
        Paramètres
      </button>
    </div>
  );
}
