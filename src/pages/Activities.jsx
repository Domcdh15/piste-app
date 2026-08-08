import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatShortDate, formatEuros, callAI, parseJsonLoose, PhoneIcon, XIcon, TrophyIcon, MailIcon, CalendarIcon, ClockIcon, SparklesIcon, ListIcon, UsersIcon, LinkedinIcon, AlertIcon, PageTitle } from "../lib/ui.jsx";

const PERIOD_DAYS = { "7": 7, "30": 30, "90": 90 };
const PERIODS = [["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"]];

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
  "Appel abouti": <PhoneIcon size={13} color="#0ea968" />,
  "Appel manqué": <XIcon size={13} color="var(--red)" />,
  "RDV physique": <CalendarIcon size={13} color="var(--blue)" />,
  "Visio": <CalendarIcon size={13} color="var(--violet)" />,
  "Message LinkedIn": <LinkedinIcon size={13} color="var(--blue)" />,
  "Email de relance": <MailIcon size={13} color="var(--blue)" />,
  "Devis": <MailIcon size={13} color="var(--gold-deep)" />,
  "Rendez-vous": <CalendarIcon size={13} color="var(--blue)" />,
  "Note": <ClockIcon size={13} color="var(--text-dim)" />,
  "Analyse IA": <SparklesIcon size={13} color="var(--blue)" />,
  "Deal gagné": <TrophyIcon size={13} color="#0ea968" />,
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

