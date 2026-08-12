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
        background: "var(--bg)",
        borderRight: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "9px", padding: "0 8px", marginBottom: "26px" }}>
        <Logo size={24} />
        <span className="display" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text)" }}>CLOSIA</span>
      </div>

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
                background: active ? "var(--blue-dim)" : isHovered ? "var(--panel2)" : "transparent",
                color: active ? "var(--blue-300)" : "var(--text-dim)",
                textAlign: "left",
                border: "none",
                borderLeft: active ? "2px solid var(--blue)" : "2px solid transparent",
                boxShadow: active ? "inset 0 0 0 1px rgba(0,194,255,0.15)" : "none",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              <Icon size={15} color={active ? "var(--blue)" : "var(--text-faint)"} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {count != null && count > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: active ? "var(--blue)" : "var(--text-faint)",
                    background: active ? "#fff" : "var(--panel2)",
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

      <div style={{ height: "0.5px", background: "var(--hairline)", margin: "14px 12px" }} />

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
          background: activeTab === "settings" ? "var(--blue-dim)" : hovered === "settings" ? "var(--panel2)" : "transparent",
          color: activeTab === "settings" ? "var(--blue-300)" : "var(--text-dim)",
          textAlign: "left",
          border: "none",
          borderLeft: activeTab === "settings" ? "2px solid var(--blue)" : "2px solid transparent",
        }}
      >
        <GearIcon size={15} color={activeTab === "settings" ? "var(--blue)" : "var(--text-faint)"} />
        Paramètres
      </button>
    </div>
  );
}
