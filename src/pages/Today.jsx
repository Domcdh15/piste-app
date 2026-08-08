import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  CalendarIcon,
  PhoneIcon,
  MailIcon,
  VideoIcon,
  PinIcon,
  TargetIcon,
  CheckIcon,
  SparklesIcon,
  AlertIcon,
  BriefcaseIcon,
  getFirstName,
  callAI,
  parseJsonLoose,
  STATUS_META,
  CLOSED_STAGES,
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

function computeAlerts(prospects, taches) {
  const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
  const now = new Date();
  const taskProspectIds = new Set(taches.map((t) => t.prospect_id));
  const alerts = [];

  open
    .filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 > 7)
    .slice(0, 3)
    .forEach((p) => {
      const message = p.last_contact_at
        ? `Aucune réponse depuis ${Math.floor((now - new Date(p.last_contact_at)) / 86400000)} jours.`
        : "Aucun contact depuis la création de ce prospect.";
      alerts.push({ level: "urgent", prospect: p, message });
    });

  open
    .filter((p) => p.deal_value > 0 && !p.next_contact_at && !taskProspectIds.has(p.id))
    .sort((a, b) => b.deal_value - a.deal_value)
    .slice(0, 3)
    .forEach((p) => {
      alerts.push({ level: "risk", prospect: p, message: `Cette opportunité de ${formatEuros(p.deal_value)} n'a aucune prochaine action prévue.` });
    });

  open
    .filter((p) => {
      const recentlyContacted = p.last_contact_at && (now - new Date(p.last_contact_at)) / 86400000 <= 3;
      return recentlyContacted && computeDealScore(p) >= 70;
    })
    .slice(0, 3)
    .forEach((p) => {
      alerts.push({ level: "hot", prospect: p, message: `Bonne dynamique : contact récent et avancement à ${computeDealScore(p)}%.` });
    });

  return alerts;
}

function computeForgottenDeals(prospects) {
  const now = new Date();
  const open = prospects.filter((p) => !CLOSED_STAGES.includes(p.stage));
  return open
    .map((p) => {
      const days = p.last_contact_at ? Math.floor((now - new Date(p.last_contact_at)) / 86400000) : 999;
      return { prospect: p, days };
    })
    .filter((x) => x.days >= 5)
    .sort((a, b) => (b.prospect.deal_value || 0) - (a.prospect.deal_value || 0) || b.days - a.days)
    .slice(0, 3);
}

