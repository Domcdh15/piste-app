import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatShortDate, formatEuros, callAI, parseJsonLoose, STATUS_META, computeDealScore, PhoneIcon, XIcon, TrophyIcon, MailIcon, CalendarIcon, ClockIcon, SparklesIcon, UsersIcon, LinkedinIcon, AlertIcon } from "../lib/ui.jsx";

const PERIOD_DAYS = { "7": 7, "30": 30, "90": 90 };
const PERIODS = [["7", "7 jours"], ["30", "30 jours"], ["90", "Trimestre"]];

const FILTERS = [
  ["Tous", "Tous"],
  ["Appels", "Appels"],
  ["Rendez-vous", "Rendez-vous"],
  ["Emails", "Emails"],
  ["LinkedIn", "LinkedIn"],
  ["Notes", "Notes"],
  ["IA", "IA"],
];

const ICONS = {
  "Appel abouti": <PhoneIcon size={13} color="#527a61" />,
  "Appel manqué": <XIcon size={13} color="var(--red)" />,
  "RDV physique": <CalendarIcon size={13} color="var(--blue)" />,
  "Visio": <CalendarIcon size={13} color="var(--violet)" />,
  "Message LinkedIn": <LinkedinIcon size={13} color="var(--blue)" />,
  "Email de relance": <MailIcon size={13} color="var(--blue)" />,
  "Devis": <MailIcon size={13} color="var(--gold-deep)" />,
  "Rendez-vous": <CalendarIcon size={13} color="var(--blue)" />,
  "Note": <ClockIcon size={13} color="var(--text-dim)" />,
  "Analyse IA": <SparklesIcon size={13} color="var(--blue)" />,
  "Deal gagné": <TrophyIcon size={13} color="#527a61" />,
  "Deal perdu": <XIcon size={13} color="var(--text-dim)" />,
  "Réattribution": <UsersIcon size={13} color="var(--gold-deep)" />,
};

