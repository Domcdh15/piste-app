import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLOSED_STAGES, HomeIcon, TargetIcon, CalendarIcon, SparklesIcon, ListIcon, TicketIcon, GearIcon, Logo } from "../lib/ui.jsx";

const NAV_ITEMS = [
  { key: "today", label: "Aujourd'hui", Icon: HomeIcon },
  { key: "pipeline", label: "Opportunités", Icon: TargetIcon },
  { key: "planning", label: "Agenda", Icon: CalendarIcon },
  { key: "tickets", label: "Tickets", Icon: TicketIcon },
  { key: "assistant", label: "Assistant IA", Icon: SparklesIcon },
  { key: "activities", label: "Activités", Icon: ListIcon },
];

const SB_BORDER = "var(--hairline)";
const SB_TEXT_DIM = "var(--text-dim)";
const SB_TEXT_FAINT = "var(--text-faint)";

export default function Sidebar({ activeTab, setActiveTab, prospects = [], hasTickets = false, open = false, onNavigate }) {
  // Naviguer referme le tiroir : sans ça il resterait ouvert par-dessus la
  // page qu'on vient de demander.
  const go = (tab) => { setActiveTab(tab); onNavigate?.(); };
  const [todayCount, setTodayCount] = useState(null);
  const [ticketCount, setTicketCount] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("done", false)
      .lte("due_at", endOfToday.toISOString())
      .then(({ count }) => setTodayCount(count ?? null));

    if (hasTickets) supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["nouveau", "en_cours", "attente_client"])
      .then(({ count }) => setTicketCount(count ?? null));
  }, [hasTickets]);

  const pipelineCount = prospects.filter((p) => !CLOSED_STAGES.includes(p.stage)).length;

  const counts = { today: todayCount, pipeline: pipelineCount || null, tickets: ticketCount || null };

  return (
    <div
      className={`app-sidebar${open ? " is-open" : ""}`}
      style={{ background: "var(--panel)", borderRight: `0.5px solid ${SB_BORDER}` }}
    >
      <button
        className="focusable"
        onClick={() => go("today")}
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", marginBottom: "34px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <Logo size={30} />
        <span className="display" style={{ fontSize: "15.5px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text)" }}>Closia</span>
      </button>

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        {NAV_ITEMS.filter((item) => item.key !== "tickets" || hasTickets).map((item) => {
          const active = activeTab === item.key;
          const isHovered = hovered === item.key;
          const count = counts[item.key];
          const Icon = item.Icon;
          return (
            <button
              key={item.key}
              className="focusable"
              onClick={() => go(item.key)}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                padding: "9px 12px 9px 16px",
                borderRadius: "10px",
                fontSize: "13.5px",
                fontWeight: active ? 600 : 500,
                background: active ? "var(--blue-dim)" : isHovered ? "var(--panel2)" : "transparent",
                color: active ? "var(--blue)" : SB_TEXT_DIM,
                textAlign: "left",
                border: "none",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              {active && (
                <span style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "3px", borderRadius: "0 3px 3px 0", background: "var(--blue)" }} />
              )}
              <Icon size={15} color={active ? "var(--blue)" : SB_TEXT_FAINT} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {count != null && count > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: active ? "var(--blue)" : SB_TEXT_FAINT,
                    background: active ? "rgba(36,107,254,0.12)" : "var(--panel2)",
                    borderRadius: "var(--radius-pill)",
                    padding: "1px 7px",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ height: "0.5px", background: SB_BORDER, margin: "18px 4px" }} />

      <button
        className="focusable"
        onClick={() => go("settings")}
        onMouseEnter={() => setHovered("settings")}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "11px",
          padding: "9px 12px 9px 16px",
          borderRadius: "10px",
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? "var(--blue-dim)" : hovered === "settings" ? "var(--panel2)" : "transparent",
          color: activeTab === "settings" ? "var(--blue)" : SB_TEXT_DIM,
          textAlign: "left",
          border: "none",
        }}
      >
        {activeTab === "settings" && (
          <span style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "3px", borderRadius: "0 3px 3px 0", background: "var(--blue)" }} />
        )}
        <GearIcon size={15} color={activeTab === "settings" ? "var(--blue)" : SB_TEXT_FAINT} />
        Paramètres
      </button>
    </div>
  );
}
