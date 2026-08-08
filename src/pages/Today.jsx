import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  CalendarIcon,
  PhoneIcon,
  MailIcon,
  VideoIcon,
  PinIcon,
  CheckIcon,
  SparklesIcon,
  AlertIcon,
  getFirstName,
  callAI,
  parseJsonLoose,
  Avatar,
  formatEuros,
  formatShortDate,
  isOverdue,
  computeDealScore,
  appendSignature,
} from "../lib/ui.jsx";

const TASK_TYPE_META = {
  appel_telephone: { label: "Appel", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  appel_visio: { label: "Visio", color: "#7c3aed", dim: "#f1e9fe", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", color: "#0ea968", dim: "#e2f7ec", Icon: PinIcon },
  relance_email: { label: "Email", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
};
const EVENT_META = { label: "RDV agenda", color: "#0ea5e9", dim: "#e0f2fe", Icon: CalendarIcon };

function todayLabel() {
  const d = new Date();
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatEventTime(iso) {
  if (!iso || iso.length <= 10) return "Toute la journée";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const FALLBACK_TIP = "Commencez par vos relances en attente, puis enchaînez avec vos appels planifiés pour maximiser vos conversions.";

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function Today({ prospects, setActiveTab, session, reload, onOpenProspect, settings }) {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [tip, setTip] = useState("");
  const [tipLoading, setTipLoading] = useState(true);
  const [taches, setTaches] = useState([]);
  const [tachesLoading, setTachesLoading] = useState(true);
  const [showBrief, setShowBrief] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [doneToday, setDoneToday] = useState(0);
  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const firstName = getFirstName(session.user);
  const organizeRef = useRef(null);

  function openOrganize() {
    setShowOrganize(true);
  }

  useEffect(() => {
    if (showOrganize) organizeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showOrganize]);

  async function updateStatus(id, status) {
    await supabase.from("prospects").update({ status }).eq("id", id);
    reload?.();
  }

  async function toggleTaskDone(task) {
    setTaches((prev) => prev.filter((t) => t.id !== task.id));
    setDoneToday((n) => n + 1);
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
  }

  async function reportTask(task, newDue) {
    setTaches((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_at: newDue.toISOString() } : t)));
    await supabase.from("tasks").update({ due_at: newDue.toISOString() }).eq("id", task.id);
  }

  async function reportAllOverdue() {
    const t = new Date();
    t.setHours(9, 0, 0, 0);
    for (const task of overdueTasks) {
      await reportTask(task, t);
    }
  }

  useEffect(() => {
    if (eventsLoading || tachesLoading) return;
    const key = `closia_brief_${session.user.id}_${new Date().toDateString()}`;
    if (!localStorage.getItem(key)) {
      setShowBrief(true);
      localStorage.setItem(key, "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoading, tachesLoading]);

  useEffect(() => {
    async function loadEvents() {
      setEventsLoading(true);
      try {
        const res = await fetch("/api/calendar/today", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        setEvents(data.events || []);
      } catch (e) {
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    }
    loadEvents();
  }, [session.access_token]);

  useEffect(() => {
    async function loadTaches() {
      setTachesLoading(true);
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("done", false)
        .not("due_at", "is", null)
        .order("due_at", { ascending: true });
      setTaches(data || []);
      setTachesLoading(false);
    }
    loadTaches();
  }, []);

  useEffect(() => {
    if (eventsLoading) return;
    async function generateTip() {
      setTipLoading(true);
      try {
        const urgents = prospects.filter((p) => p.status === "appeler" || p.status === "retard").slice(0, 5);
        const relances = prospects.filter((p) => p.status === "relancer").slice(0, 5);
        const prompt = `Tu es l'assistant commercial de Closia. En une seule phrase (25 mots maximum), en français, dis au commercial sur quoi se concentrer en priorité aujourd'hui : un appel important, une relance email, ou la préparation d'une visio. Base-toi sur ces données réelles, sois concret et cite un nom si utile.

Prospects à appeler ou en retard : ${urgents.map((p) => `${p.name} (${p.company}, ${p.status})`).join(", ") || "aucun"}
Prospects à relancer par email : ${relances.map((p) => `${p.name} (${p.company})`).join(", ") || "aucun"}
Rendez-vous à l'agenda aujourd'hui : ${events.map((e) => `${e.title} à ${formatEventTime(e.start)}`).join(", ") || "aucun"}

Réponds uniquement avec la phrase de conseil, sans guillemets ni préambule.`;
        const text = await callAI(prompt, session.access_token);
        setTip(text.trim());
      } catch (e) {
        setTip(FALLBACK_TIP);
      } finally {
        setTipLoading(false);
      }
    }
    generateTip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoading]);

  const overdueTasks = taches.filter((t) => new Date(t.due_at) < startOfToday());
  const todayTasks = taches.filter((t) => new Date(t.due_at) >= startOfToday() && new Date(t.due_at) <= endOfToday());
  const todayEvents = events.filter((e) => e.start && e.start.length > 10);

  const todayItems = [
    ...todayTasks.map((t) => ({ kind: "task", time: new Date(t.due_at), data: t })),
    ...todayEvents.map((e) => ({ kind: "event", time: new Date(e.start), data: e })),
  ].sort((a, b) => a.time - b.time);

  const nbRdv = todayEvents.length + todayTasks.filter((t) => t.type === "rdv_physique" || t.type === "appel_visio").length;
  const nbRelances = todayTasks.filter((t) => t.type === "relance_email").length;
  const nbAppels = todayTasks.filter((t) => t.type === "appel_telephone" || t.type === "appel_visio").length;
  const totalActions = todayTasks.length + todayEvents.length;
  const totalWithDone = totalActions + doneToday;

  const now = new Date();
  const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
  const watchAtRisk = open
    .filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 5)
    .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
  const watchHot = open.filter((p) => {
    const recentlyContacted = p.last_contact_at && (now - new Date(p.last_contact_at)) / 86400000 <= 3;
    return recentlyContacted && computeDealScore(p) >= 70;
  });
  const watchList = [
    ...watchHot.slice(0, 1).map((p) => ({ p, emoji: "🔥", label: "Contact récent, forte dynamique.", cta: "Relancer aujourd'hui", action: () => onOpenProspect?.(p.id, "email") })),
    ...watchAtRisk.slice(0, 2).map((p) => ({ p, emoji: "⚠", label: `Aucune activité depuis ${daysSince(p.last_contact_at) ?? "longtemps"} jours.`, cta: "Planifier un suivi", action: () => onOpenProspect?.(p.id) })),
  ].slice(0, 3);

  const attentionCount = watchAtRisk.length;
  const attentionValue = watchAtRisk.reduce((sum, p) => sum + (p.deal_value || 0), 0);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #4d5eea, #16209e)", color: "#fff", padding: "32px 32px 28px", position: "relative", overflow: "hidden" }}>
        <svg viewBox="0 0 500 200" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, width: "60%", height: "100%", opacity: 0.5 }}>
          <path d="M -20 210 C 100 210 140 130 220 110 C 300 90 320 30 460 -20" stroke="url(#todayMomentum)" strokeWidth="2" fill="none" strokeDasharray="1 9" strokeLinecap="round" />
          <circle cx="140" cy="150" r="3" fill="rgba(255,255,255,0.4)" />
          <circle cx="280" cy="80" r="4" fill="rgba(255,255,255,0.65)" />
          <circle cx="420" cy="10" r="6" fill="var(--gold, #b8862e)" />
          <defs>
            <linearGradient id="todayMomentum" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="1" stopColor="var(--gold, #b8862e)" />
            </linearGradient>
          </defs>
        </svg>

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "28px", display: "flex", alignItems: "center", gap: "10px" }}>
              Bonjour{firstName ? ` ${firstName}` : ""} <span>👋</span>
            </div>
            <div style={{ opacity: 0.9, fontSize: "13.5px", marginTop: "4px" }}>Voici ce qui mérite votre attention aujourd'hui.</div>
            <div style={{ opacity: 0.7, fontSize: "12.5px", marginTop: "2px" }}>{todayLabel()}</div>
          </div>
          <button className="focusable" onClick={openOrganize} style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: "10px", padding: "10px 16px", color: "#fff", fontSize: "13px", fontWeight: 600 }}>
            <SparklesIcon size={14} color="#fff" /> Organiser ma journée
          </button>
        </div>

        <div style={{ position: "relative", display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "22px" }}>
          <SummaryStat value={totalWithDone} label="actions" />
          <SummaryStat value={nbRdv} label="rendez-vous" />
          <SummaryStat value={nbRelances} label="relances" />
          <SummaryStat value={nbAppels} label="appels" />
          {overdueTasks.length > 0 && <SummaryStat value={overdueTasks.length} label="en retard" warn />}
        </div>

        {totalWithDone > 0 && (
          <div style={{ position: "relative", marginTop: "16px" }}>
            <div style={{ fontSize: "11.5px", opacity: 0.85, marginBottom: "5px" }}>
              {doneToday === totalWithDone ? "✓ Journée commerciale terminée" : `${doneToday} / ${totalWithDone} actions terminées`}
            </div>
            <div style={{ height: "5px", width: "220px", background: "rgba(255,255,255,0.2)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${(doneToday / totalWithDone) * 100}%`, height: "100%", background: "var(--gold, #b8862e)", borderRadius: "3px" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "24px 32px 48px" }}>
        {showOrganize && (
          <OrganizeDayPanel
            tasks={[...overdueTasks, ...todayTasks]}
            prospectById={prospectById}
            session={session}
            onClose={() => setShowOrganize(false)}
          />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: "20px", alignItems: "start", marginBottom: "24px" }}>
          <div>
            {overdueTasks.length > 0 && (
              <div style={{ marginBottom: "22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <AlertIcon size={13} color="var(--red)" />
                  <span className="display" style={{ fontWeight: 700, fontSize: "13px", color: "var(--red)" }}>EN RETARD ({overdueTasks.length})</span>
                  <button className="focusable" onClick={reportAllOverdue} style={{ marginLeft: "auto", fontSize: "11.5px", fontWeight: 600, color: "var(--red)", background: "none", border: "none", padding: 0 }}>
                    Reporter toutes au prochain créneau (09h)
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {overdueTasks.map((t) => (
                    <ActionTaskCard key={t.id} task={t} prospect={prospectById[t.prospect_id]} overdue onDone={toggleTaskDone} onReport={reportTask} onOpenProspect={onOpenProspect} />
                  ))}
                </div>
              </div>
            )}

            <div className="display" style={{ fontWeight: 700, fontSize: "13px", marginBottom: "10px" }}>À FAIRE MAINTENANT</div>
            {todayItems.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: "13px" }}>Rien de prévu pour l'instant aujourd'hui.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {todayItems.map((item) =>
                  item.kind === "task" ? (
                    <ActionTaskCard key={`t-${item.data.id}`} task={item.data} prospect={prospectById[item.data.prospect_id]} onDone={toggleTaskDone} onReport={reportTask} onOpenProspect={onOpenProspect} />
                  ) : (
                    <ActionEventCard key={`e-${item.data.id}`} event={item.data} />
                  )
                )}
              </div>
            )}
          </div>

          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "13px", marginBottom: "10px" }}>À SURVEILLER</div>
            {watchList.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: "12.5px" }}>Rien à signaler.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {watchList.map(({ p, emoji, label, cta, action }) => (
                  <button key={p.id} className="focusable" onClick={action} style={{ display: "block", width: "100%", textAlign: "left", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, marginBottom: "2px" }}>{emoji} {p.company}</div>
                    <div className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--gold-deep)", marginBottom: "4px" }}>{formatEuros(p.deal_value || 0)}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "6px" }}>{label}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--blue)", fontWeight: 600 }}>→ {cta}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px 18px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span className="display" style={{ fontWeight: 600, fontSize: "13.5px" }}>Votre journée</span>
            <button className="focusable" onClick={() => setActiveTab("planning")} style={{ fontSize: "12px", color: "var(--blue)", background: "none", border: "none", padding: 0, fontWeight: 600 }}>
              Voir l'agenda →
            </button>
          </div>
          {todayItems.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>Rien de planifié.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {todayItems.slice(0, 6).map((item, i) => {
                const meta = item.kind === "task" ? (TASK_TYPE_META[item.data.type] || TASK_TYPE_META.appel_telephone) : EVENT_META;
                const label = item.kind === "task" ? item.data.note : item.data.title;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                    <span className="mono" style={{ color: "var(--text-faint)", width: "42px", flexShrink: 0 }}>{formatEventTime(item.time.toISOString())}</span>
                    <meta.Icon size={11} color={meta.color} />
                    <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {attentionCount > 0 && (
          <div style={{ background: "var(--blue-dim)", border: "0.5px solid #2a3ed655", borderRadius: "12px", padding: "16px 18px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <SparklesIcon size={14} color="var(--blue)" />
              <span className="display" style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--blue)" }}>Closia a une recommandation</span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.6, marginBottom: "12px" }}>
              Vous avez {totalWithDone} action{totalWithDone > 1 ? "s" : ""} prévue{totalWithDone > 1 ? "s" : ""} aujourd'hui, mais {attentionCount} deal{attentionCount > 1 ? "s" : ""} représentant {formatEuros(attentionValue)} de pipeline n'{attentionCount > 1 ? "ont" : "a"} pas reçu de suivi depuis plus de 5 jours.
              {watchAtRisk.length > 0 && ` Je vous recommande de traiter ${watchAtRisk.slice(0, 2).map((p) => p.company).join(" et ")} en priorité.`}
            </div>
            <button className="focusable" onClick={openOrganize} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600 }}>
              Organiser ma journée
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <span className="display" style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--text-dim)" }}>Votre activité</span>
            <div style={{ fontSize: "12px", color: "var(--text-faint)", marginTop: "2px" }}>
              {doneToday} action{doneToday > 1 ? "s" : ""} terminée{doneToday > 1 ? "s" : ""} · {nbAppels} appel{nbAppels > 1 ? "s" : ""} · {nbRelances} email{nbRelances > 1 ? "s" : ""} · {nbRdv} RDV
            </div>
          </div>
          <button className="focusable" onClick={() => setActiveTab("activities")} style={{ fontSize: "12px", color: "var(--blue)", background: "none", border: "none", padding: 0, fontWeight: 600 }}>
            Voir l'activité →
          </button>
        </div>
      </div>

      {showBrief && (
        <DailyBriefModal
          firstName={firstName}
          events={todayEvents}
          taches={todayTasks}
          prospectById={prospectById}
          tip={tipLoading ? FALLBACK_TIP : tip || FALLBACK_TIP}
          onOpenProspect={(id) => { setShowBrief(false); onOpenProspect?.(id); }}
          onToggleTaskDone={toggleTaskDone}
          onGoToPlanning={() => { setShowBrief(false); setActiveTab("planning"); }}
          onClose={() => setShowBrief(false)}
        />
      )}
    </div>
  );
}

function SummaryStat({ value, label, warn }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
      <span className="mono" style={{ fontSize: "16px", fontWeight: 700, color: warn ? "#fca5a5" : "#fff" }}>{warn ? "⚠ " : ""}{value}</span>
      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>{label}</span>
    </div>
  );
}

const REPORT_OPTIONS = [
  { label: "Aujourd'hui 17h", compute: () => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; } },
  { label: "Demain 09h", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
];

function ActionTaskCard({ task, prospect, overdue, onDone, onReport, onOpenProspect }) {
  const [showReport, setShowReport] = useState(false);
  const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
  const days = prospect?.last_contact_at ? daysSince(prospect.last_contact_at) : null;

  return (
    <div style={{ background: "var(--panel)", border: `0.5px solid ${overdue ? "var(--red)55" : "var(--hairline)"}`, borderLeft: `3px solid ${overdue ? "var(--red)" : meta.color}`, borderRadius: "10px", padding: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: overdue ? "var(--red)" : "var(--text-faint)", width: "44px", flexShrink: 0, marginTop: "1px" }}>
          {overdue ? formatShortDate(task.due_at) : formatEventTime(task.due_at)}
        </span>
        <meta.Icon size={13} color={meta.color} style={{ marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: prospect ? "pointer" : "default" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{task.note}</div>
          </button>
          {prospect && (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>
              {prospect.name} · {prospect.company}{prospect.deal_value > 0 ? ` · ${formatEuros(prospect.deal_value)}` : ""}
            </div>
          )}
          {days !== null && days >= 3 && <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "2px" }}>Dernier échange il y a {days} jours.</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", marginTop: "10px", paddingLeft: "66px", flexWrap: "wrap", position: "relative" }}>
        {task.type === "relance_email" ? (
          <button className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id, "email")} style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px" }}>
            Générer avec l'IA
          </button>
        ) : task.type === "rdv_physique" ? (
          <button className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id, "script")} style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px" }}>
            Préparer avec l'IA
          </button>
        ) : prospect?.phone ? (
          <a href={`tel:${prospect.phone}`} className="focusable" style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px", textDecoration: "none" }}>
            Appeler
          </a>
        ) : null}
        <button className="focusable" onClick={() => onDone(task)} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, background: "#e2f7ec", color: "#0ea968", border: "none", borderRadius: "6px", padding: "6px 10px" }}>
          <CheckIcon size={11} color="#0ea968" /> Terminer
        </button>
        {overdue && (
          <div style={{ position: "relative" }}>
            <button className="focusable" onClick={() => setShowReport((s) => !s)} style={{ fontSize: "11.5px", fontWeight: 600, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px" }}>
              Reporter
            </button>
            {showReport && (
              <div style={{ position: "absolute", top: "34px", left: 0, zIndex: 5, background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "8px", boxShadow: "var(--shadow-md)", padding: "6px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "140px" }}>
                {REPORT_OPTIONS.map((opt) => (
                  <button key={opt.label} className="focusable" onClick={() => { onReport(task, opt.compute()); setShowReport(false); }} style={{ textAlign: "left", fontSize: "12px", background: "none", border: "none", padding: "6px 8px", borderRadius: "5px" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionEventCard({ event }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderLeft: "3px solid var(--blue)", borderRadius: "10px", padding: "14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", width: "44px", flexShrink: 0, marginTop: "1px" }}>{formatEventTime(event.start)}</span>
      <CalendarIcon size={13} color="var(--blue)" style={{ marginTop: "2px", flexShrink: 0 }} />
      <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{event.title}</div>
    </div>
  );
}

function OrganizeDayPanel({ tasks, prospectById, session, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function organize() {
    setLoading(true);
    setError("");
    try {
      const list = tasks.map((t) => {
        const p = prospectById[t.prospect_id];
        return `- ${t.note} · ${TASK_TYPE_META[t.type]?.label || t.type} · ${t.due_at ? formatShortDate(t.due_at) : "sans heure"}${p ? ` · ${p.name} (${p.company}) · ${formatEuros(p.deal_value || 0)}` : ""}`;
      }).join("\n");
      const prompt = `Tu es un coach commercial. Voici les actions en retard et prévues aujourd'hui pour ce commercial. Réponds UNIQUEMENT en JSON valide, format :
{"summary": "1-2 phrases expliquant la priorité du jour", "order": ["intitulé de l'action 1 dans l'ordre recommandé", "..."]}

"order" reprend les intitulés d'action (le champ avant le premier "·") dans l'ordre recommandé, du plus urgent au moins urgent. N'invente pas d'action qui n'est pas dans la liste.

Actions :
${list || "Aucune."}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'organisation a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "var(--blue-dim)", border: "0.5px solid #2a3ed655", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span className="display" style={{ fontWeight: 700, fontSize: "13px", color: "var(--blue)" }}>✨ Closia organise votre journée</span>
        <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "13px" }}>✕</button>
      </div>
      {!result && (
        <button className="focusable" onClick={organize} disabled={loading || tasks.length === 0} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, opacity: loading || tasks.length === 0 ? 0.6 : 1 }}>
          {loading ? "Analyse..." : tasks.length === 0 ? "Rien à organiser" : "Organiser ma journée"}
        </button>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "8px" }}>{error}</div>}
      {result && (
        <>
          <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5, marginBottom: "12px" }}>{result.summary}</div>
          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "12.5px", color: "var(--text)", lineHeight: 1.9 }}>
            {(result.order || []).map((label, i) => <li key={i}>{label}</li>)}
          </ol>
        </>
      )}
    </div>
  );
}

function buildDayAgenda(events, taches) {
  const timed = [];
  const untimed = [];
  events.forEach((e) => {
    const item = { kind: "event", data: e };
    if (!e.start || e.start.length <= 10) untimed.push(item);
    else timed.push({ ...item, sortKey: new Date(e.start).getTime() });
  });
  taches.forEach((t) => {
    const item = { kind: "task", data: t };
    if (!t.due_at) untimed.push(item);
    else timed.push({ ...item, sortKey: new Date(t.due_at).getTime() });
  });
  timed.sort((a, b) => a.sortKey - b.sortKey);
  return [...timed, ...untimed];
}

function DailyBriefModal({ firstName, events, taches, prospectById, tip, onOpenProspect, onToggleTaskDone, onGoToPlanning, onClose }) {
  const agenda = buildDayAgenda(events, taches);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }}>
      <div style={{ background: "var(--bg)", borderRadius: "16px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "4px" }}>Bonjour{firstName ? ` ${firstName}` : ""} 👋</div>
        <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "16px" }}>Organisons ta journée — voici tout ce qui t'attend, dans l'ordre.</div>

        <div style={{ background: "var(--blue-dim)", borderRadius: "10px", padding: "11px 12px", fontSize: "12px", color: "var(--blue)", marginBottom: "18px", display: "flex", gap: "8px", alignItems: "flex-start", flexShrink: 0 }}>
          <SparklesIcon size={13} color="var(--blue)" style={{ marginTop: "2px", flexShrink: 0 }} />
          <span>{tip}</span>
        </div>

        <div style={{ overflowY: "auto", marginBottom: "18px", paddingRight: "2px" }}>
          {agenda.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: "12.5px", padding: "12px 0" }}>Rien de planifié pour l'instant — profites-en pour avancer sur tes priorités.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {agenda.map((item, i) => (
                <BriefAgendaRow
                  key={`${item.kind}-${item.data.id}-${i}`}
                  item={item}
                  prospect={item.kind === "task" ? prospectById[item.data.prospect_id] : null}
                  onOpen={onOpenProspect}
                  onToggleDone={onToggleTaskDone}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button className="focusable" onClick={onGoToPlanning} style={{ flex: 1, background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2a3ed655", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600 }}>
            Voir mon agenda complet
          </button>
          <button className="focusable" onClick={onClose} style={{ flex: 1, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px", fontSize: "13px" }}>
            C'est parti
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefAgendaRow({ item, prospect, onOpen, onToggleDone }) {
  const isTask = item.kind === "task";
  const meta = isTask ? (TASK_TYPE_META[item.data.type] || TASK_TYPE_META.appel_telephone) : EVENT_META;
  const time = isTask
    ? (item.data.due_at ? formatEventTime(item.data.due_at) : "Sans horaire")
    : formatEventTime(item.data.start);
  const overdue = isTask && item.data.due_at && isOverdue(item.data.due_at);
  const label = isTask ? item.data.note : item.data.title;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--panel)", border: `0.5px solid ${overdue ? "var(--red)55" : "var(--hairline)"}`, borderLeft: `3px solid ${meta.color}`, borderRadius: "9px", padding: "9px 11px" }}>
      <span className="mono" style={{ fontSize: "11px", color: overdue ? "var(--red)" : "var(--text-faint)", fontWeight: overdue ? 700 : 500, width: "44px", flexShrink: 0 }}>
        {time === "Sans horaire" ? "—" : time}
      </span>

      {isTask && (
        <button className="focusable" onClick={() => onToggleDone?.(item.data)} style={{ background: "none", border: "none", padding: 0, display: "flex", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--panel2)", border: "1.5px solid var(--hairline-strong)" }} />
        </button>
      )}

      <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: meta.dim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <meta.Icon size={11} color={meta.color} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {prospect ? (
          <button className="focusable" onClick={() => onOpen?.(prospect.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block", textAlign: "left", fontSize: "12.5px", color: "var(--blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prospect.name} — <span style={{ color: "var(--text)" }}>{label}</span>
          </button>
        ) : (
          <div style={{ fontSize: "12.5px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        )}
      </div>

      <span className="mono" style={{ fontSize: "9px", fontWeight: 700, color: meta.color, background: meta.dim, borderRadius: "5px", padding: "3px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>
        {meta.label}
      </span>
    </div>
  );
}