const ACTIVITY_LABEL = {
  appel_abouti: "Appel abouti", appel_manque: "Appel manqué",
  rdv_physique: "RDV physique", appel_visio: "Visio", message_linkedin: "Message LinkedIn",
  deal_gagne: "Deal gagné", deal_perdu: "Deal perdu", note: "Note", reassignation: "Réattribution",
};
const ACTIVITY_FILTER = {
  appel_abouti: "Appels", appel_manque: "Appels",
  rdv_physique: "Rendez-vous", appel_visio: "Rendez-vous", message_linkedin: "LinkedIn",
  note: "Notes", deal_gagne: "Tous", deal_perdu: "Tous", reassignation: "Tous",
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function Activities({ prospects, onOpenProspect, session, team, settings }) {
  const [tab, setTab] = useState("activite");
  const [filter, setFilter] = useState("Tous");
  const [feedItems, setFeedItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
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

      const feed = [
        ...(emails.data || []).map((x) => ({ ...x, kind: x.type === "devis" ? "Devis" : "Email de relance", filterKey: "Emails" })),
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
    load();
  }, [prospects]);

  return (
    <div>
      <div className="hero-band" style={{ color: "var(--text)", padding: "40px 32px 32px" }}>
        <div className="h2" style={{ color: "var(--text)" }}>Activité &amp; Données</div>
      </div>

      <div style={{ padding: "24px 32px 60px", maxWidth: "900px" }}>
      <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px", marginBottom: "22px", width: "fit-content" }}>
        {[["activite", "Activité"], ["performance", "Performance"]].map(([key, label]) => (
          <button key={key} className="focusable" onClick={() => setTab(key)} style={{ padding: "7px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 500, background: tab === key ? "var(--panel)" : "transparent", color: tab === key ? "var(--blue)" : "var(--text-dim)", boxShadow: tab === key ? "var(--shadow-sm)" : "none" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "activite" ? (
        <ActivityTab
          prospects={prospects}
          feedItems={feedItems}
          activities={activities}
          loading={loading}
          filter={filter}
          setFilter={setFilter}
          onOpenProspect={onOpenProspect}
          teamStats={teamStats}
        />
      ) : (
        <PerformanceTab prospects={prospects} activities={activities} feedItems={feedItems} session={session} teamStats={teamStats} settings={settings} />
      )}
      </div>
    </div>
  );
}

function ActivityTab({ prospects, feedItems, activities, loading, filter, setFilter, onOpenProspect, teamStats }) {
  const now = new Date();
  const startToday = daysAgo(0);
  const todayActs = activities.filter((a) => new Date(a.created_at) >= startToday);
  const todayEmails = feedItems.filter((i) => i.filterKey === "Emails" && new Date(i.created_at) >= startToday);
  const nbAppels = todayActs.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque").length;
  const nbRdv = todayActs.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio").length;

  const stale = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu" && (!p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 7));

  const visibleFeed = filter === "Tous" ? feedItems : feedItems.filter((item) => item.filterKey === filter);

  return (
    <>
      {teamStats && (
        <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.03em" }}>ÉQUIPE</div>
          <StatChip label="Prospects" value={teamStats.prospect_count ?? 0} />
          <StatChip label="Deals gagnés" value={teamStats.deals_won ?? 0} />
          <StatChip label="Deals perdus" value={teamStats.deals_lost ?? 0} />
          <StatChip label="CA généré" value={formatEuros(teamStats.revenue_won || 0)} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", marginBottom: "10px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>Aujourd'hui · {todayActs.length + todayEmails.length} activités</span>
        <StatChip label="appels" value={nbAppels} />
        <StatChip label="emails" value={todayEmails.length} />
        <StatChip label="rendez-vous" value={nbRdv} />
      </div>

      {stale.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--red-dim)", border: "0.5px solid var(--red)33", borderRadius: "8px", padding: "9px 14px", marginBottom: "20px" }}>
          <span style={{ fontSize: "12.5px", color: "var(--red)", fontWeight: 600 }}>⚠ {stale.length} opportunité{stale.length > 1 ? "s" : ""} sans activité depuis plus de 7 jours</span>
        </div>
      )}

      <SignalsRow prospects={prospects} activities={activities} onOpenProspect={onOpenProspect} />

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className="focusable"
            onClick={() => setFilter(key)}
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500, background: filter === key ? "var(--blue-dim)" : "var(--panel2)", color: filter === key ? "var(--blue)" : "var(--text-dim)", border: filter === key ? "0.5px solid #147ff555" : "0.5px solid var(--hairline)" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "10px" }}>ACTIVITÉ RÉCENTE</div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : visibleFeed.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune activité pour ce filtre.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {visibleFeed.slice(0, 60).map((item) => (
            <div key={`${item.kind}-${item.id}`} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 6px", borderBottom: "0.5px solid var(--hairline)" }}>
              <div style={{ width: "58px", flexShrink: 0, fontSize: "11px", color: "var(--text-faint)", paddingTop: "2px" }}>{dayLabel(item.created_at)}</div>
              <div style={{ paddingTop: "1px" }}>{ICONS[item.kind] || <ClockIcon size={13} color="var(--text-dim)" />}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button className="focusable" onClick={() => item.prospect && onOpenProspect?.(item.prospect.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: item.prospect ? "pointer" : "default" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{item.kind}</span>
                  {item.prospect && <span style={{ fontSize: "12.5px", color: "var(--blue)" }}> · {item.prospect.name} — {item.prospect.company}</span>}
                </button>
                {item.prospect?.deal_value > 0 && (
                  <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "1px" }}>{formatEuros(item.prospect.deal_value)} · {item.prospect.stage}</div>
                )}
                {item.content && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.content}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SignalsRow({ prospects, activities, onOpenProspect }) {
  const now = new Date();
  const startToday = daysAgo(0);
  const startWeek = daysAgo(7);
  const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");

  const countsByProspect = {};
  activities.forEach((a) => {
    if (!a.prospect_id) return;
    countsByProspect[a.prospect_id] = countsByProspect[a.prospect_id] || { today: 0, week: 0 };
    if (new Date(a.created_at) >= startToday) countsByProspect[a.prospect_id].today += 1;
    if (new Date(a.created_at) >= startWeek) countsByProspect[a.prospect_id].week += 1;
  });

  const hotToday = open
    .filter((p) => countsByProspect[p.id]?.today >= 2)
    .sort((a, b) => (countsByProspect[b.id]?.today || 0) - (countsByProspect[a.id]?.today || 0))[0];

  const cooling = open
    .filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 9)
    .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0))[0];

  const active = open
    .filter((p) => (countsByProspect[p.id]?.week || 0) >= 3)
    .sort((a, b) => (countsByProspect[b.id]?.week || 0) - (countsByProspect[a.id]?.week || 0))[0];

  const signals = [
    hotToday && { emoji: "🔥", label: "Forte activité", prospect: hotToday, text: `${countsByProspect[hotToday.id].today} interactions aujourd'hui.` },
    cooling && { emoji: "⚠", label: "Deal qui ralentit", prospect: cooling, text: `Aucune activité depuis ${Math.floor((now - new Date(cooling.last_contact_at || 0)) / 86400000)} jours.` },
    active && { emoji: "🟢", label: "Opportunité active", prospect: active, text: `${countsByProspect[active.id].week} interactions cette semaine.` },
  ].filter(Boolean);

  if (signals.length === 0) return null;

  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "10px" }}>✨ SIGNAUX DÉTECTÉS PAR CLOSIA</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${signals.length}, 1fr)`, gap: "10px" }}>
        {signals.map((s, i) => (
          <div key={i} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>{s.emoji} {s.label}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{s.prospect.company}</div>
            <div style={{ fontSize: "11.5px", color: "var(--text-dim)", marginBottom: "6px" }}>{s.text}</div>
            <div className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--gold-deep)", marginBottom: "10px" }}>{formatEuros(s.prospect.deal_value || 0)}</div>
            <button className="focusable" onClick={() => onOpenProspect?.(s.prospect.id)} style={{ fontSize: "11.5px", fontWeight: 600, background: "var(--blue-dim)", color: "var(--blue)", border: "none", borderRadius: "6px", padding: "6px 10px" }}>
              Voir le deal
            </button>
          </div>
        ))}
      </div>
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

function pctDelta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function DeltaLine({ delta }) {
  if (delta === null) return <div style={{ fontSize: "10.5px", color: "var(--text-faint)" }}>vs période précédente : —</div>;
  return (
    <div style={{ fontSize: "10.5px", color: delta >= 0 ? "#16a34a" : "var(--red)" }}>
      {delta >= 0 ? "+" : ""}{delta}% vs période précédente
    </div>
  );
}

function PerformanceTab({ prospects, activities, feedItems, session, teamStats, settings }) {
  const [period, setPeriod] = useState("30");
  const [insight, setInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [openTasks, setOpenTasks] = useState([]);

  useEffect(() => {
    supabase.from("tasks").select("*").then(({ data }) => setOpenTasks(data || []));
  }, []);

  const days = PERIOD_DAYS[period];
  const start = daysAgo(days);
  const prevStart = daysAgo(days * 2);

  const inRange = activities.filter((a) => new Date(a.created_at) >= start);
  const prevActs = activities.filter((a) => new Date(a.created_at) >= prevStart && new Date(a.created_at) < start);
  const emailsInRange = feedItems.filter((i) => i.filterKey === "Emails" && new Date(i.created_at) >= start);
  const prevEmails = feedItems.filter((i) => i.filterKey === "Emails" && new Date(i.created_at) >= prevStart && new Date(i.created_at) < start);

  const nbAppels = inRange.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque").length;
  const prevAppels = prevActs.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque").length;
  const nbRdv = inRange.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio").length;
  const prevRdv = prevActs.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio").length;
  const tachesTerminees = openTasks.filter((t) => t.completed_at && new Date(t.completed_at) >= start).length;
  const prevTachesTerminees = openTasks.filter((t) => t.completed_at && new Date(t.completed_at) >= prevStart && new Date(t.completed_at) < start).length;

  const opportunitesCreees = prospects.filter((p) => p.created_at && new Date(p.created_at) >= start).length;
  const totalActivites = inRange.length + emailsInRange.length;
  const prevTotal = prevActs.length + prevEmails.length;
  const activityDelta = pctDelta(totalActivites, prevTotal);

  const gagnes = prospects.filter((p) => p.stage === "Gagné" && p.closed_at && new Date(p.closed_at) >= start);
  const perdus = prospects.filter((p) => p.stage === "Perdu" && p.closed_at && new Date(p.closed_at) >= start);
  const caGenere = gagnes.reduce((sum, p) => sum + (p.deal_value || 0), 0);
  const tauxConversion = gagnes.length + perdus.length > 0 ? Math.round((gagnes.length / (gagnes.length + perdus.length)) * 100) : null;
  const tauxRdvOpp = nbRdv > 0 ? Math.round((opportunitesCreees / nbRdv) * 100) : null;
  const cycles = gagnes.filter((p) => p.created_at).map((p) => Math.round((new Date(p.closed_at) - new Date(p.created_at)) / 86400000));
  const avgCycle = cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : null;

  // Réactivité — calculs réels basés sur les timestamps existants (pas de tracking d'ouverture/réponse email disponible)
  const now = new Date();
  const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
  const activitiesByProspect = {};
  activities.forEach((a) => {
    if (!a.prospect_id) return;
    (activitiesByProspect[a.prospect_id] = activitiesByProspect[a.prospect_id] || []).push(a);
  });
  Object.values(activitiesByProspect).forEach((list) => list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));

  const firstResponseTimes = prospects
    .filter((p) => p.created_at && new Date(p.created_at) >= start && activitiesByProspect[p.id]?.length)
    .map((p) => (new Date(activitiesByProspect[p.id][0].created_at) - new Date(p.created_at)) / 3600000)
    .filter((h) => h >= 0);
  const avgFirstResponseH = firstResponseTimes.length > 0 ? firstResponseTimes.reduce((s, h) => s + h, 0) / firstResponseTimes.length : null;

  const gaps = [];
  Object.values(activitiesByProspect).forEach((list) => {
    for (let i = 1; i < list.length; i++) {
      const gap = (new Date(list[i].created_at) - new Date(list[i - 1].created_at)) / 86400000;
      if (new Date(list[i].created_at) >= start) gaps.push(gap);
    }
  });
  const avgGapDays = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;

  const tasksCompletedWithDue = openTasks.filter((t) => t.completed_at && t.due_at && new Date(t.completed_at) >= start);
  const onTimeCount = tasksCompletedWithDue.filter((t) => new Date(t.completed_at) <= new Date(t.due_at)).length;
  const onTimePct = tasksCompletedWithDue.length > 0 ? Math.round((onTimeCount / tasksCompletedWithDue.length) * 100) : null;

  // Pipeline
  const openTasksByProspect = {};
  openTasks.filter((t) => !t.done).forEach((t) => { if (!openTasksByProspect[t.prospect_id]) openTasksByProspect[t.prospect_id] = t; });
  const pipelineTotal = open.reduce((s, p) => s + (p.deal_value || 0), 0);
  const withNextAction = open.filter((p) => openTasksByProspect[p.id] || p.next_contact_at);
  const pipelineCreatedThisPeriod = prospects.filter((p) => p.created_at && new Date(p.created_at) >= start).reduce((s, p) => s + (p.deal_value || 0), 0);
  const pipelineCreatedPrevPeriod = prospects.filter((p) => p.created_at && new Date(p.created_at) >= prevStart && new Date(p.created_at) < start).reduce((s, p) => s + (p.deal_value || 0), 0);
  const pipelineDelta = pctDelta(pipelineCreatedThisPeriod, pipelineCreatedPrevPeriod);

  const monthlyPipeline = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const value = prospects.filter((p) => p.created_at && new Date(p.created_at) >= monthStart && new Date(p.created_at) < monthEnd).reduce((s, p) => s + (p.deal_value || 0), 0);
    monthlyPipeline.push({ label: monthStart.toLocaleDateString("fr-FR", { month: "short" }), value });
  }

  // Santé du portefeuille
  const atRisk = open.filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 7);
  const sansAction = open.filter((p) => !openTasksByProspect[p.id] && !p.next_contact_at);
  const stagnant = open.filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 14);
  const stagnantValue = stagnant.reduce((s, p) => s + (p.deal_value || 0), 0);
  const chauds = open.filter((p) => {
    const recentlyContacted = p.last_contact_at && (now - new Date(p.last_contact_at)) / 86400000 <= 3;
    return recentlyContacted && computeDealScore(p) >= 70;
  });

  const pctWithNextAction = open.length > 0 ? Math.round((withNextAction.length / open.length) * 100) : null;
  const momentumIndex = activityDelta !== null ? Math.max(0, Math.min(100, Math.round(50 + activityDelta))) : null;
  const coverageRatio = settings?.objective_monthly_revenue ? (pipelineTotal / settings.objective_monthly_revenue) : null;

  async function generateInsight() {
    setLoadingInsight(true);
    try {
      const prompt = `Tu es un coach commercial. Voici les données d'activité d'un commercial sur les ${days} derniers jours, comparées à la période précédente équivalente. Rédige UNE observation concrète (2-3 phrases max) avec une suggestion actionnable. Réponds uniquement avec le texte, sans préambule, en français.

Activités cette période : ${totalActivites} (dont ${nbAppels} appels, ${emailsInRange.length} emails, ${nbRdv} rendez-vous)
Activités période précédente : ${prevTotal}
Opportunités créées : ${opportunitesCreees}
Taux de conversion : ${tauxConversion !== null ? tauxConversion + "%" : "non disponible"}
Durée moyenne du cycle de vente : ${avgCycle !== null ? avgCycle + " jours" : "non disponible"}
Opportunités sans prochaine action : ${sansAction.length}
Deals à risque (sans activité depuis 7j+) : ${atRisk.length}`;
      const text = await callAI(prompt, session.access_token);
      setInsight(text.trim());
    } catch (e) {
      setInsight("L'analyse a échoué. Réessaie.");
    } finally {
      setLoadingInsight(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Ce qui fait avancer vos deals — pas juste ce que vous avez fait.</div>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} className="focusable" onClick={() => setPeriod(key)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: period === key ? "var(--bg)" : "transparent", color: period === key ? "var(--blue)" : "var(--text-dim)", boxShadow: period === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Métrique phare */}
      <div style={{ background: "var(--blue-dim)", border: "0.5px solid #147ff555", borderRadius: "12px", padding: "18px", marginBottom: "22px", textAlign: "center" }}>
        <div style={{ fontSize: "11px", color: "var(--blue)", fontWeight: 700, letterSpacing: "0.02em", marginBottom: "6px" }}>LA MÉTRIQUE LA PLUS IMPORTANTE</div>
        <div className="mono" style={{ fontSize: "32px", fontWeight: 700, color: "var(--text)" }}>{pctWithNextAction !== null ? `${pctWithNextAction}%` : "—"}</div>
        <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>des opportunités ont une prochaine action planifiée — aucun deal ne devrait tomber dans l'oubli.</div>
      </div>

      {/* 1. Activité */}
      <SectionLabel>Activité — ce que vous avez fait</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <DeltaKpiTile value={nbAppels} label="Appels" delta={pctDelta(nbAppels, prevAppels)} />
        <DeltaKpiTile value={emailsInRange.length} label="Emails" delta={pctDelta(emailsInRange.length, prevEmails.length)} />
        <DeltaKpiTile value={nbRdv} label="Rendez-vous" delta={pctDelta(nbRdv, prevRdv)} />
        <DeltaKpiTile value={tachesTerminees} label="Tâches terminées" delta={pctDelta(tachesTerminees, prevTachesTerminees)} />
      </div>

      {/* 2. Réactivité */}
      <SectionLabel>Réactivité — à quelle vitesse vous traitez vos opportunités</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <QualityTile value={avgFirstResponseH !== null ? (avgFirstResponseH < 24 ? `${Math.round(avgFirstResponseH)}h` : `${Math.round(avgFirstResponseH / 24)} j`) : "—"} label="Temps de première réponse (nouveaux prospects)" />
        <QualityTile value={avgGapDays !== null ? `${avgGapDays.toFixed(1)} j` : "—"} label="Délai moyen entre deux suivis" />
        <QualityTile value={onTimePct !== null ? `${onTimePct}%` : "—"} label="Tâches terminées avant échéance" />
      </div>

      {/* 3. Pipeline */}
      <SectionLabel>Pipeline — qualité et avancement des deals</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "14px" }}>
        <KpiTile value={formatEuros(pipelineTotal)} label="Pipeline total ouvert" />
        <KpiTile value={open.length} label={`Opportunités actives (${withNextAction.length} avec action)`} />
        <KpiTile value={open.length > 0 ? formatEuros(Math.round(pipelineTotal / open.length)) : "—"} label="Valeur moyenne" />
      </div>
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "26px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "13px" }}>Pipeline créé par mois</span>
          <DeltaLine delta={pipelineDelta} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "10px" }}>Valeur des opportunités créées chaque mois (pas un instantané du pipeline total à date — non disponible sans historique).</div>
        <MetricChart data={monthlyPipeline} chartType="bar" measure="value" timeSeries />
      </div>

      {/* 4. Conversion */}
      <SectionLabel>Conversion — ce qui transforme l'activité en résultats</SectionLabel>
      <div style={{ marginBottom: "14px" }}>
        <FunnelChart steps={[
          { label: "Activités", value: totalActivites },
          { label: "Rendez-vous", value: nbRdv },
          { label: "Opportunités créées", value: opportunitesCreees },
          { label: "Deals gagnés", value: gagnes.length },
        ]} finalValue={formatEuros(caGenere)} finalLabel="de CA généré" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "26px" }}>
        <QualityTile value={tauxRdvOpp !== null ? `${tauxRdvOpp}%` : "—"} label="RDV → Opportunité" />
        <QualityTile value={tauxConversion !== null ? `${tauxConversion}%` : "—"} label="Opportunité → Gagné" />
        <QualityTile value={avgCycle !== null ? `${avgCycle} j` : "—"} label="Cycle moyen de vente" />
      </div>

      {/* 5. Santé du portefeuille */}
      <SectionLabel>Santé du portefeuille — ce qui est à risque ou bloqué</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "26px" }}>
        <HealthTile value={atRisk.length} label="Deals à risque" sub="Sans activité depuis 7j+" accent="var(--red)" />
        <HealthTile value={sansAction.length} label="Sans prochaine action" sub="Aucune tâche ni relance planifiée" accent="var(--amber, #b45309)" />
        <HealthTile value={formatEuros(stagnantValue)} label="Pipeline stagnant" sub="Deals sans activité depuis 14j+" accent="var(--text-dim)" />
        <HealthTile value={chauds.length} label="Opportunités chaudes" sub="Interactions récentes, fort engagement" accent="#527a61" />
      </div>

      {/* KPI intelligents */}
      <SectionLabel>Indices Closia</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        <SmartKpiTile value={pctWithNextAction} label="Indice de suivi" desc="% d'opportunités avec une prochaine action planifiée." />
        <SmartKpiTile value={onTimePct} label="Indice de réactivité" desc="% de tâches terminées avant leur échéance." />
        <SmartKpiTile value={momentumIndex} label="Indice de momentum" desc="Basé sur la variation d'activité vs période précédente." />
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
          <div className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>{coverageRatio !== null ? `${coverageRatio.toFixed(1)}x` : "—"}</div>
          <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>Couverture pipeline</div>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "4px" }}>
            {settings?.objective_monthly_revenue ? "Pipeline ÷ objectif mensuel (Paramètres)." : "Défini un objectif de CA mensuel dans Paramètres pour l'activer."}
          </div>
        </div>
      </div>

      <AIQuerySection prospects={prospects} activities={activities} session={session} days={days} />

      <CustomMetricsSection prospects={prospects} activities={activities} session={session} days={days} />

      <div style={{ background: "var(--blue-dim)", border: "0.5px solid #147ff555", borderRadius: "12px", padding: "16px", marginBottom: "26px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "13px", color: "var(--blue)" }}>✨ Ce que Closia remarque</span>
          {!insight && (
            <button className="focusable" onClick={generateInsight} disabled={loadingInsight} style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "6px", background: "var(--panel)", color: "var(--blue)", border: "0.5px solid #147ff540" }}>
              {loadingInsight ? "Analyse..." : "Générer"}
            </button>
          )}
        </div>
        {insight ? (
          <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.6 }}>{insight}</div>
        ) : activityDelta !== null ? (
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
            Votre activité a {activityDelta >= 0 ? "augmenté" : "baissé"} de {Math.abs(activityDelta)}% sur cette période. Génère une analyse pour une recommandation détaillée.
          </div>
        ) : (
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>Génère une analyse pour voir ce que Closia remarque dans votre activité.</div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children }) {
  return <div className="display" style={{ fontWeight: 700, fontSize: "12.5px", color: "var(--text-dim)", letterSpacing: "0.02em", marginBottom: "10px", marginTop: "4px" }}>{children.toUpperCase()}</div>;
}

function DeltaKpiTile({ value, label, delta }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
      <div className="mono" style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px", marginBottom: "4px" }}>{label}</div>
      <DeltaLine delta={delta} />
    </div>
  );
}

function HealthTile({ value, label, sub, accent }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: `2.5px solid ${accent}`, borderRadius: "10px", padding: "14px" }}>
      <div className="mono" style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text)", marginTop: "2px" }}>{label}</div>
      <div style={{ fontSize: "10.5px", color: "var(--text-faint)", marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

function SmartKpiTile({ value, label, desc }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
      <div className="mono" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>{value !== null ? value : "—"}</div>
      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>{label}</div>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "4px" }}>{desc}</div>
    </div>
  );
}

function KpiTile({ value, label }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
      <div className="mono" style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>{label}</div>
    </div>
  );
}

function QualityTile({ value, label }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
      <div className="mono" style={{ fontSize: "18px", fontWeight: 700, color: "var(--blue)" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>{label}</div>
    </div>
  );
}

function FunnelChart({ steps, finalValue, finalLabel }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ textAlign: "center" }}>
            <div className="mono" style={{ fontSize: "18px", fontWeight: 700, color: "var(--blue)" }}>{s.value}</div>
            <div style={{ fontSize: "10.5px", color: "var(--text-faint)", width: "100px" }}>{s.label}</div>
            <div style={{ height: "5px", width: "100px", background: "var(--panel2)", borderRadius: "3px", marginTop: "4px", overflow: "hidden" }}>
              <div style={{ width: `${Math.max((s.value / max) * 100, 3)}%`, height: "100%", background: "var(--blue)", borderRadius: "3px" }} />
            </div>
          </div>
          {i < steps.length - 1 && <span style={{ color: "var(--text-faint)", fontSize: "14px", marginBottom: "20px" }}>→</span>}
        </div>
      ))}
      <span style={{ color: "var(--text-faint)", fontSize: "14px", marginBottom: "20px" }}>→</span>
      <div style={{ textAlign: "center" }}>
        <div className="mono" style={{ fontSize: "18px", fontWeight: 700, color: "#527a61" }}>{finalValue}</div>
        <div style={{ fontSize: "10.5px", color: "var(--text-faint)", width: "110px" }}>{finalLabel}</div>
      </div>
    </div>
  );
}

const METRIC_DIMENSIONS = [
  { key: "day", label: "Jour (tendance)", source: "activities", timeSeries: true },
  { key: "stage", label: "Étape du pipeline", source: "prospects" },
  { key: "status", label: "Statut", source: "prospects" },
  { key: "activity_type", label: "Type d'activité", source: "activities" },
  { key: "weekday", label: "Jour de la semaine", source: "activities" },
];

const METRIC_MEASURES = [
  { key: "count", label: "Nombre" },
  { key: "value", label: "Valeur totale (€)", requiresSource: "prospects" },
];

const CHART_TYPES = [
  { key: "bar", label: "Barres" },
  { key: "pie", label: "Camembert" },
  { key: "table", label: "Tableau" },
];

const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const METRIC_PALETTE = ["#147ff5", "#b8862e", "#16a34a", "#dc2626", "#7c3aed", "#64748b", "#0ea5e9", "#ea580c"];

function computeMetricData(prospects, activities, dimensionKey, measureKey, periodDays) {
  const dim = METRIC_DIMENSIONS.find((d) => d.key === dimensionKey);
  if (!dim) return [];

  if (dimensionKey === "day") {
    const bucketCount = Math.min(periodDays || 30, 30);
    const step = (periodDays || 30) / bucketCount;
    const buckets = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const end = daysAgo(Math.round(i * step));
      const start = daysAgo(Math.round((i + 1) * step));
      buckets.push({ start, end, value: 0, label: end.toLocaleDateString("fr-FR", { day: "numeric", month: step > 3 ? "short" : undefined }) });
    }
    activities.forEach((a) => {
      const t = new Date(a.created_at);
      if (t < buckets[0].start) return;
      const b = buckets.find((b) => t >= b.start && t < b.end) || buckets[buckets.length - 1];
      b.value += 1;
    });
    return buckets.map((b) => ({ label: b.label, value: b.value }));
  }

  const groups = {};
  if (dim.source === "prospects") {
    prospects.forEach((p) => {
      const key = dimensionKey === "stage" ? (p.stage || "—") : (STATUS_META[p.status]?.label || p.status || "—");
      groups[key] = groups[key] || { count: 0, value: 0 };
      groups[key].count += 1;
      groups[key].value += p.deal_value || 0;
    });
  } else {
    activities.forEach((a) => {
      const key = dimensionKey === "activity_type" ? (ACTIVITY_LABEL[a.type] || a.type) : WEEKDAY_LABELS[new Date(a.created_at).getDay()];
      groups[key] = groups[key] || { count: 0, value: 0 };
      groups[key].count += 1;
    });
  }

  return Object.entries(groups)
    .map(([label, g]) => ({ label, value: measureKey === "value" ? g.value : g.count }))
    .sort((a, b) => b.value - a.value);
}

function AIQuerySection({ prospects, activities, session, days }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function ask() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const stageGroups = computeMetricData(prospects, activities, "stage", "count", days);
      const statusGroups = computeMetricData(prospects, activities, "status", "count", days);
      const activityGroups = computeMetricData(prospects, activities, "activity_type", "count", days);
      const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
      const won = prospects.filter((p) => p.stage === "Gagné");
      const lost = prospects.filter((p) => p.stage === "Perdu");
      const totalOpenValue = open.reduce((s, p) => s + (p.deal_value || 0), 0);
      const totalWonValue = won.reduce((s, p) => s + (p.deal_value || 0), 0);
      const topDeals = [...open]
        .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0))
        .slice(0, 10)
        .map((p) => `${p.company} · ${p.stage} · ${formatEuros(p.deal_value || 0)} · dernier contact ${p.last_contact_at ? formatShortDate(p.last_contact_at) : "jamais"}`);

      const prompt = `Tu es l'assistant data d'un CRM commercial (Closia). Voici les données réelles disponibles (période : ${days} derniers jours) :

Pipeline par étape : ${stageGroups.map((g) => `${g.label} (${g.value})`).join(", ") || "aucune donnée"}
Pipeline par statut : ${statusGroups.map((g) => `${g.label} (${g.value})`).join(", ") || "aucune donnée"}
Activités par type : ${activityGroups.map((g) => `${g.label} (${g.value})`).join(", ") || "aucune donnée"}
Deals ouverts : ${open.length}, valeur totale ${formatEuros(totalOpenValue)}
Deals gagnés : ${won.length}, valeur totale ${formatEuros(totalWonValue)}
Deals perdus : ${lost.length}
Plus gros deals ouverts :
${topDeals.join("\n") || "aucun"}

Demande de l'utilisateur : "${query.trim()}"

Réponds UNIQUEMENT en JSON valide, sans texte autour, avec l'un de ces deux formats selon ce qui convient le mieux à la demande :
- Tableau : {"type": "table", "title": "...", "columns": ["...", "..."], "rows": [["...", "..."], ["...", "..."]]}
- Recommandations : {"type": "recommendations", "title": "...", "items": ["...", "..."]}

Base-toi UNIQUEMENT sur les données fournies ci-dessus, n'invente aucun chiffre ni aucune donnée. Si les données disponibles ne permettent pas de répondre précisément à la demande, dis-le dans "title" et fournis le meilleur résumé possible avec ce qui est disponible.`;

      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed || (parsed.type !== "table" && parsed.type !== "recommendations")) throw new Error("parse_failed");
      setResult(parsed);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "La demande a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
        <SparklesIcon size={13} color="var(--violet)" />
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--violet)" }}>Demander à l'IA</span>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder="Ex : mes deals par étape ce trimestre, ou des recommandations pour améliorer ma conversion"
          style={{ ...selectSm, flex: 1, minWidth: "240px" }}
        />
        <button className="focusable" onClick={ask} disabled={loading || !query.trim()} style={{ fontSize: "12.5px", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", background: "var(--blue)", color: "#fff", border: "none", opacity: loading || !query.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {loading ? "Analyse..." : "Demander"}
        </button>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "10px" }}>{error}</div>}

      {result && (
        <div style={{ marginTop: "16px" }}>
          {result.title && <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginBottom: "10px" }}>{result.title}</div>}
          {result.type === "table" ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--hairline)" }}>
                    {(result.columns || []).map((c, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "6px 10px", fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows || []).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--hairline)" }}>
                      {row.map((cell, j) => <td key={j} style={{ padding: "8px 10px", color: "var(--text)", whiteSpace: "nowrap" }}>{String(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {(result.items || []).map((it, i) => <li key={i} style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5 }}>{it}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CustomMetricsSection({ prospects, activities, session, days }) {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState("");
  const [dimension, setDimension] = useState("day");
  const [measure, setMeasure] = useState("count");
  const [chartType, setChartType] = useState("bar");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("custom_metrics").select("*").eq("user_id", session.user.id).order("created_at", { ascending: true }).then(({ data }) => {
      setSaved(data || []);
      setLoading(false);
    });
  }, [session.user.id]);

  const dimMeta = METRIC_DIMENSIONS.find((d) => d.key === dimension);
  const availableMeasures = METRIC_MEASURES.filter((m) => !m.requiresSource || m.requiresSource === dimMeta?.source);

  useEffect(() => {
    if (!availableMeasures.find((m) => m.key === measure)) setMeasure(availableMeasures[0]?.key || "count");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension]);

  async function saveMetric() {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("custom_metrics").insert({ user_id: session.user.id, name: name.trim(), dimension, measure, chart_type: chartType }).select().single();
    setSaving(false);
    if (!error && data) {
      setSaved((prev) => [...prev, data]);
      setName("");
      setShowBuilder(false);
    }
  }

  async function removeMetric(id) {
    await supabase.from("custom_metrics").delete().eq("id", id);
    setSaved((prev) => prev.filter((m) => m.id !== id));
  }

  const previewData = computeMetricData(prospects, activities, dimension, measure, days);

  return (
    <div style={{ marginBottom: "26px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px" }}>Vos métriques personnalisées</div>
        <button className="focusable" onClick={() => setShowBuilder((s) => !s)} style={{ fontSize: "11.5px", fontWeight: 600, padding: "6px 12px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555" }}>
          {showBuilder ? "Fermer" : "+ Créer une métrique"}
        </button>
      </div>

      {showBuilder ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <select value={dimension} onChange={(e) => setDimension(e.target.value)} style={selectSm}>
              {METRIC_DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <span style={{ alignSelf: "center", fontSize: "12px", color: "var(--text-faint)" }}>croisé avec</span>
            <select value={measure} onChange={(e) => setMeasure(e.target.value)} style={selectSm}>
              {availableMeasures.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <span style={{ alignSelf: "center", fontSize: "12px", color: "var(--text-faint)" }}>en</span>
            <select value={chartType} onChange={(e) => setChartType(e.target.value)} style={selectSm}>
              {CHART_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <MetricChart data={previewData} chartType={chartType} measure={measure} timeSeries={dimMeta?.timeSeries} />

          <div style={{ display: "flex", gap: "8px", marginTop: "14px", alignItems: "center" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la métrique (ex : Deals par étape)" style={{ ...selectSm, flex: 1 }} />
            <button className="focusable" onClick={saveMetric} disabled={saving || !name.trim()} style={{ fontSize: "12px", fontWeight: 600, padding: "8px 14px", borderRadius: "6px", background: "var(--blue)", color: "#fff", border: "none", opacity: saving || !name.trim() ? 0.6 : 1 }}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : !loading && saved.length === 0 && (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginBottom: "10px" }}>Aperçu — activité par jour. Clique sur "Créer une métrique" pour choisir tes propres dimensions et graphique.</div>
          <MetricChart data={previewData} chartType={chartType} measure={measure} timeSeries={dimMeta?.timeSeries} />
        </div>
      )}

      {!loading && saved.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {saved.map((m) => (
            <div key={m.id} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <span className="display" style={{ fontWeight: 600, fontSize: "12.5px" }}>{m.name}</span>
                <button className="focusable" onClick={() => removeMetric(m.id)} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "12px" }}>✕</button>
              </div>
              <MetricChart data={computeMetricData(prospects, activities, m.dimension, m.measure, days)} chartType={m.chart_type} measure={m.measure} timeSeries={METRIC_DIMENSIONS.find((d) => d.key === m.dimension)?.timeSeries} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricChart({ data, chartType, measure, compact, timeSeries }) {
  if (data.length === 0) return <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Pas de données pour ce croisement.</div>;
  const fmt = (v) => (measure === "value" ? formatEuros(v) : v);

  if (chartType === "bar" && timeSeries) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const showLabels = data.length <= 14;
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: compact ? "80px" : "140px" }}>
        {data.map((d, i) => (
          <div key={i} title={`${d.label} · ${fmt(d.value)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ width: "100%", maxWidth: "22px", height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 1)}%`, background: d.value > 0 ? "var(--blue)" : "var(--panel2)", borderRadius: "3px 3px 0 0" }} />
            {showLabels && !compact && <div style={{ fontSize: "9px", color: "var(--text-faint)", marginTop: "4px", transform: "rotate(-40deg)", whiteSpace: "nowrap" }}>{d.label}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? "11.5px" : "12.5px" }}>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid var(--hairline)" }}>
              <td style={{ padding: "5px 4px", color: "var(--text)" }}>{d.label}</td>
              <td style={{ padding: "5px 4px", textAlign: "right", fontWeight: 600, color: "var(--text)" }} className="mono">{fmt(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (chartType === "pie") {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let acc = 0;
    const stops = data.map((d, i) => {
      const start = (acc / total) * 360;
      acc += d.value;
      const end = (acc / total) * 360;
      return `${METRIC_PALETTE[i % METRIC_PALETTE.length]} ${start}deg ${end}deg`;
    });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ width: compact ? "80px" : "110px", height: compact ? "80px" : "110px", borderRadius: "50%", background: `conic-gradient(${stops.join(", ")})`, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {data.slice(0, 8).map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: compact ? "11px" : "12px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: METRIC_PALETTE[i % METRIC_PALETTE.length], flexShrink: 0 }} />
              <span style={{ color: "var(--text-dim)" }}>{d.label}</span>
              <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {data.slice(0, 10).map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: compact ? "70px" : "100px", fontSize: compact ? "11px" : "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: "14px", background: "var(--panel2)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${Math.max((d.value / max) * 100, 3)}%`, height: "100%", background: "var(--blue)", borderRadius: "3px" }} />
          </div>
          <span className="mono" style={{ fontSize: compact ? "11px" : "12px", fontWeight: 600, color: "var(--text)", width: "56px", textAlign: "right", flexShrink: 0 }}>{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

const selectSm = {
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "13px",
  padding: "8px 10px",
};
