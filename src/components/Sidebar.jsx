import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLOSED_STAGES } from "../lib/ui.jsx";

const NAV_ITEMS = [
  { key: "today", label: "Aujourd'hui" },
  { key: "pipeline", label: "Pipeline" },
  { key: "planning", label: "Agenda" },
  { key: "assistant", label: "Assistant IA" },
  { key: "activities", label: "Activités" },
];

export default function Sidebar({ activeTab, setActiveTab, prospects = [] }) {
  const [todayCount, setTodayCount] = useState(null);

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
        width: "212px",
        minWidth: "212px",
        height: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        overflowY: "auto",
        background: "var(--bg)",
        borderRight: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        padding: "28px 16px",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)", padding: "0 10px", marginBottom: "28px" }}>
        CLOSIA
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "1px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.key;
          const count = counts[item.key];
          return (
            <button
              key={item.key}
              className="focusable"
              onClick={() => setActiveTab(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "8px 10px",
                borderRadius: "6px",
                fontSize: "13.5px",
                fontWeight: active ? 600 : 400,
                background: active ? "var(--panel2)" : "transparent",
                color: active ? "var(--text)" : "var(--text-dim)",
                textAlign: "left",
                borderLeft: active ? "2px solid var(--blue)" : "2px solid transparent",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              <span>{item.label}</span>
              {count != null && count > 0 && (
                <span className="mono" style={{ fontSize: "11px", color: active ? "var(--text-dim)" : "var(--text-faint)" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ height: "0.5px", background: "var(--hairline)", margin: "16px 10px" }} />

      <button
        className="focusable"
        onClick={() => setActiveTab("settings")}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 10px",
          borderRadius: "6px",
          fontSize: "13.5px",
          fontWeight: activeTab === "settings" ? 600 : 400,
          background: activeTab === "settings" ? "var(--panel2)" : "transparent",
          color: activeTab === "settings" ? "var(--text)" : "var(--text-dim)",
          textAlign: "left",
          borderLeft: activeTab === "settings" ? "2px solid var(--blue)" : "2px solid transparent",
        }}
      >
        Paramètres
      </button>
    </div>
  );
}
