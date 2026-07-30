import { CalendarIcon, PhoneIcon, MailIcon, TargetIcon, CheckIcon, getFirstName } from "../lib/ui.jsx";

function todayLabel() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export default function Today({ prospects, setActiveTab, session }) {
  const nbAppels = prospects.filter((p) => p.status === "appeler").length;
  const nbRelances = prospects.filter((p) => p.status === "relancer").length;
  const nbRetard = prospects.filter((p) => p.status === "retard").length;
  const nbOpportunites = prospects.filter((p) => p.priority >= 75).length;
  const firstName = getFirstName(session.user);

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, #2f5bff, #1d3fc4)",
          color: "#fff",
          padding: "32px 32px 26px",
        }}
      >
        <div className="display" style={{ fontWeight: 700, fontSize: "32px", display: "flex", alignItems: "center", gap: "10px" }}>
          Bonjour{firstName ? ` ${firstName}` : ""} <span>👋</span>
        </div>
        <div style={{ opacity: 0.85, fontSize: "14px", marginTop: "6px", marginBottom: "18px" }}>{todayLabel()}</div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, opacity: 0.95, marginBottom: "10px" }}>
          📋 Missions du jour
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
          <Pill icon="📞" text={`${nbAppels} appel(s)`} />
          <Pill icon="🗓️" text="0 RDV" />
          <Pill icon="🔁" text={`${nbRelances} relance(s)`} />
          <Pill icon="🎯" text={`${nbOpportunites} opportunité(s)`} />
        </div>
        <div style={{ fontSize: "13px", opacity: 0.9 }}>
          💡 Conseil du jour : {nbRetard > 0
            ? `Tu as ${nbRetard} prospect(s) en retard — commence par ceux-là avant d'enchaîner sur tes relances.`
            : "Commencez par vos relances en attente, puis enchaînez avec vos appels planifiés pour maximiser vos conversions."}
        </div>
      </div>

      <div style={{ padding: "28px 32px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "14px" }}>
          <StatTile accent="var(--blue)" icon={<CalendarIcon size={15} color="var(--blue)" />} label="RDV Aujourd'hui" value={0} />
          <StatTile accent="#7c3aed" icon={<PhoneIcon size={15} color="#7c3aed" />} label="Appels à faire" value={nbAppels} onClick={() => setActiveTab("pipeline")} />
          <StatTile accent="var(--amber)" icon={<MailIcon size={15} color="var(--amber)" />} label="Emails en attente" value={nbRelances} onClick={() => setActiveTab("pipeline")} />
          <StatTile accent="#0ea968" icon={<TargetIcon size={15} color="#0ea968" />} label="Opportunités prioritaires" value={nbOpportunites} onClick={() => setActiveTab("pipeline")} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginBottom: "22px" }}>
          <StatTile accent="var(--blue)" icon={<CalendarIcon size={15} color="var(--blue)" />} label="Agenda du jour" value={0} />
          <StatTile accent="#7c3aed" icon={<CheckIcon size={15} color="#7c3aed" />} label="Mes tâches" value={0} />
        </div>

        <button
          className="focusable"
          onClick={() => setActiveTab("pipeline")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "transparent",
            border: "none",
            padding: "10px 2px",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "18px" }}>📁</span>
          <span className="display" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>Sales Pipeline</span>
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>Vue d'ensemble de vos prospects</span>
        </button>
      </div>
    </div>
  );
}

function Pill({ icon, text }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(255,255,255,0.14)",
        border: "0.5px solid rgba(255,255,255,0.25)",
        borderRadius: "999px",
        padding: "6px 12px",
        fontSize: "13px",
        fontWeight: 500,
      }}
    >
      <span>{icon}</span>
      {text}
    </div>
  );
}

function StatTile({ accent, icon, label, value, onClick }) {
  return (
    <button
      className="focusable"
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        background: "var(--panel)",
        border: "0.5px solid var(--hairline)",
        borderTop: `2.5px solid ${accent}`,
        borderRadius: "10px",
        padding: "16px 18px",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon}
        <span className="display" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)" }}>{label}</span>
      </div>
      <span
        className="mono"
        style={{
          background: "var(--panel2)",
          color: accent,
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 700,
          padding: "2px 9px",
        }}
      >
        {value}
      </span>
    </button>
  );
}
