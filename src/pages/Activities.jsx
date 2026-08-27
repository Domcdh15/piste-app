import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Avatar, formatShortDate, formatEuros, callAI, parseJsonLoose, STATUS_META, OPEN_STAGES, computeDealScore, TargetIcon, PhoneIcon, XIcon, TrophyIcon, MailIcon, CalendarIcon, ClockIcon, SparklesIcon, UsersIcon, LinkedinIcon, AlertIcon } from "../lib/ui.jsx";

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

export default function Activities({ prospects, onOpenProspect, session, team, settings, setActiveTab }) {
  const [tab, setTab] = useState("activite");
  const [filter, setFilter] = useState("Tous");
  const [feedItems, setFeedItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamStats, setTeamStats] = useState(null);
  const [memberStats, setMemberStats] = useState([]);

  useEffect(() => {
    if (!team || (team.members || []).length <= 1) {
      setTeamStats(null);
      setMemberStats([]);
      return;
    }
    // Les deux fonctions appliquent elles-mêmes le niveau de visibilité choisi
    // par l'admin : elles ne renvoient rien quand il n'est pas ouvert.
    supabase.rpc("team_stats_for_me").then(({ data }) => setTeamStats(data?.[0] || null));
    supabase.rpc("team_stats_by_member").then(({ data }) => setMemberStats(data || []));
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
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <div style={{ padding: "32px 32px 0" }}>
        <div className="hero-card" style={{ padding: "26px 32px" }}>
          <div className="h2" style={{ position: "relative", zIndex: 1, color: "#fff" }}>Activité &amp; Données</div>
        </div>
      </div>

      <div style={{ padding: "22px 32px 60px", maxWidth: "900px" }}>
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
          memberStats={memberStats}
          team={team}
        />
      ) : (
        <PerformanceTab prospects={prospects} activities={activities} feedItems={feedItems} session={session} teamStats={teamStats} settings={settings} setActiveTab={setActiveTab} onOpenProspect={onOpenProspect} />
      )}
      </div>
    </div>
  );
}

function ActivityTab({ prospects, feedItems, activities, loading, filter, setFilter, onOpenProspect, teamStats, memberStats, team }) {
  const [drill, setDrill] = useState(null);
  const nameOf = (id) => {
    const p = prospects.find((x) => x.id === id);
    return p ? (p.company || p.name) : "Prospect supprimé";
  };
  const contactOf = (id) => {
    const p = prospects.find((x) => x.id === id);
    return p && p.company ? p.name : "";
  };
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

      {memberStats.length > 0 && <TeamMemberBreakdown memberStats={memberStats} team={team} />}

      <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", marginBottom: "10px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>Aujourd'hui · {todayActs.length + todayEmails.length} activités</span>
        <StatChip
          label="appels"
          value={nbAppels}
          onDrill={() => setDrill({
            title: "Appels du jour",
            subtitle: "Qui a été appelé aujourd'hui",
            rows: todayActs.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque").map((a) => ({
              id: a.id,
              name: nameOf(a.prospect_id),
              sub: [contactOf(a.prospect_id), ACTIVITY_LABEL[a.type] || a.type, a.note].filter(Boolean).join(" · "),
              value: new Date(a.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              prospectId: a.prospect_id,
            })),
          })}
        />
        <StatChip
          label="emails"
          value={todayEmails.length}
          onDrill={() => setDrill({
            title: "Emails du jour",
            subtitle: "À qui vous avez écrit aujourd'hui",
            rows: todayEmails.map((e) => ({
              id: e.id,
              name: nameOf(e.prospect_id),
              sub: [contactOf(e.prospect_id), e.kind].filter(Boolean).join(" · "),
              value: new Date(e.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              prospectId: e.prospect_id,
            })),
          })}
        />
        <StatChip
          label="rendez-vous"
          value={nbRdv}
          onDrill={() => setDrill({
            title: "Rendez-vous du jour",
            subtitle: "Qui vous avez rencontré aujourd'hui",
            rows: todayActs.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio").map((a) => ({
              id: a.id,
              name: nameOf(a.prospect_id),
              sub: [contactOf(a.prospect_id), ACTIVITY_LABEL[a.type] || a.type, a.note].filter(Boolean).join(" · "),
              value: new Date(a.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              prospectId: a.prospect_id,
            })),
          })}
        />
      </div>

      {drill && <DrillModal {...drill} onClose={() => setDrill(null)} onOpenProspect={onOpenProspect} />}

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