export default function Activities({ prospects, onOpenProspect, session, team }) {
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
    <div style={{ padding: "28px 32px 60px", maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
        <PageTitle icon={ListIcon} color="#0284c7">Activité & Données</PageTitle>
      </div>
      <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px", marginBottom: "22px", width: "fit-content" }}>
        {[["activite", "Activité"], ["performance", "Performance"]].map(([key, label]) => (
          <button key={key} className="focusable" onClick={() => setTab(key)} style={{ padding: "7px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 500, background: tab === key ? "var(--bg)" : "transparent", color: tab === key ? "var(--blue)" : "var(--text-dim)", boxShadow: tab === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
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
        <PerformanceTab prospects={prospects} activities={activities} feedItems={feedItems} session={session} teamStats={teamStats} />
      )}
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
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500, background: filter === key ? "var(--blue-dim)" : "var(--panel2)", color: filter === key ? "var(--blue)" : "var(--text-dim)", border: filter === key ? "0.5px solid #2a3ed655" : "0.5px solid var(--hairline)" }}
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

function PerformanceTab({ prospects, activities, feedItems, session, teamStats }) {
  const [period, setPeriod] = useState("30");
  const [chartFilter, setChartFilter] = useState("Toutes");
  const [insight, setInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const days = PERIOD_DAYS[period];
  const start = daysAgo(days);
  const prevStart = daysAgo(days * 2);

  const inRange = activities.filter((a) => new Date(a.created_at) >= start);
  const emailsInRange = feedItems.filter((i) => i.filterKey === "Emails" && new Date(i.created_at) >= start);
  const nbAppels = inRange.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque").length;
  const nbRdv = inRange.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio").length;
  const opportunitesCreees = prospects.filter((p) => p.created_at && new Date(p.created_at) >= start).length;
  const totalActivites = inRange.length + emailsInRange.length;

  const prevActs = activities.filter((a) => new Date(a.created_at) >= prevStart && new Date(a.created_at) < start);
  const prevEmails = feedItems.filter((i) => i.filterKey === "Emails" && new Date(i.created_at) >= prevStart && new Date(i.created_at) < start);
  const prevTotal = prevActs.length + prevEmails.length;
  const activityDelta = prevTotal > 0 ? Math.round(((totalActivites - prevTotal) / prevTotal) * 100) : null;

  const gagnes = prospects.filter((p) => p.stage === "Gagné" && p.closed_at && new Date(p.closed_at) >= start);
  const perdus = prospects.filter((p) => p.stage === "Perdu" && p.closed_at && new Date(p.closed_at) >= start);
  const caGenere = gagnes.reduce((sum, p) => sum + (p.deal_value || 0), 0);
  const tauxConversion = gagnes.length + perdus.length > 0 ? Math.round((gagnes.length / (gagnes.length + perdus.length)) * 100) : null;
  const tauxRdv = totalActivites > 0 ? Math.round((nbRdv / totalActivites) * 100) : null;
  const cycles = gagnes.filter((p) => p.created_at).map((p) => Math.round((new Date(p.closed_at) - new Date(p.created_at)) / 86400000));
  const avgCycle = cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : null;
  const avgDealValue = gagnes.length > 0 ? Math.round(caGenere / gagnes.length) : null;

  async function generateInsight() {
    setLoadingInsight(true);
    try {
      const prompt = `Tu es un coach commercial. Voici les données d'activité d'un commercial sur les ${days} derniers jours, comparées à la période précédente équivalente. Rédige UNE observation concrète (2-3 phrases max) avec une suggestion actionnable. Réponds uniquement avec le texte, sans préambule, en français.

Activités cette période : ${totalActivites} (dont ${nbAppels} appels, ${emailsInRange.length} emails, ${nbRdv} rendez-vous)
Activités période précédente : ${prevTotal}
Opportunités créées : ${opportunitesCreees}
Taux de conversion : ${tauxConversion !== null ? tauxConversion + "%" : "non disponible"}
Durée moyenne du cycle de vente : ${avgCycle !== null ? avgCycle + " jours" : "non disponible"}`;
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
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Comprenez votre activité commerciale.</div>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} className="focusable" onClick={() => setPeriod(key)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: period === key ? "var(--bg)" : "transparent", color: period === key ? "var(--blue)" : "var(--text-dim)", boxShadow: period === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <KpiTile value={totalActivites} label="Activités" />
        <KpiTile value={nbAppels} label="Appels" />
        <KpiTile value={emailsInRange.length} label="Emails" />
        <KpiTile value={nbRdv} label="Rendez-vous" />
        <KpiTile value={opportunitesCreees} label="Opportunités créées" />
      </div>

      <div style={{ marginBottom: "26px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", marginBottom: "12px" }}>Votre activité génère-t-elle des opportunités ?</div>
        <FunnelChart steps={[
          { label: "Activités", value: totalActivites },
          { label: "Rendez-vous", value: nbRdv },
          { label: "Opportunités créées", value: opportunitesCreees },
          { label: "Deals gagnés", value: gagnes.length },
        ]} finalValue={formatEuros(caGenere)} finalLabel="de CA généré" />
      </div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "13px" }}>Activité commerciale</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {["Toutes", "Appels", "Emails", "RDV"].map((f) => (
              <button key={f} className="focusable" onClick={() => setChartFilter(f)} style={{ padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, background: chartFilter === f ? "var(--blue-dim)" : "var(--panel2)", color: chartFilter === f ? "var(--blue)" : "var(--text-dim)" }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <ActivityTrendChart activities={activities} feedItems={feedItems} days={days} filter={chartFilter} />
      </div>

      <div style={{ marginBottom: "26px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", marginBottom: "12px" }}>Qualité de l'activité</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          <QualityTile value={tauxConversion !== null ? `${tauxConversion}%` : "—"} label="Opportunités gagnées" />
          <QualityTile value={tauxRdv !== null ? `${tauxRdv}%` : "—"} label="Part de rendez-vous dans l'activité" />
          <QualityTile value={avgCycle !== null ? `${avgCycle} j` : "—"} label="Durée moyenne du cycle" />
          <QualityTile value={avgDealValue !== null ? formatEuros(avgDealValue) : "—"} label="Montant moyen par deal gagné" />
        </div>
      </div>

      <div style={{ background: "var(--blue-dim)", border: "0.5px solid #2a3ed655", borderRadius: "12px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "13px", color: "var(--blue)" }}>✨ Ce que Closia remarque</span>
          {!insight && (
            <button className="focusable" onClick={generateInsight} disabled={loadingInsight} style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "6px", background: "var(--panel)", color: "var(--blue)", border: "0.5px solid #2a3ed640" }}>
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
        <div className="mono" style={{ fontSize: "18px", fontWeight: 700, color: "#0ea968" }}>{finalValue}</div>
        <div style={{ fontSize: "10.5px", color: "var(--text-faint)", width: "110px" }}>{finalLabel}</div>
      </div>
    </div>
  );
}

function ActivityTrendChart({ activities, feedItems, days, filter }) {
  const buckets = [];
  const bucketCount = Math.min(days, 30);
  const step = days / bucketCount;
  for (let i = bucketCount - 1; i >= 0; i--) {
    const end = daysAgo(Math.round(i * step));
    const start = daysAgo(Math.round((i + 1) * step));
    buckets.push({ start, end, count: 0, label: end.toLocaleDateString("fr-FR", { day: "numeric", month: step > 3 ? "short" : undefined }) });
  }

  function inFilter(kindFilter) {
    if (filter === "Toutes") return true;
    if (filter === "Appels") return kindFilter === "appel_abouti" || kindFilter === "appel_manque";
    if (filter === "RDV") return kindFilter === "rdv_physique" || kindFilter === "appel_visio";
    return false;
  }

  activities.forEach((a) => {
    if (filter !== "Toutes" && filter !== "Emails" && !inFilter(a.type)) return;
    if (filter === "Emails") return;
    const t = new Date(a.created_at);
    const b = buckets.find((b) => t >= b.start && t < b.end) || buckets[buckets.length - 1];
    if (t >= buckets[0].start) b.count += 1;
  });
  if (filter === "Toutes" || filter === "Emails") {
    feedItems.filter((i) => i.filterKey === "Emails").forEach((e) => {
      const t = new Date(e.created_at);
      const b = buckets.find((b) => t >= b.start && t < b.end) || buckets[buckets.length - 1];
      if (t >= buckets[0].start) b.count += 1;
    });
  }

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const showLabels = bucketCount <= 14;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "140px" }}>
      {buckets.map((b, i) => (
        <div key={i} title={`${b.label} · ${b.count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ width: "100%", maxWidth: "22px", height: `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 1)}%`, background: b.count > 0 ? "var(--blue)" : "var(--panel2)", borderRadius: "3px 3px 0 0" }} />
          {showLabels && <div style={{ fontSize: "9px", color: "var(--text-faint)", marginTop: "4px", transform: "rotate(-40deg)", whiteSpace: "nowrap" }}>{b.label}</div>}
        </div>
      ))}
    </div>
  );
}
