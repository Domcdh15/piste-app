import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatDate, formatShortDate, formatEuros, periodRange, callAI, PhoneIcon, XIcon, TrophyIcon, MailIcon, CalendarIcon, ClockIcon, SparklesIcon, TargetIcon, ListIcon, PageTitle } from "../lib/ui.jsx";

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

export default function Activities({ prospects, onOpenProspect, session, team }) {
  const [period, setPeriod] = useState("week");
  const [filter, setFilter] = useState("Tous");
  const [activities, setActivities] = useState([]);
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTile, setExpandedTile] = useState(null);
  const [teamStats, setTeamStats] = useState(null);

  useEffect(() => {
    if (!team || (team.members || []).length <= 1) {
      setTeamStats(null);
      return;
    }
    supabase.rpc("team_stats_for_me").then(({ data }) => setTeamStats(data?.[0] || null));
  }, [team]);

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

  const appelsList = inRange.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque");
  const nbAppelAbouti = inRange.filter((a) => a.type === "appel_abouti").length;
  const nbAppelManque = inRange.filter((a) => a.type === "appel_manque").length;
  const totalAppels = nbAppelAbouti + nbAppelManque;
  const tauxReussite = totalAppels > 0 ? Math.round((nbAppelAbouti / totalAppels) * 100) : null;

  const rdvList = feedItems.filter((i) => i.filterKey === "Rendez-vous" && new Date(i.created_at) >= start);
  const opportunitesList = prospects.filter((p) => p.created_at && new Date(p.created_at) >= start);
  const gagnesList = prospects.filter((p) => p.stage === "Gagné" && p.closed_at && new Date(p.closed_at) >= start);
  const perdusList = prospects.filter((p) => p.stage === "Perdu" && p.closed_at && new Date(p.closed_at) >= start);
  const nbDealGagne = gagnesList.length;
  const nbDealPerdu = perdusList.length;
  const tauxConversion = nbDealGagne + nbDealPerdu > 0 ? Math.round((nbDealGagne / (nbDealGagne + nbDealPerdu)) * 100) : null;
  const caGenere = gagnesList.reduce((sum, p) => sum + (p.deal_value || 0), 0);

  const TILES = {
    appels: { label: "Nombre d'appels", items: appelsList, kind: "activities" },
    rdv: { label: "Nombre de rendez-vous", items: rdvList, kind: "feed" },
    opportunites: { label: "Opportunités créées", items: opportunitesList, kind: "prospects", dateField: "created_at" },
    gagnes: { label: "Deals gagnés", items: gagnesList, kind: "prospects", dateField: "closed_at" },
    perdus: { label: "Deals perdus", items: perdusList, kind: "prospects", dateField: "closed_at" },
    conversion: { label: "Taux de conversion", items: [...gagnesList, ...perdusList], kind: "prospects", dateField: "closed_at" },
    ca: { label: "CA généré", items: [...gagnesList].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)), kind: "revenue", dateField: "closed_at" },
  };

  const visibleFeed = filter === "Tous" ? feedItems : feedItems.filter((item) => item.filterKey === filter);

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
        <PageTitle icon={ListIcon} color="#0284c7">Activités</PageTitle>
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

      {teamStats && (
        <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", maxWidth: "820px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.03em" }}>ÉQUIPE</div>
          <StatChip label="Prospects" value={teamStats.prospect_count ?? 0} />
          <StatChip label="Deals gagnés" value={teamStats.deals_won ?? 0} />
          <StatChip label="Deals perdus" value={teamStats.deals_lost ?? 0} />
          <StatChip label="CA généré" value={formatEuros(teamStats.revenue_won || 0)} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: expandedTile ? "0" : "24px", maxWidth: "820px" }}>
        <ReportTile tileKey="appels" expanded={expandedTile === "appels"} onClick={setExpandedTile} icon={<PhoneIcon size={14} color="#0ea968" />} accent="#0ea968" label="Nombre d'appels" value={totalAppels} />
        <ReportTile tileKey="rdv" expanded={expandedTile === "rdv"} onClick={setExpandedTile} icon={<CalendarIcon size={14} color="var(--blue)" />} accent="var(--blue)" label="Nombre de rendez-vous" value={rdvList.length} />
        <ReportTile tileKey="opportunites" expanded={expandedTile === "opportunites"} onClick={setExpandedTile} icon={<TargetIcon size={14} color="#7c3aed" />} accent="#7c3aed" label="Opportunités créées" value={opportunitesList.length} />
        <ReportTile tileKey="gagnes" expanded={expandedTile === "gagnes"} onClick={setExpandedTile} icon={<TrophyIcon size={14} color="#0ea968" />} accent="#0ea968" label="Deals gagnés" value={nbDealGagne} />
        <ReportTile tileKey="perdus" expanded={expandedTile === "perdus"} onClick={setExpandedTile} icon={<XIcon size={14} color="var(--text-dim)" />} accent="var(--text-dim)" label="Deals perdus" value={nbDealPerdu} />
        <ReportTile tileKey="conversion" expanded={expandedTile === "conversion"} onClick={setExpandedTile} icon={<TrophyIcon size={14} color="var(--amber)" />} accent="var(--amber)" label="Taux de conversion" value={tauxConversion !== null ? `${tauxConversion}%` : "—"} />
        <ReportTile tileKey="ca" expanded={expandedTile === "ca"} onClick={setExpandedTile} icon={<TargetIcon size={14} color="#0ea968" />} accent="#0ea968" label="CA généré" value={formatEuros(caGenere)} />
      </div>

      {expandedTile && (
        <ExpandedTilePanel
          tileKey={expandedTile}
          config={TILES[expandedTile]}
          onOpenProspect={onOpenProspect}
          onClose={() => setExpandedTile(null)}
          session={session}
        />
      )}

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

