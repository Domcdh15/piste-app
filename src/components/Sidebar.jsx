import { Logo, HomeIcon, FlameIcon, AlertIcon, TargetIcon, UsersIcon, CalendarIcon, SparklesIcon, ListIcon, PlugIcon, GearIcon } from "../lib/ui.jsx";

const NAV_COLOR = "#2a3ed6";
const AI_COLOR = "#7c3aed";
const HOT_COLOR = "#b8862e";
const RISK_COLOR = "#dc2626";

const PRIMARY_ITEMS = [
  { key: "today", label: "Aujourd'hui", Icon: HomeIcon, color: NAV_COLOR },
  { key: "chauds", label: "Chauds", Icon: FlameIcon, color: HOT_COLOR },
  { key: "a-sauver", label: "À sauver", Icon: AlertIcon, color: RISK_COLOR },
  { key: "pipeline", label: "Pipeline", Icon: TargetIcon, color: NAV_COLOR },
  { key: "equipe", label: "Équipe", Icon: UsersIcon, color: NAV_COLOR },
];

const SECONDARY_ITEMS = [
  { key: "planning", label: "Tâches & Agenda", Icon: CalendarIcon, color: NAV_COLOR },
  { key: "assistant", label: "Assistant IA", Icon: SparklesIcon, color: AI_COLOR },
  { key: "activities", label: "Activités", Icon: ListIcon, color: NAV_COLOR },
  { key: "integrations", label: "Intégrations", Icon: PlugIcon, color: NAV_COLOR },
];

const SETTINGS_COLOR = NAV_COLOR;

function NavButton({ item, active, onClick, compact }) {
  const Icon = item.Icon;
  return (
    <button
      className="focusable"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: compact ? "6px 10px" : "7px 10px",
        borderRadius: "9px",
        fontSize: compact ? "12.5px" : "13.5px",
        fontWeight: active ? 600 : 500,
        background: active ? `${item.color}1c` : "transparent",
        color: active ? item.color : "var(--text-dim)",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: compact ? "22px" : "26px",
          height: compact ? "22px" : "26px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: active ? item.color : `${item.color}17`,
          boxShadow: active ? `0 2px 6px ${item.color}55` : "none",
        }}
      >
        <Icon size={compact ? 13 : 15} color={active ? "#fff" : item.color} />
      </span>
      {item.label}
    </button>
  );
}

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

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "18px" }}>
        {PRIMARY_ITEMS.map((item) => (
          <NavButton key={item.key} item={item} active={activeTab === item.key} onClick={() => setActiveTab(item.key)} />
        ))}
      </nav>

      <div style={{ height: "0.5px", background: "var(--hairline)", margin: "0 10px 14px" }} />

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        {SECONDARY_ITEMS.map((item) => (
          <NavButton key={item.key} item={item} active={activeTab === item.key} onClick={() => setActiveTab(item.key)} compact />
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