// Détail nominatif : n'apparaît que si l'administrateur a ouvert ce niveau —
// la fonction en base ne renvoie rien dans les deux autres cas.
function TeamMemberBreakdown({ memberStats, team }) {
  const members = team?.members || [];

  function nameOf(userId) {
    const m = members.find((x) => x.user_id === userId);
    if (!m) return "Ancien membre";
    return m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}`.trim() : m.email;
  }

  const rows = [...memberStats].sort((a, b) => Number(b.revenue_won || 0) - Number(a.revenue_won || 0));
  const best = Number(rows[0]?.revenue_won || 0);

  return (
    <div className="dash-card" style={{ padding: "16px 18px", marginBottom: "18px" }}>
      <div className="section-eyebrow" style={{ marginBottom: "12px" }}>Par commercial</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {rows.map((r) => {
          const revenue = Number(r.revenue_won || 0);
          return (
            <div key={r.member_id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 110px", alignItems: "center", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nameOf(r.member_id)}
                </div>
                <div style={{ height: "4px", borderRadius: "3px", background: "var(--panel2)", marginTop: "5px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: best > 0 ? `${Math.max(3, (revenue / best) * 100)}%` : "0%", background: "var(--blue)", borderRadius: "3px" }} />
                </div>
              </div>
              <span className="mono" style={{ fontSize: "12px", color: "var(--text-dim)", textAlign: "right" }}>
                {r.deals_won} gagné{Number(r.deals_won) > 1 ? "s" : ""}
              </span>
              <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", textAlign: "right" }}>
                {formatEuros(revenue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Fenêtre de détail derrière un chiffre. Un indicateur sans sa liste oblige à
// aller la reconstituer ailleurs ; ici on la donne sur place.
// Attributs communs à toute tuile ouvrable : elle doit être atteignable au
// clavier et s'annoncer, pas seulement réagir au clic.
function drillProps(onDrill) {
  if (!onDrill) return {};
  return {
    role: "button",
    tabIndex: 0,
    className: "focusable",
    title: "Voir le détail",
    onClick: onDrill,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrill(); } },
  };
}

function DrillModal({ title, subtitle, rows, onClose, onOpenProspect }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 130, padding: "20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--panel)", border: "0.5px solid var(--hairline-strong)", borderRadius: "14px", boxShadow: "var(--shadow-md)", width: "100%", maxWidth: "460px", maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", padding: "18px 20px 14px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--text)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>{subtitle}</div>}
          </div>
          <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "14px", padding: 0, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "10px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "22px 12px", fontSize: "13px", color: "var(--text-faint)", textAlign: "center", lineHeight: 1.5 }}>
              Rien à afficher sur cette période.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {rows.map((r) => (
                <button
                  key={r.id}
                  className="focusable list-row"
                  disabled={!r.prospectId}
                  onClick={() => r.prospectId && onOpenProspect?.(r.prospectId)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left", background: "none", border: "none", padding: "10px 11px", cursor: r.prospectId ? "pointer" : "default", width: "100%" }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    {r.sub && <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-dim)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>}
                  </span>
                  {r.value && <span className="mono" style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{r.value}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div style={{ padding: "10px 20px 14px", borderTop: "0.5px solid var(--hairline)", fontSize: "11px", color: "var(--text-faint)" }}>
            {rows.length} ligne{rows.length > 1 ? "s" : ""} · cliquez pour ouvrir la fiche
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, onDrill }) {
  const Tag = onDrill ? "button" : "div";
  return (
    <Tag
      {...(onDrill ? { onClick: onDrill, className: "focusable", title: "Voir le détail" } : {})}
      style={{ display: "flex", alignItems: "baseline", gap: "6px", background: "none", border: "none", padding: 0, cursor: onDrill ? "pointer" : "default", textDecoration: onDrill ? "underline" : "none", textDecorationColor: "var(--hairline-strong)", textUnderlineOffset: "3px" }}>
      <span className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{value}</span>
      <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{label}</span>
    </Tag>
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

function PerformanceTab({ prospects, activities, feedItems, session, teamStats, settings, setActiveTab, onOpenProspect }) {
  const [drill, setDrill] = useState(null);
  const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);
  const lastContactLabel = (p) => {
    const d = daysSince(p.last_contact_at);
    if (d === null) return "Jamais contacté";
    return d === 0 ? "Contacté aujourd'hui" : `Dernier échange il y a ${d} jour${d > 1 ? "s" : ""}`;
  };
  const activityRows = (list) => list
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((a) => ({
      id: a.id,
      name: nameOf(a.prospect_id),
      sub: [contactOf(a.prospect_id), ACTIVITY_LABEL[a.type] || a.type, a.note].filter(Boolean).join(" · "),
      value: formatShortDate(a.created_at),
      prospectId: a.prospect_id,
    }));
  const prospectOf = (id) => prospects.find((x) => x.id === id) || null;
  const nameOf = (id) => { const p = prospectOf(id); return p ? (p.company || p.name) : "Prospect supprimé"; };
  const contactOf = (id) => { const p = prospectOf(id); return p && p.company ? p.name : ""; };
  const rowOf = (p, value) => ({
    id: p.id,
    name: p.company || p.name,
    sub: [p.company ? p.name : null, p.stage].filter(Boolean).join(" · "),
    value,
    prospectId: p.id,
  });
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

  // On garde le prospect derrière chaque mesure : une moyenne sans sa
  // ventilation ne peut pas être ouverte.
  const firstResponses = prospects
    .filter((p) => p.created_at && new Date(p.created_at) >= start && activitiesByProspect[p.id]?.length)
    .map((p) => ({ p, hours: (new Date(activitiesByProspect[p.id][0].created_at) - new Date(p.created_at)) / 3600000 }))
    .filter((r) => r.hours >= 0);
  const avgFirstResponseH = firstResponses.length > 0 ? firstResponses.reduce((s, r) => s + r.hours, 0) / firstResponses.length : null;

  const gapsByProspect = [];
  const gaps = [];
  Object.entries(activitiesByProspect).forEach(([prospectId, list]) => {
    const own = [];
    for (let i = 1; i < list.length; i++) {
      const gap = (new Date(list[i].created_at) - new Date(list[i - 1].created_at)) / 86400000;
      if (new Date(list[i].created_at) >= start) { gaps.push(gap); own.push(gap); }
    }
    if (own.length) {
      const p = prospects.find((x) => x.id === prospectId);
      if (p) gapsByProspect.push({ p, days: own.reduce((s, g) => s + g, 0) / own.length, count: own.length });
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

  // Répartition réelle du pipeline ouvert par étape.
  const stageRows = OPEN_STAGES
    .map((stage) => {
      const items = open.filter((p) => p.stage === stage);
      return { stage, value: items.reduce((sum, p) => sum + (p.deal_value || 0), 0), count: items.length };
    })
    .filter((r) => r.count > 0);

  // Opportunités ayant progressé d'étape sur la période, d'après l'historique.
  const advanced = open.filter((p) =>
    activities.some((a) => a.prospect_id === p.id && a.type === "note" && (a.note || "").startsWith("Étape passée") && new Date(a.created_at) >= start)
  );

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
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Comprenez ce qui fait avancer vos opportunités et ce qui mérite votre attention.</div>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} className="focusable" onClick={() => setPeriod(key)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: period === key ? "var(--bg)" : "transparent", color: period === key ? "var(--blue)" : "var(--text-dim)", boxShadow: period === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {drill && <DrillModal {...drill} onClose={() => setDrill(null)} onOpenProspect={onOpenProspect} />}

      {/* Résumé exécutif — quatre chiffres */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "22px" }}>
        <ExecKpi
          value={formatEuros(pipelineTotal)}
          label="Pipeline ouvert"
          sub={`${open.length} opportunité${open.length > 1 ? "s" : ""} active${open.length > 1 ? "s" : ""}`}
          onDrill={() => setDrill({
            title: "Pipeline ouvert",
            subtitle: "Les opportunités qui composent ce montant",
            rows: [...open].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))),
          })}
        />
        <ExecKpi
          value={gagnes.length}
          label="Deals gagnés"
          sub={tauxConversion !== null ? `${tauxConversion} % de conversion` : "Conversion non calculable"}
          onDrill={() => setDrill({
            title: "Deals gagnés",
            subtitle: "Sur la période sélectionnée",
            rows: [...gagnes].sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)).map((p) => rowOf(p, formatShortDate(p.closed_at))),
          })}
        />
        <ExecKpi
          value={formatEuros(caGenere)}
          label="CA généré"
          sub={avgCycle !== null ? `Cycle moyen ${avgCycle} j` : "Cycle non calculable"}
          onDrill={() => setDrill({
            title: "CA généré",
            subtitle: "Les deals gagnés qui composent ce montant",
            rows: [...gagnes].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))),
          })}
        />
        <ExecKpi
          value={pctWithNextAction !== null ? `${pctWithNextAction}/100` : "—"}
          label="Indice de suivi"
          sub={pctWithNextAction !== null ? "Opportunités avec une action planifiée" : "Données insuffisantes"}
          accent="var(--blue)"
          onDrill={pctWithNextAction === null ? undefined : () => setDrill({
            title: "Opportunités sans prochaine action",
            subtitle: "Celles qui font baisser l'indice — ce sont elles qu'il faut traiter",
            rows: open.filter((p) => !withNextAction.some((w) => w.id === p.id)).sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))),
          })}
        />
      </div>

      {/* Ce qui mérite votre attention */}
      <div className="dash-card" style={{ padding: "18px 20px", marginBottom: "26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <TargetIcon size={14} color="var(--blue)" />
          <span className="display" style={{ fontWeight: 700, fontSize: "13.5px" }}>Ce qui mérite votre attention</span>
        </div>
        {sansAction.length === 0 && atRisk.length === 0 && advanced.length === 0 ? (
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "8px" }}>
            Votre portefeuille est correctement suivi — aucune alerte importante actuellement.
          </div>
        ) : (
          <div>
            {sansAction.length > 0 && (
              <AttentionRow
                dot="var(--red)"
                count={sansAction.length}
                title={`opportunité${sansAction.length > 1 ? "s" : ""} sans prochaine action`}
                detail="Risque de perdre le suivi — aucune tâche ni relance planifiée."
                actionLabel="Voir"
                onAction={() => setDrill({
                  title: "Opportunités sans prochaine action",
                  subtitle: "Aucune tâche ni relance planifiée sur ces dossiers",
                  rows: [...sansAction].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => ({
                    id: p.id,
                    name: p.company || p.name,
                    sub: [p.company ? p.name : null, lastContactLabel(p)].filter(Boolean).join(" · "),
                    value: formatEuros(p.deal_value || 0),
                    prospectId: p.id,
                  })),
                })}
              />
            )}
            {atRisk.length > 0 && (
              <AttentionRow
                dot="var(--amber, #b45309)"
                count={atRisk.length}
                title={`deal${atRisk.length > 1 ? "s" : ""} à risque`}
                detail="Aucun échange depuis plus de sept jours."
                actionLabel="Voir"
                onAction={() => setDrill({
                  title: "Deals à risque",
                  subtitle: "Aucun échange depuis plus de sept jours",
                  rows: [...atRisk]
                    .sort((a, b) => (daysSince(b.last_contact_at) ?? 9999) - (daysSince(a.last_contact_at) ?? 9999))
                    .map((p) => ({
                      id: p.id,
                      name: p.company || p.name,
                      sub: [p.company ? p.name : null, lastContactLabel(p)].filter(Boolean).join(" · "),
                      value: formatEuros(p.deal_value || 0),
                      prospectId: p.id,
                    })),
                })}
              />
            )}
            {advanced.length > 0 && (
              <AttentionRow
                dot="var(--success)"
                count={advanced.length}
                title={`opportunité${advanced.length > 1 ? "s" : ""} ${advanced.length > 1 ? "ont" : "a"} changé d'étape`}
                detail="Priorisez leur suivi pendant qu'elles avancent."
                actionLabel="Voir"
                onAction={() => setDrill({
                  title: "Opportunités qui ont changé d'étape",
                  subtitle: "Sur la période sélectionnée",
                  rows: [...advanced].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => ({
                    id: p.id,
                    name: p.company || p.name,
                    sub: [p.company ? p.name : null, `Maintenant en « ${p.stage} »`].filter(Boolean).join(" · "),
                    value: formatEuros(p.deal_value || 0),
                    prospectId: p.id,
                  })),
                })}
              />
            )}
          </div>
        )}
      </div>

      {/* 1. Activité */}
      <SectionLabel>Activité</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <DeltaKpiTile
          value={nbAppels} label="Appels" delta={pctDelta(nbAppels, prevAppels)}
          onDrill={() => setDrill({ title: "Appels", subtitle: "Sur la période sélectionnée", rows: activityRows(inRange.filter((a) => a.type === "appel_abouti" || a.type === "appel_manque")) })}
        />
        <DeltaKpiTile
          value={emailsInRange.length} label="Emails" delta={pctDelta(emailsInRange.length, prevEmails.length)}
          onDrill={() => setDrill({ title: "Emails", subtitle: "Sur la période sélectionnée", rows: emailsInRange.map((e) => ({ id: e.id, name: nameOf(e.prospect_id), sub: [contactOf(e.prospect_id), e.kind].filter(Boolean).join(" · "), value: formatShortDate(e.created_at), prospectId: e.prospect_id })) })}
        />
        <DeltaKpiTile
          value={nbRdv} label="Rendez-vous" delta={pctDelta(nbRdv, prevRdv)}
          onDrill={() => setDrill({ title: "Rendez-vous", subtitle: "Sur la période sélectionnée", rows: activityRows(inRange.filter((a) => a.type === "rdv_physique" || a.type === "appel_visio")) })}
        />
        <DeltaKpiTile
          value={tachesTerminees} label="Tâches terminées" delta={pctDelta(tachesTerminees, prevTachesTerminees)}
          onDrill={() => setDrill({
            title: "Tâches terminées", subtitle: "Sur la période sélectionnée",
            rows: openTasks.filter((t) => t.completed_at && new Date(t.completed_at) >= start)
              .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
              .map((t) => ({ id: t.id, name: nameOf(t.prospect_id), sub: t.note, value: formatShortDate(t.completed_at), prospectId: t.prospect_id })),
          })}
        />
      </div>

      {/* 2. Réactivité */}
      <SectionLabel>Réactivité</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginBottom: "26px" }}>
        <SmartKpiTile
          value={avgFirstResponseH !== null ? (avgFirstResponseH < 24 ? `${Math.round(avgFirstResponseH)} h` : `${Math.round(avgFirstResponseH / 24)} j`) : null}
          label="Première réponse moyenne"
          desc="Temps moyen avant le premier échange avec un nouveau prospect."
          raw
          onDrill={() => setDrill({
            title: "Première réponse, prospect par prospect",
            subtitle: "Du plus lent au plus rapide — la moyenne vient de ces délais",
            rows: [...firstResponses].sort((a, b) => b.hours - a.hours).map((r) => ({
              id: r.p.id,
              name: r.p.company || r.p.name,
              sub: [r.p.company ? r.p.name : null, `Créé le ${formatShortDate(r.p.created_at)}`].filter(Boolean).join(" · "),
              value: r.hours < 24 ? `${Math.round(r.hours)} h` : `${Math.round(r.hours / 24)} j`,
              prospectId: r.p.id,
            })),
          })}
        />
        <SmartKpiTile
          value={avgGapDays !== null ? `${avgGapDays.toFixed(1)} j` : null}
          label="Délai moyen entre suivis"
          desc="Temps moyen écoulé entre deux interactions avec un même prospect."
          raw
          onDrill={() => setDrill({
            title: "Délai entre suivis, prospect par prospect",
            subtitle: "Du plus espacé au plus régulier",
            rows: [...gapsByProspect].sort((a, b) => b.days - a.days).map((r) => ({
              id: r.p.id,
              name: r.p.company || r.p.name,
              sub: [r.p.company ? r.p.name : null, `${r.count} intervalle${r.count > 1 ? "s" : ""} mesuré${r.count > 1 ? "s" : ""}`].filter(Boolean).join(" · "),
              value: `${r.days.toFixed(1)} j`,
              prospectId: r.p.id,
            })),
          })}
        />
        <SmartKpiTile
          value={onTimePct !== null ? `${onTimePct} %` : null}
          label="Tâches terminées à temps"
          desc="Part des tâches closes avant leur échéance."
          raw
          onDrill={() => setDrill({
            title: "Tâches closes et leur échéance",
            subtitle: "En retard d'abord — ce sont elles qui font baisser le taux",
            rows: [...tasksCompletedWithDue]
              .sort((a, b) => (new Date(b.completed_at) - new Date(b.due_at)) - (new Date(a.completed_at) - new Date(a.due_at)))
              .map((t) => {
                const late = new Date(t.completed_at) > new Date(t.due_at);
                const days = Math.abs(Math.round((new Date(t.completed_at) - new Date(t.due_at)) / 86400000));
                return {
                  id: t.id,
                  name: nameOf(t.prospect_id),
                  sub: [t.note, `échéance ${formatShortDate(t.due_at)}`].filter(Boolean).join(" · "),
                  value: late ? (days === 0 ? "en retard" : `+${days} j`) : "à temps",
                  prospectId: t.prospect_id,
                };
              }),
          })}
        />
      </div>

      {/* 3. Pipeline */}
      <SectionLabel>Pipeline</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "14px" }}>
        <KpiTile
          value={formatEuros(pipelineTotal)} label="Pipeline total"
          onDrill={() => setDrill({ title: "Pipeline total", subtitle: "Les opportunités qui composent ce montant", rows: [...open].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))) })}
        />
        <KpiTile
          value={open.length} label="Opportunités actives"
          onDrill={() => setDrill({ title: "Opportunités actives", subtitle: "Tout ce qui n'est ni gagné ni perdu", rows: [...open].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))) })}
        />
        <KpiTile
          value={open.length > 0 ? formatEuros(Math.round(pipelineTotal / open.length)) : "—"} label="Valeur moyenne"
          onDrill={open.length === 0 ? undefined : () => setDrill({
            title: "Valeur des opportunités",
            subtitle: `Moyenne calculée sur ${open.length} opportunité${open.length > 1 ? "s" : ""}`,
            rows: [...open].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0)).map((p) => rowOf(p, formatEuros(p.deal_value || 0))),
          })}
        />
      </div>
      <div className="dash-card" style={{ padding: "16px 18px", marginBottom: "14px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "12.5px", marginBottom: "12px" }}>Pipeline par étape</div>
        <StageBars rows={stageRows} onSelectStage={() => setActiveTab?.("pipeline")} />
      </div>
      <div className="dash-card" style={{ padding: "16px 18px", marginBottom: "26px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "12.5px" }}>Pipeline créé par mois</span>
          <DeltaLine delta={pipelineDelta} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "10px" }}>Valeur des opportunités créées chaque mois — pas un instantané du pipeline à date, que l'historique ne permet pas de reconstituer.</div>
        <MetricChart data={monthlyPipeline} chartType="bar" measure="value" timeSeries />
      </div>

      {/* 4. Conversion */}
      <SectionLabel>Conversion</SectionLabel>
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
      <SectionLabel>Santé du portefeuille</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "26px" }}>
        <button className="focusable" onClick={() => setActiveTab?.("a-sauver")} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <HealthTile value={atRisk.length} label="Deals à risque" sub="Sans activité depuis 7j+" accent="var(--red)" />
        </button>
        <button className="focusable" onClick={() => setActiveTab?.("pipeline")} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <HealthTile value={sansAction.length} label="Sans prochaine action" sub="Aucune tâche ni relance planifiée" accent="var(--amber, #b45309)" />
        </button>
        <HealthTile value={formatEuros(stagnantValue)} label="Pipeline stagnant" sub="Deals sans activité depuis 14j+" accent="var(--text-dim)" />
        <button className="focusable" onClick={() => setActiveTab?.("chauds")} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <HealthTile value={chauds.length} label="Opportunités chaudes" sub="Interactions récentes, fort engagement" accent="#527a61" />
        </button>
      </div>

      {/* 6. Indices Closia */}
      <SectionLabel>Indices Closia</SectionLabel>
      <div className="dash-card" style={{ padding: "18px 20px", marginBottom: "26px" }}>
        <IndexBar
          label="Suivi"
          value={pctWithNextAction}
          explain={pctWithNextAction >= 70 ? "La majorité des opportunités ont une prochaine action planifiée." : "Trop d'opportunités avancent sans prochaine action définie."}
        />
        <IndexBar
          label="Réactivité"
          value={onTimePct}
          explain={onTimePct >= 70 ? "Vos tâches sont majoritairement traitées avant l'échéance." : "Une part importante des tâches est traitée en retard."}
        />
        <IndexBar
          label="Momentum"
          value={momentumIndex}
          explain={momentumIndex >= 50 ? "Votre activité progresse par rapport à la période précédente." : "Votre activité ralentit par rapport à la période précédente."}
        />
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "5px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 600 }}>Couverture pipeline</span>
            <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: coverageRatio !== null ? "var(--blue)" : "var(--text-faint)" }}>
              {coverageRatio !== null ? `${coverageRatio.toFixed(1)}x` : "—"}
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
            {coverageRatio !== null
              ? "Pipeline ouvert rapporté à votre objectif de CA mensuel."
              : "Définissez un objectif de CA mensuel dans Paramètres pour activer cet indice."}
          </div>
        </div>
      </div>

      {/* 7. Insights Closia — un seul espace IA */}
      <SectionLabel>Insights Closia</SectionLabel>
      <div className="dash-card" style={{ padding: "18px 20px", marginBottom: "26px", border: "0.5px solid var(--violet-border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: 700, fontSize: "13px", color: "var(--violet)" }}>
            <SparklesIcon size={13} color="var(--violet)" /> Ce que Closia remarque
          </span>
          <button className="focusable" onClick={generateInsight} disabled={loadingInsight} style={{ fontSize: "11.5px", fontWeight: 600, padding: "6px 12px", borderRadius: "7px", background: "var(--violet-dim)", color: "var(--violet)", border: "0.5px solid var(--violet-border)", opacity: loadingInsight ? 0.6 : 1 }}>
            {loadingInsight ? "Analyse…" : insight ? "Régénérer" : "Analyser ma période"}
          </button>
        </div>
        {insight ? (
          <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{insight}</div>
        ) : (
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
            {activityDelta !== null
              ? `Votre activité a ${activityDelta >= 0 ? "augmenté" : "baissé"} de ${Math.abs(activityDelta)} % sur cette période. Lancez l'analyse pour une recommandation détaillée.`
              : "Lancez l'analyse pour une lecture commentée de votre période."}
          </div>
        )}

        <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "16px", paddingTop: "14px" }}>
          <AIQuerySection prospects={prospects} activities={activities} session={session} days={days} bare />
        </div>
      </div>

      <CustomMetricsSection prospects={prospects} activities={activities} session={session} days={days} />
    </>
  );
}