function StatChip({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
      <span className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{value}</span>
      <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{label}</span>
    </div>
  );
}

function ReportTile({ tileKey, expanded, onClick, icon, accent, label, value }) {
  return (
    <button
      className="focusable"
      onClick={() => onClick((k) => (k === tileKey ? null : tileKey))}
      style={{
        textAlign: "left", cursor: "pointer", background: expanded ? "var(--panel2)" : "var(--panel)",
        border: expanded ? `0.5px solid ${accent}88` : "0.5px solid var(--hairline)",
        borderTop: `2.5px solid ${accent}`, borderRadius: expanded ? "10px 10px 0 0" : "10px", padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-dim)", fontSize: "11px", marginBottom: "8px" }}>
        {icon}
        {label}
        <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-faint)" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: "22px", color: accent }}>{value}</div>
    </button>
  );
}

function detailDate(item, config) {
  if (config.kind === "activities" || config.kind === "feed") return item.created_at;
  return item[config.dateField] || item.created_at;
}

function ExpandedTilePanel({ tileKey, config, onOpenProspect, onClose, session }) {
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");
  const { items, label, kind } = config;

  useEffect(() => {
    setSummary("");
    setError("");
  }, [tileKey]);

  async function generateSummary() {
    setLoadingSummary(true);
    setError("");
    try {
      const context = items.slice(0, 30).map((item) => {
        if (kind === "activities") return `${item.type} — ${item.prospect?.name || "prospect supprimé"} (${item.prospect?.company || ""}) le ${formatShortDate(item.created_at)}`;
        if (kind === "feed") return `${item.kind} — ${item.prospect?.name || ""} le ${formatShortDate(item.created_at)}`;
        return `${item.name} (${item.company}) — ${item.stage}, ${formatEuros(item.deal_value)}, ${formatShortDate(detailDate(item, config))}`;
      }).join("\n");
      const prompt = `Tu es un coach commercial. Voici les données de la catégorie "${label}" sur la période sélectionnée (${items.length} élément(s)). Rédige un résumé en français, 2-3 phrases maximum, avec une observation utile ou une tendance à noter. Réponds uniquement avec le résumé, sans préambule.

${context || "Aucune donnée sur cette période."}`;
      const text = await callAI(prompt, session.access_token);
      setSummary(text.trim());
    } catch (e) {
      setError(e.message || "Le résumé a échoué. Réessaie.");
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "0 0 10px 10px", padding: "16px", marginBottom: "24px", maxWidth: "820px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span className="display" style={{ fontWeight: 700, fontSize: "13px" }}>{label} · {items.length}</span>
        <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px" }}>✕</button>
      </div>

      <button className="focusable" onClick={generateSummary} disabled={loadingSummary || items.length === 0} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", marginBottom: "12px", opacity: items.length === 0 ? 0.5 : 1 }}>
        <SparklesIcon size={12} color="var(--blue)" /> {loadingSummary ? "Analyse..." : "Générer un résumé IA"}
      </button>
      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
      {summary && <div style={{ background: "var(--blue-dim)", color: "var(--blue)", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", marginBottom: "14px", lineHeight: 1.5 }}>{summary}</div>}

      {items.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>Aucun élément sur cette période.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "320px", overflowY: "auto" }}>
          {items.map((item) => {
            if (kind === "activities" || kind === "feed") {
              const prospect = item.prospect;
              return (
                <button key={item.id} className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", textAlign: "left", cursor: prospect ? "pointer" : "default" }}>
                  {prospect && <Avatar name={prospect.name} stage={prospect.stage} size={20} />}
                  <span style={{ fontSize: "12px", fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prospect ? prospect.name : "Prospect supprimé"}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatShortDate(item.created_at)}</span>
                </button>
              );
            }
            const isRevenue = kind === "revenue";
            return (
              <button key={item.id} className="focusable" onClick={() => onOpenProspect?.(item.id)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", textAlign: "left" }}>
                <Avatar name={item.name} stage={item.stage} size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>{item.company}</div>
                </div>
                {isRevenue && <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "#0ea968" }}>{formatEuros(item.deal_value)}</span>}
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatShortDate(detailDate(item, config))}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
