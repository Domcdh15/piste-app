import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLOSED_STAGES, HomeIcon, TargetIcon, CalendarIcon, SparklesIcon, ListIcon, GearIcon } from "../lib/ui.jsx";

const NAV_ITEMS = [
  { key: "today", label: "Aujourd'hui", Icon: HomeIcon },
  { key: "pipeline", label: "Pipeline", Icon: TargetIcon },
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 8px", marginBottom: "26px" }}>
        <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: "var(--blue)", flexShrink: 0 }} />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text)" }}>CLOSIA</span>
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
                padding: "9px 12px",
                borderRadius: "9px",
                fontSize: "13.5px",
                fontWeight: active ? 600 : 500,
                background: active ? "var(--blue)" : isHovered ? "var(--blue-dim)" : "transparent",
                color: active ? "#fff" : "var(--text-dim)",
                textAlign: "left",
                boxShadow: active ? "0 1px 3px rgba(49,92,138,0.35)" : "none",
                transition: "background 150ms ease, color 150ms ease, box-shadow 150ms ease",
              }}
            >
              <Icon size={15} color={active ? "#fff" : "var(--blue)"} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {count != null && count > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: active ? "#fff" : "var(--text-faint)",
                    background: active ? "rgba(255,255,255,0.22)" : "var(--panel2)",
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
          padding: "9px 12px",
          borderRadius: "9px",
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 500,
          background: activeTab === "settings" ? "var(--blue)" : hovered === "settings" ? "var(--blue-dim)" : "transparent",
          color: activeTab === "settings" ? "#fff" : "var(--text-dim)",
          textAlign: "left",
          boxShadow: activeTab === "settings" ? "0 1px 3px rgba(49,92,138,0.35)" : "none",
        }}
      >
        <GearIcon size={15} color={activeTab === "settings" ? "#fff" : "var(--blue)"} />
        Paramètres
      </button>
    </div>
  );
}