// Résumé exécutif : quatre chiffres, pas davantage.
function ExecKpi({ value, label, sub, accent, onDrill }) {
  return (
    <div
      className={`dash-card${onDrill ? " hoverable" : ""}`}
      role={onDrill ? "button" : undefined}
      tabIndex={onDrill ? 0 : undefined}
      onClick={onDrill}
      onKeyDown={onDrill ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrill(); } } : undefined}
      title={onDrill ? "Voir le détail" : undefined}
      style={{ padding: "16px 18px", cursor: onDrill ? "pointer" : "default" }}>
      <div className="mono" style={{ fontSize: "22px", fontWeight: 700, color: accent || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>{label}</div>
      {sub && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>{sub}</div>}
      {onDrill && <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--blue)", marginTop: "7px" }}>Voir le détail →</div>}
    </div>
  );
}

// Chaque alerte mène quelque part : une alerte sur laquelle on ne peut pas agir
// n'aide pas.
function AttentionRow({ dot, count, title, detail, actionLabel, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "13px 0", borderBottom: "0.5px solid var(--hairline)" }}>
      <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: dot, flexShrink: 0, marginTop: "5px" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{count} {title}</div>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>{detail}</div>
      </div>
      {onAction && (
        <button className="focusable" onClick={onAction} style={{ flexShrink: 0, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "7px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 600 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Pipeline par étape : barres proportionnelles, cliquables.
function StageBars({ rows, onSelectStage }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (rows.length === 0) return <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Aucune opportunité ouverte.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {rows.map((r) => (
        <button
          key={r.stage}
          className="focusable"
          onClick={() => onSelectStage?.(r.stage)}
          style={{ display: "grid", gridTemplateColumns: "minmax(96px, 130px) 1fr auto", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "2px 0", textAlign: "left", width: "100%" }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.stage}</span>
          <span style={{ height: "9px", background: "var(--panel2)", borderRadius: "5px", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.round((r.value / max) * 100)}%`, background: "var(--blue)", borderRadius: "5px" }} />
          </span>
          <span className="mono" style={{ fontSize: "12px", color: "var(--text)", whiteSpace: "nowrap" }}>
            {formatEuros(r.value)} <span style={{ color: "var(--text-faint)" }}>· {r.count}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Indice sur 100, avec la phrase qui explique ce que le score veut dire.
function IndexBar({ label, value, explain, suffix = "/ 100" }) {
  const pct = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: pct === null ? "var(--text-faint)" : "var(--blue)" }}>
          {pct === null ? "—" : `${pct} ${suffix}`}
        </span>
      </div>
      <div style={{ height: "7px", background: "var(--panel2)", borderRadius: "4px", overflow: "hidden" }}>
        {pct !== null && <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue)", borderRadius: "4px" }} />}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "5px" }}>{pct === null ? "Données insuffisantes." : explain}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="display" style={{ fontWeight: 700, fontSize: "12.5px", color: "var(--text-dim)", letterSpacing: "0.02em", marginBottom: "10px", marginTop: "4px" }}>{children.toUpperCase()}</div>;
}

function DeltaKpiTile({ value, label, delta, onDrill }) {
  return (
    <div {...drillProps(onDrill)} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", cursor: onDrill ? "pointer" : "default" }}>
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

function SmartKpiTile({ value, label, desc, raw, onDrill }) {
  const missing = value === null || value === undefined;
  const clickable = onDrill && !missing;
  return (
    <div {...drillProps(clickable ? onDrill : null)} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", cursor: clickable ? "pointer" : "default" }}>
      <div className="mono" style={{ fontSize: "20px", fontWeight: 700, color: missing ? "var(--text-faint)" : "var(--text)" }}>
        {missing ? "—" : raw ? value : `${value} / 100`}
      </div>
      <div style={{ fontSize: "11.5px", color: "var(--text-dim)", marginTop: "3px" }}>{label}</div>
      <div style={{ fontSize: "10.5px", color: "var(--text-faint)", marginTop: "4px" }}>{missing ? "Données insuffisantes" : desc}</div>
    </div>
  );
}

function KpiTile({ value, label, onDrill }) {
  return (
    <div {...drillProps(onDrill)} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", cursor: onDrill ? "pointer" : "default" }}>
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

// `bare` : rendu sans encadré propre, pour vivre dans la carte Insights.
function AIQuerySection({ prospects, activities, session, days, bare }) {
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
    <div style={bare ? {} : { background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
        {!bare && <SparklesIcon size={13} color="var(--violet)" />}
        <span style={{ fontWeight: 600, fontSize: bare ? "12px" : "13px", color: bare ? "var(--text-dim)" : "var(--violet)" }}>
          {bare ? "Poser une question sur vos données" : "Demander à l'IA"}
        </span>
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
