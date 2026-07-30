import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatDate } from "../lib/ui.jsx";

export default function Activities({ prospects }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [emails, scripts, analyses] = await Promise.all([
        supabase.from("emails_generes").select("*"),
        supabase.from("scripts_appel").select("*"),
        supabase.from("analyses_ia").select("*"),
      ]);
      const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));
      const all = [
        ...(emails.data || []).map((x) => ({ ...x, kind: "Email de relance" })),
        ...(scripts.data || []).map((x) => ({ ...x, kind: `Script — ${x.section}` })),
        ...(analyses.data || []).map((x) => ({ ...x, kind: "Analyse" })),
      ]
        .map((x) => ({ ...x, prospect: byId[x.prospect_id] }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(all);
      setLoading(false);
    }
    if (prospects.length >= 0) load();
  }, [prospects]);

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "4px" }}>⚡ Activités</div>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Tout ce qui a été généré et enregistré, tous prospects confondus.</div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : items.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune activité enregistrée pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "760px" }}>
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {item.prospect && <Avatar name={item.prospect.name} stage={item.prospect.stage} size={24} />}
                  <span className="display" style={{ fontSize: "13px", fontWeight: 600 }}>
                    {item.prospect ? item.prospect.name : "Prospect supprimé"}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--blue)" }}>{item.kind}</span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatDate(item.created_at)}</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{item.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
