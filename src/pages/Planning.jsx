import { useState } from "react";
import Agenda from "./Agenda.jsx";
import Tasks from "./Tasks.jsx";

export default function Planning({ prospects, session, onOpenProspect }) {
  const [mode, setMode] = useState("agenda");

  return (
    <div>
      <div style={{ padding: "24px 32px 0", display: "flex", gap: "4px" }}>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          <button
            className="focusable"
            onClick={() => setMode("agenda")}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: mode === "agenda" ? 600 : 500, background: mode === "agenda" ? "var(--bg)" : "transparent", color: mode === "agenda" ? "var(--blue)" : "var(--text-dim)", boxShadow: mode === "agenda" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
          >
            🗓️ Agenda
          </button>
          <button
            className="focusable"
            onClick={() => setMode("tasks")}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: mode === "tasks" ? 600 : 500, background: mode === "tasks" ? "var(--bg)" : "transparent", color: mode === "tasks" ? "var(--blue)" : "var(--text-dim)", boxShadow: mode === "tasks" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
          >
            ✅ Tâches
          </button>
        </div>
      </div>

      {mode === "agenda" ? (
        <Agenda prospects={prospects} session={session} onOpenProspect={onOpenProspect} />
      ) : (
        <Tasks prospects={prospects} session={session} />
      )}
    </div>
  );
}
