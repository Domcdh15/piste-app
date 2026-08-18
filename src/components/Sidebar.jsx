import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLOSED_STAGES, HomeIcon, TargetIcon, CalendarIcon, SparklesIcon, ListIcon, GearIcon, Logo } from "../lib/ui.jsx";

const NAV_ITEMS = [
  { key: "today", label: "Aujourd'hui", Icon: HomeIcon },
  { key: "pipeline", label: "Opportunités", Icon: TargetIcon },
  { key: "planning", label: "Agenda", Icon: CalendarIcon },
  { key: "assistant", label: "Assistant IA", Icon: SparklesIcon },
  { key: "activities", label: "Activités", Icon: ListIcon },
];

// La sidebar reste volontairement en navy, distincte du reste de l'app (passé en beige clair) —
// ses propres tons neutres sont donc définis ici plutôt que via les tokens globaux (tunés pour fond clair).
const SB_BG = "var(--gradient-identity)";
const SB_BORDER = "rgba(255,255,255,0.08)";
const SB_TEXT = "#FFFFFF";
const SB_TEXT_DIM = "rgba(255,255,255,0.62)";
const SB_TEXT_FAINT = "rgba(255,255,255,0.4)";
const SB_ACCENT = "#00C2FF";
const SB_ACCENT_DIM = "rgba(0,194,255,0.14)";

export default function Sidebar({ activeTab, setActiveTab, prospects = [] }) {
  const [todayCount, setTodayCount] = useState(null);
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
  }, []);

  const pipelineCount = prospects.filter((p) => !CLOSED_STAGES.includes(p.stage)).length;

  const counts = { today: todayCount, pipeline: pipelineCount || null };

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
        background: SB_BG,
        backgroundAttachment: "fixed",
        borderRight: `0.5px solid ${SB_BORDER}`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 14px",
      }}
    >
      <button
        className="focusable"
        onClick={() => setActiveTab("today")}
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", marginBottom: "26px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <Logo size={34} />
        <span className="display" style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.06em", color: SB_TEXT }}>CLOSIA</span>
      </button>

      <nav style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.key;
          const isHovered = hovered === item.key;
          const count = counts[item.key];
          const Icon = item.Icon;
          return (
            <button
              key={item.key}
              className="focusable"
              onClick={() => setActiveTab(item.key)}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13.5px",
                fontWeight: active ? 600 : 500,
                background: active ? SB_ACCENT_DIM : isHovered ? "rgba(255,255,255,0.06)" : "transparent",
                color: active ? SB_ACCENT : SB_TEXT_DIM,
                textAlign: "left",
                border: "none",
                borderLeft: active ? `2px solid ${SB_ACCENT}` : "2px solid transparent",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              <Icon size={15} color={active ? SB_ACCENT : SB_TEXT_FAINT} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {count != null && count > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: active ? SB_ACCENT : SB_TEXT_FAINT,
                    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                    borderRadius: "var(--radius-pill)",
                    padding: "1px 6px",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ height: "0.5px", background: SB_BORDER, margin: "14px 12px" }} />

      <button
        className="focusable"
        onClick={() => setActiveTab("settings")}
        onMouseEnter={() => setHovered("settings")}
        onMouseLeave={() => setHovered(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 12px",
          borderRadius: "8px",
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? SB_ACCENT_DIM : hovered === "settings" ? "rgba(255,255,255,0.06)" : "transparent",
          color: activeTab === "settings" ? SB_ACCENT : SB_TEXT_DIM,
          textAlign: "left",
          border: "none",
          borderLeft: activeTab === "settings" ? `2px solid ${SB_ACCENT}` : "2px solid transparent",
        }}
      >
        <GearIcon size={15} color={activeTab === "settings" ? SB_ACCENT : SB_TEXT_FAINT} />
        Paramètres
      </button>
    </div>
  );
}
