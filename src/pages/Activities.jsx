import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatDate, formatEuros, periodRange, PhoneIcon, XIcon, TrophyIcon, MailIcon, CalendarIcon, ClockIcon, SparklesIcon, TargetIcon } from "../lib/ui.jsx";

const PERIODS = [
  ["day", "Jour"],
  ["week", "Semaine"],
  ["month", "Mois"],
];

const FILTERS = [
  ["Tous", "Tous"],
  ["Appels", "Appels"],
  ["Emails", "Emails"],
  ["Rendez-vous", "Rendez-vous"],
  ["Notes", "Notes"],
  ["IA", "IA"],
];

const ICONS = {
  "Appel abouti": <PhoneIcon size={13} color="#0ea968" />,
  "Appel manqué": <XIcon size={13} color="var(--red)" />,
  "Email de relance": <MailIcon size={13} color="var(--blue)" />,
  "Rendez-vous": <CalendarIcon size={13} color="var(--blue)" />,
  "Note": <ClockIcon size={13} color="var(--text-dim)" />,
  "Analyse IA": <SparklesIcon size={13} color="var(--blue)" />,
  "Deal gagné": <TrophyIcon size={13} color="#0ea968" />,
  "Deal perdu": <XIcon size={13} color="var(--text-dim)" />,
};

export default function Activities({ prospects, onOpenProspect }) {
  const [period, setPeriod] = useState("week");
  const [filter, setFilter] = useState("Tous");
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

      const ACTIVITY_LABEL = { appel_abouti: "Appel abouti", appel_manque: "Appel manqué", deal_gagne: "Deal gagné", deal_perdu: "Deal perdu", note: "Note" };
      const ACTIVITY_FILTER = { appel_abouti: "Appels", appel_manque: "Appels", note: "Notes", deal_gagne: "Tous", deal_perdu: "Tous" };

      const feed = [
        ...(emails.data || []).map((x) => ({ ...x, kind: "Email de relance", filterKey: "Emails" })),
        ...(scripts.data || []).map((x) => ({ ...x, kind: "Rendez-vous", filterKey: "Rendez-vous" })),
        ...(analyses.data || []).map((x) => ({ ...x, kind: "Analyse IA", filterKey: "IA" })),
        ...(acts.data || []).map((x) => ({ ...x, kind: ACTIVITY_LABEL[x.type] || x.type, content: x.note || "", filterKey: ACTIVITY_FILTER[x.type] || "Tous" })),
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

  const nbRdv = feedItems.filter((i) => i.filterKey === "Rendez-vous" && new Date(i.created_at) >= start).length;
  const nbOpportunitesCreees = prospects.filter((p) => p.created_at && new Date(p.created_at) >= start).length;
  const tauxConversion = nbDealGagne + nbDealPerdu > 0 ? Math.round((nbDealGagne / (nbDealGagne + nbDealPerdu)) * 100) : null;
  const caGenere = prospects
    .filter((p) => p.stage === "Gagné" && p.closed_at && new Date(p.closed_at) >= start)
    .reduce((sum, p) => sum + (p.deal_value || 0), 0);

  const visibleFeed = filter === "Tous" ? feedItems : feedItems.filter((item) => item.filterKey === filter);

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
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
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Mémoire commerciale chronologique, tous prospects confondus.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px", maxWidth: "820px" }}>
        <ReportTile icon={<PhoneIcon size={14} color="#0ea968" />} accent="#0ea968" label="Nombre d'appels" value={totalAppels} />
        <ReportTile icon={<CalendarIcon size={14} color="var(--blue)" />} accent="var(--blue)" label="Nombre de rendez-vous" value={nbRdv} />
        <ReportTile icon={<TargetIcon size={14} color="#7c3aed" />} accent="#7c3aed" label="Opportunités créées" value={nbOpportunitesCreees} />
        <ReportTile icon={<TrophyIcon size={14} color="#0ea968" />} accent="#0ea968" label="Deals gagnés" value={nbDealGagne} />
        <ReportTile icon={<XIcon size={14} color="var(--text-dim)" />} accent="var(--text-dim)" label="Deals perdus" value={nbDealPerdu} />
        <ReportTile icon={<TrophyIcon size={14} color="var(--amber)" />} accent="var(--amber)" label="Taux de conversion" value={tauxConversion !== null ? `${tauxConversion}%` : "—"} />
        <ReportTile icon={<TargetIcon size={14} color="#0ea968" />} accent="#0ea968" label="CA généré" value={formatEuros(caGenere)} />
      </div>

      {tauxReussite !== null && (
        <div style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "20px" }}>
          Taux de décroché : <span className="mono" style={{ color: "var(--text)", fontWeight: 700 }}>{tauxReussite}%</span> ({totalAppels} appel{totalAppels > 1 ? "s" : ""} sur la période)
        </div>
      )}

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className="focusable"
            onClick={() => setFilter(key)}
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500, background: filter === key ? "var(--blue-dim)" : "var(--panel2)", color: filter === key ? "var(--blue)" : "var(--text-dim)", border: filter === key ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : visibleFeed.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune activité pour ce filtre.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "760px" }}>
          {visibleFeed.map((item) => (
            <div key={`${item.kind}-${item.id}`} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {item.prospect && <Avatar name={item.prospect.name} stage={item.prospect.stage} size={24} />}
                  <span className="display" style={{ fontSize: "13px", fontWeight: 600 }}>
                    {item.prospect ? item.prospect.name : "Prospect supprimé"}
                  </span>
                  <span className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--blue)" }}>
                    {ICONS[item.kind]} {item.kind}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatDate(item.created_at)}</span>
              </div>
              {item.content && <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: "10px" }}>{item.content}</div>}
              {item.prospect && (
                <div style={{ display: "flex", gap: "6px", borderTop: "0.5px solid var(--hairline)", paddingTop: "8px" }}>
                  <button className="focusable" onClick={() => onOpenProspect?.(item.prospect.id)} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
                    Ajouter une note
                  </button>
                  <button className="focusable" onClick={() => onOpenProspect?.(item.prospect.id, "taches")} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
                    Créer une tâche
                  </button>
                  <button className="focusable" onClick={() => onOpenProspect?.(item.prospect.id)} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55" }}>
                    Ouvrir l'opportunité
                  </button>
                </div>
              )}
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