export default function Today({ prospects, setActiveTab, session, reload, onOpenProspect, settings }) {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [tip, setTip] = useState("");
  const [tipLoading, setTipLoading] = useState(true);
  const [taches, setTaches] = useState([]);
  const [tachesLoading, setTachesLoading] = useState(true);
  const [priorities, setPriorities] = useState([]);
  const [prioritiesLoading, setPrioritiesLoading] = useState(true);
  const nbTaches = taches.length;
  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));

  const appelsList = prospects.filter((p) => p.status === "appeler");
  const relancesList = prospects.filter((p) => p.status === "relancer");
  const opportunitesList = prospects.filter((p) => p.priority >= 75);
  const alerts = computeAlerts(prospects, taches);
  const forgottenDeals = computeForgottenDeals(prospects);
  const nbAppels = appelsList.length;
  const nbRelances = relancesList.length;
  const nbRetard = prospects.filter((p) => p.status === "retard").length;
  const nbOpportunites = opportunitesList.length;
  const firstName = getFirstName(session.user);
  const [showBrief, setShowBrief] = useState(false);
  const [openTile, setOpenTile] = useState(null);

  async function updateStatus(id, status) {
    await supabase.from("prospects").update({ status }).eq("id", id);
    reload?.();
  }

  async function toggleTaskDone(task) {
    setTaches((prev) => prev.filter((t) => t.id !== task.id));
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
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
        .order("due_at", { ascending: true, nullsFirst: false });
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

  useEffect(() => {
    async function loadPriorities() {
      setPrioritiesLoading(true);
      const open = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");
      function rank(p) {
        let r = (p.priority || 0) / 5;
        if (p.status === "retard") r += 50;
        if (p.next_contact_at && isOverdue(p.next_contact_at)) r += 40;
        if (p.status === "appeler") r += 20;
        return r;
      }
      const ranked = [...open].sort((a, b) => rank(b) - rank(a)).slice(0, 3);

      if (ranked.length === 0) {
        setPriorities([]);
        setPrioritiesLoading(false);
        return;
      }

      function fallbackReason(p) {
        if (p.status === "retard") return "Suivi en retard.";
        if (p.next_contact_at && isOverdue(p.next_contact_at)) return "Relance prévue dépassée.";
        if (p.status === "appeler") return "Appel à faire.";
        return "Deal à forte priorité.";
      }

      try {
        const prompt = `Pour chacun de ces prospects, donne en français une raison courte (moins de 12 mots) d'en faire une priorité aujourd'hui, et un score d'urgence de 0 à 100. Réponds UNIQUEMENT avec un tableau JSON de ${ranked.length} objets, dans le même ordre que la liste, format : [{"reason": "...", "score": 85}]

${ranked.map((p, i) => `${i + 1}. ${p.name} (${p.company}) — étape: ${p.stage}, statut: ${p.status}, dernier contact: ${p.last_contact_at || "jamais"}, prochain contact prévu: ${p.next_contact_at || "aucun"}`).join("\n")}`;
        const raw = await callAI(prompt, session.access_token);
        const parsed = parseJsonLoose(raw);
        if (!Array.isArray(parsed)) throw new Error("parse_failed");
        setPriorities(ranked.map((p, i) => ({ prospect: p, reason: parsed[i]?.reason || fallbackReason(p), score: parsed[i]?.score ?? 50 })));
      } catch (e) {
        setPriorities(ranked.map((p) => ({ prospect: p, reason: fallbackReason(p), score: 50 })));
      } finally {
        setPrioritiesLoading(false);
      }
    }
    loadPriorities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects]);

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, #4d5eea, #16209e)",
          color: "#fff",
          padding: "32px 32px 30px",
          position: "relative",
          overflow: "hidden",
        }}
      >
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

        <div style={{ position: "relative" }}>
          <div className="display" style={{ fontWeight: 700, fontSize: "32px", display: "flex", alignItems: "center", gap: "10px" }}>
            Bonjour{firstName ? ` ${firstName}` : ""} <span>👋</span>
          </div>
          <div style={{ opacity: 0.85, fontSize: "14px", marginTop: "6px", marginBottom: "20px" }}>{todayLabel()}</div>

          <div style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.28)", borderRadius: "14px", padding: "18px 20px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <SparklesIcon size={16} color="#fff" />
            </span>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, opacity: 0.8, letterSpacing: "0.05em", marginBottom: "5px" }}>CONSEIL DU JOUR</div>
              <span style={{ fontSize: "16px", fontWeight: 500, opacity: 0.98, lineHeight: 1.45 }}>{tipLoading ? "Analyse de ta journée en cours..." : tip || FALLBACK_TIP}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 32px 48px" }}>
        <ForgottenDealsBox deals={forgottenDeals} session={session} settings={settings} reload={reload} onOpen={onOpenProspect} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "14px", alignItems: "start" }}>
          <StatTile
            accent="var(--blue)"
            icon={<CalendarIcon size={15} color="var(--blue)" />}
            label="RDV Aujourd'hui"
            value={eventsLoading ? "…" : events.length}
            items={events}
            expanded={openTile === "rdv"}
            onToggle={(v) => setOpenTile(v ? "rdv" : null)}
            renderItem={(e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--text)" }}>{e.title}</span>
                <span className="mono" style={{ color: "var(--text-faint)" }}>{formatEventTime(e.start)}</span>
              </div>
            )}
          />
          <StatTile
            accent="#7c3aed"
            icon={<PhoneIcon size={15} color="#7c3aed" />}
            label="Appels à faire"
            value={nbAppels}
            items={appelsList}
            expanded={openTile === "appels"}
            onToggle={(v) => setOpenTile(v ? "appels" : null)}
            renderItem={(p) => <MissionRow key={p.id} prospect={p} onUpdateStatus={updateStatus} onOpen={onOpenProspect} />}
          />
          <StatTile
            accent="var(--amber)"
            icon={<MailIcon size={15} color="var(--amber)" />}
            label="Emails en attente"
            value={nbRelances}
            items={relancesList}
            expanded={openTile === "relances"}
            onToggle={(v) => setOpenTile(v ? "relances" : null)}
            renderItem={(p) => <MissionRow key={p.id} prospect={p} onUpdateStatus={updateStatus} onOpen={onOpenProspect} />}
          />
          <StatTile
            accent="#0ea968"
            icon={<TargetIcon size={15} color="#0ea968" />}
            label="Opportunités prioritaires"
            value={nbOpportunites}
            items={opportunitesList}
            expanded={openTile === "opportunites"}
            onToggle={(v) => setOpenTile(v ? "opportunites" : null)}
            renderItem={(p) => <MissionRow key={p.id} prospect={p} onUpdateStatus={updateStatus} onOpen={onOpenProspect} />}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginBottom: "22px" }}>
          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: "2.5px solid var(--blue)", borderRadius: "10px", padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: events.length > 0 ? "10px" : 0 }}>
              <CalendarIcon size={15} color="var(--blue)" />
              <span className="display" style={{ fontWeight: 600, fontSize: "14px" }}>Agenda du jour</span>
              <span className="mono" style={{ marginLeft: "auto", background: "var(--panel2)", color: "var(--blue)", borderRadius: "999px", fontSize: "12px", fontWeight: 700, padding: "2px 9px" }}>
                {eventsLoading ? "…" : events.length}
              </span>
            </div>
            {!eventsLoading && events.length === 0 && (
              <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>
                Aucun événement — <button className="focusable" onClick={() => setActiveTab("settings")} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontSize: "12px", cursor: "pointer" }}>connecte ton agenda</button>
              </div>
            )}
            {events.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {events.slice(0, 4).map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="mono" style={{ color: "var(--text-faint)" }}>{formatEventTime(e.start)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <StatTile
            accent="#7c3aed"
            icon={<CheckIcon size={15} color="#7c3aed" />}
            label="Mes tâches"
            value={tachesLoading ? "…" : nbTaches}
            items={taches}
            renderItem={(t) => <TaskRow key={t.id} task={t} prospect={prospectById[t.prospect_id]} onOpen={onOpenProspect} />}
          />
        </div>

        <button
          className="focusable"
          onClick={() => setActiveTab("pipeline")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "transparent",
            border: "none",
            padding: "10px 2px",
            marginBottom: "8px",
            textAlign: "left",
          }}
        >
          <BriefcaseIcon size={16} color="var(--text-dim)" />
          <span className="display" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>Sales Pipeline</span>
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>Vue d'ensemble de vos prospects</span>
        </button>

        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "8px" }}>
          {prospects.length === 0 ? (
            <div style={{ color: "var(--text-dim)", padding: "16px", fontSize: "13px" }}>Aucun prospect pour l'instant.</div>
          ) : (
            prospects
              .filter((p) => !CLOSED_STAGES.includes(p.stage))
              .slice(0, 5)
              .map((p) => {
                const meta = STATUS_META[p.status] || STATUS_META.attente;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveTab("pipeline")}
                    className="focusable"
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 10px", width: "100%", textAlign: "left", background: "transparent", border: "0.5px solid transparent", borderRadius: "8px" }}
                  >
                    <Avatar name={p.name} stage={p.stage} size={28} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="display" style={{ fontWeight: 500, fontSize: "13px" }}>{p.name}</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>{p.company} · {p.stage}</div>
                    </div>
                    <div className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: meta.color, background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "6px", padding: "3px 7px" }}>
                      <meta.Icon size={10} color={meta.color} />
                      {meta.label}
                    </div>
                    <div className="mono" style={{ fontSize: "12px", color: "var(--blue)", width: "80px", textAlign: "right" }}>{formatEuros(p.deal_value)}</div>
                  </button>
                );
              })
          )}
        </div>

        <div style={{ marginTop: "28px" }}>
          <AlertsBox alerts={alerts} onOpen={onOpenProspect} />
          <PriorityCard priorities={priorities} loading={prioritiesLoading} onOpen={onOpenProspect} />
        </div>
      </div>

      {showBrief && (
        <DailyBriefModal
          firstName={firstName}
          events={events}
          taches={taches}
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

function buildDayAgenda(events, taches) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayTasks = taches.filter((t) => !t.due_at || new Date(t.due_at) <= endOfToday);
  const timed = [];
  const untimed = [];
  events.forEach((e) => {
    const item = { kind: "event", data: e };
    if (!e.start || e.start.length <= 10) untimed.push(item);
    else timed.push({ ...item, sortKey: new Date(e.start).getTime() });
  });
  todayTasks.forEach((t) => {
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

function ForgottenDealsBox({ deals, session, settings, reload, onOpen }) {
  if (deals.length === 0) return null;
  return (
    <div style={{ background: "var(--red-dim)", border: "0.5px solid var(--red)55", borderRadius: "12px", padding: "18px", marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <AlertIcon size={15} color="var(--red)" />
        <div className="display" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>Deals oubliés</div>
        <span className="mono" style={{ background: "var(--red)", color: "#fff", borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "2px 8px" }}>
          {deals.length}
        </span>
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "14px" }}>Ces opportunités n'ont eu aucune activité depuis au moins 5 jours — relancez-les avant qu'elles ne refroidissent.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {deals.map(({ prospect, days }) => (
          <ForgottenDealCard key={prospect.id} prospect={prospect} days={days} session={session} settings={settings} reload={reload} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function ForgottenDealCard({ prospect, days, session, settings, reload, onOpen }) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function relancerMaintenant() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige un email de relance très court (4 à 5 phrases maximum), professionnel mais chaleureux, en français, pour un prospect resté sans réponse depuis ${days} jours. Ne mets pas d'objet, uniquement le corps de l'email, termine par une formule de politesse simple (ex : "Bonne journée,"), sans nom ni signature.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Valeur de l'opportunité : ${formatEuros(prospect.deal_value || 0)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(appendSignature(text, settings));
    } catch (e) {
      setError(e.message || "La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function markAsSent() {
    await supabase.from("emails_generes").insert({ user_id: session.user.id, prospect_id: prospect.id, type: "relance", content });
    await supabase.from("prospects").update({ last_contact_at: new Date().toISOString() }).eq("id", prospect.id);
    setSent(true);
    reload?.();
  }

  function copy() {
    navigator.clipboard?.writeText(content);
  }

  if (sent) {
    return (
      <div style={{ background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 14px", fontSize: "12.5px", color: "#0ea968", display: "flex", alignItems: "center", gap: "8px" }}>
        <CheckIcon size={13} color="#0ea968" /> Relance envoyée à <strong>{prospect.name}</strong>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: content ? "10px" : 0 }}>
        <button className="focusable" onClick={() => onOpen?.(prospect.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}>
          <div className="display" style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>{prospect.name} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {prospect.company}</span></div>
          <div style={{ fontSize: "11.5px", color: "var(--red)" }}>Aucune activité depuis {days} jour{days > 1 ? "s" : ""}</div>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {prospect.deal_value > 0 && (
            <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "var(--gold-deep)", background: "var(--gold-dim)", borderRadius: "999px", padding: "3px 9px" }}>
              {formatEuros(prospect.deal_value)}
            </span>
          )}
          {!content && (
            <button className="focusable" onClick={relancerMaintenant} disabled={loading} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 12px", borderRadius: "7px", background: "var(--blue)", color: "#fff", border: "none", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap" }}>
            {loading ? "Génération..." : "Relancer maintenant"}
          </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: "12px" }}>{error}</div>}

      {content && (
        <div>
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5, background: "var(--panel)", borderRadius: "8px", padding: "10px 12px", marginBottom: "8px" }}>
            {content}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="focusable" onClick={copy} style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
              Copier
            </button>
            <button className="focusable" onClick={markAsSent} style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "#e2f7ec", color: "#0ea968", border: "0.5px solid #0ea96855" }}>
              Marquer comme envoyée
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ALERT_STYLE = {
  urgent: { bg: "var(--red-dim)", border: "var(--red)55", stripe: "var(--red)", label: "URGENT" },
  risk: { bg: "var(--amber-dim)", border: "var(--amber)55", stripe: "var(--amber)", label: "OPPORTUNITÉ À RISQUE" },
  hot: { bg: "#e2f7ec", border: "#0ea96855", stripe: "#0ea968", label: "OPPORTUNITÉ CHAUDE" },
};

function AlertsBox({ alerts, onOpen }) {
  if (alerts.length === 0) return null;
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <AlertIcon size={14} color="var(--text)" />
        <div className="display" style={{ fontWeight: 700, fontSize: "15px" }}>Alertes IA</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {alerts.map((a, i) => {
          const style = ALERT_STYLE[a.level];
          return (
            <button
              key={i}
              className="focusable"
              onClick={() => onOpen?.(a.prospect.id)}
              style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: style.bg, border: `0.5px solid ${style.border}`, borderRadius: "8px", padding: "10px 12px 10px 10px", textAlign: "left" }}
            >
              <span style={{ width: "3px", alignSelf: "stretch", borderRadius: "2px", background: style.stripe, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", marginBottom: "2px" }}>{style.label}</div>
                <div style={{ fontSize: "12px", color: "var(--text)" }}>
                  <strong>{a.prospect.name}</strong> ({a.prospect.company}) — {a.message}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PriorityCard({ priorities, loading, onOpen }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <SparklesIcon size={14} color="var(--blue)" />
        <span className="display" style={{ fontWeight: 700, fontSize: "15px" }}>Assistant IA — priorités du jour</span>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Analyse en cours...</div>
      ) : priorities.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Rien d'urgent aujourd'hui — bravo.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {priorities.map(({ prospect: p, reason, score }, i) => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: i < priorities.length - 1 ? "12px" : 0, borderBottom: i < priorities.length - 1 ? "0.5px solid var(--hairline)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <Avatar name={p.name} stage={p.stage} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontWeight: 600, fontSize: "13px" }}>
                      {p.name} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {p.company}</span>
                    </div>
                    <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{reason}</div>
                  </div>
                </div>
                <span className="mono" style={{ background: "var(--blue-dim)", color: "var(--blue)", borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "3px 8px", flexShrink: 0 }}>
                  {score}
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button className="focusable" onClick={() => onOpen?.(p.id, "script")} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
                  Préparer un appel
                </button>
                <button className="focusable" onClick={() => onOpen?.(p.id, "email")} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
                  Générer une relance
                </button>
                <button className="focusable" onClick={() => onOpen?.(p.id, "email")} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2a3ed655" }}>
                  Ouvrir le dossier
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ accent, icon, label, value, items, renderItem, expanded: controlledExpanded, onToggle }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : localExpanded;
  const hasItems = items && items.length > 0;

  function toggle() {
    if (!hasItems) return;
    if (isControlled) onToggle?.(!expanded);
    else setLocalExpanded((e) => !e);
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: `2.5px solid ${accent}`, borderRadius: "10px", padding: "16px 18px" }}>
      <button
        className="focusable"
        onClick={toggle}
        disabled={!hasItems}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", background: "none", border: "none", padding: 0, textAlign: "left", cursor: hasItems ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {icon}
          <span className="display" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)" }}>{label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="mono" style={{ background: "var(--panel2)", color: accent, borderRadius: "999px", fontSize: "12px", fontWeight: 700, padding: "2px 9px" }}>
            {value}
          </span>
          {hasItems && <span style={{ color: "var(--text-faint)", fontSize: "10px", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>}
        </div>
      </button>

      {expanded && hasItems && (
        <div style={{ marginTop: "10px", borderTop: "0.5px solid var(--hairline)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, prospect, onOpen }) {
  const nameStyle = { fontSize: "12px", color: prospect ? "var(--blue)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
        {(() => { const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone; return <meta.Icon size={12} color={meta.color} />; })()}
        {prospect ? (
          <button className="focusable" onClick={() => onOpen?.(prospect.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...nameStyle }}>
            {prospect.name} — <span style={{ color: "var(--text)" }}>{task.note}</span>
          </button>
        ) : (
          <span style={nameStyle}>{task.note}</span>
        )}
      </div>
      <span className="mono" style={{ fontSize: "11px", color: task.due_at && isOverdue(task.due_at) ? "var(--red)" : "var(--text-faint)", flexShrink: 0 }}>
        {task.due_at ? formatShortDate(task.due_at) : "Sans échéance"}
      </span>
    </div>
  );
}

function MissionRow({ prospect, onUpdateStatus, onOpen }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
      <button
        className="focusable"
        onClick={() => onOpen?.(prospect.id)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: "12px", color: "var(--blue)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {prospect.name}
      </button>
      <select
        value={prospect.status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onUpdateStatus(prospect.id, e.target.value)}
        style={{ fontSize: "11px", padding: "3px 5px", borderRadius: "5px", border: "0.5px solid var(--hairline)", background: "var(--panel2)", color: "var(--text-dim)", flexShrink: 0 }}
      >
        <option value="appeler">À appeler</option>
        <option value="relancer">À relancer</option>
        <option value="attente">En attente</option>
        <option value="retard">En retard</option>
      </select>
    </div>
  );
}
