import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatDate, periodRange, PhoneIcon, XIcon, TrophyIcon, MailIcon } from "../lib/ui.jsx";

const PERIODS = [
  ["day", "Jour"],
  ["week", "Semaine"],
  ["month", "Mois"],
];

export default function Activities({ prospects }) {
  const [period, setPeriod] = useState("week");
  const [activities, setActivities] = useState([]);
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [emails, scripts, analyses, acts] = await Promise.all([
        supabase.from("emails_generes").select("*"),
        supabase.from("scripts_appel").select("*"),
        supabase.from("analyses_ia").select("*"),
        supabase.from("activities").select("*"),
      ]);
      const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));

      const feed = [
        ...(emails.data || []).map((x) => ({ ...x, kind: "Email de relance" })),
        ...(scripts.data || []).map((x) => ({ ...x, kind: `Script — ${x.section}` })),
        ...(analyses.data || []).map((x) => ({ ...x, kind: "Analyse" })),
      ]
        .map((x) => ({ ...x, prospect: byId[x.prospect_id] }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setFeedItems(feed);
      setActivities((acts.data || []).map((a) => ({ ...a, prospect: byId[a.prospect_id] })));
      setLoading(false);
    }
    if (prospects.length >= 0) load();
  }, [prospects]);

  const { start } = periodRange(period);
  const inRange = activities.filter((a) => new Date(a.created_at) >= start);

  const nbAppelAbouti = inRange.filter((a) => a.type === "appel_abouti").length;
  const nbAppelManque = inRange.filter((a) => a.type === "appel_manque").length;
  const nbDealGagne = inRange.filter((a) => a.type === "deal_gagne").length;
  const nbDealPerdu = inRange.filter((a) => a.type === "deal_perdu").length;
  const totalAppels = nbAppelAbouti + nbAppelManque;
  const tauxReussite = totalAppels > 0 ? Math.round((nbAppelAbouti / totalAppels) * 100) : null;

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "20px" }}>⚡ Activités</div>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          {PERIODS.map(([key, label]) => (
            <button
              key={key}
              className="focusable"
              onClick={() => setPeriod(key)}
              style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: period === key ? "var(--hairline)" : "transparent", color: period === key ? "var(--text)" : "var(--text-dim)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Reporting commercial et flux d'activité, tous prospects confondus.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "28px", maxWidth: "820px" }}>
        <ReportTile icon={<PhoneIcon size={14} color="#0ea968" />} accent="#0ea968" label="Appels aboutis" value={nbAppelAbouti} />
        <ReportTile icon={<XIcon size={14} color="var(--red)" />} accent="var(--red)" label="Appels manqués" value={nbAppelManque} />
        <ReportTile icon={<TrophyIcon size={14} color="#0ea968" />} accent="#0ea968" label="Deals gagnés" value={nbDealGagne} />
        <ReportTile icon={<XIcon size={14} color="var(--text-dim)" />} accent="var(--text-dim)" label="Deals perdus" value={nbDealPerdu} />
      </div>

      {tauxReussite !== null && (
        <div style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "28px" }}>
          Taux de décroché : <span className="mono" style={{ color: "var(--text)", fontWeight: 700 }}>{tauxReussite}%</span> ({totalAppels} appel{totalAppels > 1 ? "s" : ""} sur la période)
        </div>
      )}

      <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "12px" }}>Flux d'activité</div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : feedItems.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune activité enregistrée pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "760px" }}>
          {feedItems.map((item) => (
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

function ReportTile({ icon, accent, label, value }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: `2.5px solid ${accent}`, borderRadius: "10px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-dim)", fontSize: "11px", marginBottom: "8px" }}>
        {icon}
        {label}
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: "22px", color: accent }}>{value}</div>
    </div>
  );
}
