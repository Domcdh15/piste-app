import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEuros, formatShortDate, formatRelative, STAGE_META, Avatar, SparklesIcon, computeDealScore } from "../lib/ui.jsx";

const COLUMNS = [
  { key: "À contacter", label: "À contacter" },
  { key: "Contact établi", label: "Contact établi" },
  { key: "Rendez-vous prévu", label: "Rendez-vous prévu" },
  { key: "Proposition envoyée", label: "Proposition envoyée" },
  { key: "Négociation", label: "Négociation" },
  { key: "closed", label: "Gagné / Perdu" },
];

export default function Opportunities({ prospects, onOpenProspect, onNewOpportunity }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("tasks").select("*").eq("done", false).order("due_at", { ascending: true, nullsFirst: false });
      setTasks(data || []);
    }
    load();
  }, []);

  const nextTaskByProspect = {};
  for (const t of tasks) {
    if (!nextTaskByProspect[t.prospect_id]) nextTaskByProspect[t.prospect_id] = t;
  }

  const totalValue = prospects.filter((p) => p.stage !== "Perdu").reduce((sum, p) => sum + (p.deal_value || 0), 0);

  return (
    <div style={{ padding: "28px 32px 48px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "6px" }}>💼 Opportunités</div>
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-dim)" }}>
            <span><strong className="mono" style={{ color: "var(--text)" }}>{prospects.length}</strong> opportunité{prospects.length > 1 ? "s" : ""}</span>
            <span><strong className="mono" style={{ color: "var(--blue)" }}>{formatEuros(totalValue)}</strong> de pipeline</span>
          </div>
        </div>
        <button className="focusable" onClick={onNewOpportunity} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px 14px", fontSize: "13px", whiteSpace: "nowrap" }}>
          + Nouvelle opportunité
        </button>
      </div>

      <div style={{ display: "flex", gap: "14px", overflowX: "auto", flex: 1, paddingBottom: "8px" }}>
        {COLUMNS.map((col) => {
          const items = prospects.filter((p) => (col.key === "closed" ? p.stage === "Gagné" || p.stage === "Perdu" : p.stage === col.key));
          const columnValue = items.reduce((sum, p) => sum + (p.deal_value || 0), 0);
          const accent = col.key === "closed" ? "#0ea968" : (STAGE_META[col.key]?.color || "var(--text-dim)");
          return (
            <div key={col.key} style={{ minWidth: "260px", width: "260px", display: "flex", flexDirection: "column", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", flexShrink: 0 }}>
              <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                  <span className="display" style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.03em" }}>{col.label.toUpperCase()}</span>
                  <span className="mono" style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: "11px" }}>{items.length}</span>
                </div>
                {columnValue > 0 && <div className="mono" style={{ color: "var(--text-faint)", fontSize: "11px" }}>{formatEuros(columnValue)}</div>}
              </div>

              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
                {items.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: "11px", padding: "8px" }}>Vide</div>
                ) : (
                  items.map((p) => (
                    <OpportunityCard key={p.id} prospect={p} nextTask={nextTaskByProspect[p.id]} onClick={() => onOpenProspect(p.id)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunityCard({ prospect: p, nextTask, onClick }) {
  const score = computeDealScore(p);
  const scoreColor = score >= 70 ? "#0ea968" : score >= 40 ? "var(--amber)" : "var(--red)";

  return (
    <button
      onClick={onClick}
      className="focusable"
      style={{ textAlign: "left", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.company}</div>
        <span className="mono" style={{ background: "#e2f7ec", color: "#0ea968", borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "2px 8px", flexShrink: 0 }}>
          {formatEuros(p.deal_value)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-dim)", fontSize: "11px" }}>
        <Avatar name={p.name} stage={p.stage} size={18} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <Row label="Dernière activité" value={p.last_contact_at ? formatRelative(p.last_contact_at) : "Jamais"} />
        <Row
          label="Prochaine action"
          value={nextTask ? `${nextTask.note}${nextTask.due_at ? ` (${formatShortDate(nextTask.due_at)})` : ""}` : p.next_contact_at ? `Relance le ${formatShortDate(p.next_contact_at)}` : "Aucune prévue"}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "0.5px solid var(--hairline)", paddingTop: "8px" }}>
        <span className="mono" style={{ background: "var(--panel2)", color: scoreColor, borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "2px 8px" }}>
          {score} %
        </span>
        <SparklesIcon size={12} color="var(--blue)" />
      </div>
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: "11px" }}>
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
