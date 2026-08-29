import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { callAI, parseJsonLoose, formatEuros, formatShortDate, getFirstName, Avatar, SparklesIcon, PhoneIcon, MailIcon, VideoIcon, PinIcon, CalendarIcon, CheckIcon, AlertIcon } from "../lib/ui.jsx";

const VIEWS = ["Liste", "Jour", "Semaine"];

const TASK_TYPE_META = {
  appel_telephone: { label: "Appels", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  appel_visio: { label: "Visio", color: "#7c3aed", dim: "#f1e9fe", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", color: "#527a61", dim: "#eaf1ec", Icon: PinIcon },
  relance_email: { label: "Emails", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
};
const TASK_TYPE_KEYS = Object.keys(TASK_TYPE_META);
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 19;
const DAY_CODES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function parseHour(value, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!m) return fallback;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : fallback;
}
const ROW_HEIGHT = 56;
// Le premier libellé horaire est centré sur sa ligne : posé à zéro, sa moitié
// haute sortait de la grille et « 08:00 » apparaissait coupé. Cette marge lui
// laisse la place, quelle que soit l'heure de début choisie.
const GRID_TOP_PAD = 12;
const TASK_LANE_PCT = 32;

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d) { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function endOfWeek(d) { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return endOfDay(x); }

function formatTime(iso) {
  if (!iso || iso.length <= 10) return "Toute la journée";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(start, end) {
  if (!start || !end || start.length <= 10) return "";
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function topFor(iso, startHour) {
  const d = new Date(iso);
  const hours = d.getHours() + d.getMinutes() / 60;
  return GRID_TOP_PAD + (hours - startHour) * ROW_HEIGHT;
}

function heightFor(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso || startIso);
  const mins = Math.max(24, (end - start) / 60000);
  return (mins / 60) * ROW_HEIGHT;
}

function layoutDayEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => new Date(a.start) - new Date(b.start));
  const results = [];
  let group = [];
  let columnEnds = [];
  let groupEndMax = null;
  let groupId = 0;

  function flushGroup() {
    if (!group.length) return;
    const colCount = columnEnds.length || 1;
    group.forEach((g) => results.push({ event: g.event, colIndex: g.colIndex, colCount, groupId }));
    group = [];
    columnEnds = [];
    groupEndMax = null;
    groupId += 1;
  }

  for (const event of sorted) {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end || event.start).getTime();
    if (groupEndMax !== null && start >= groupEndMax) flushGroup();
    let colIndex = columnEnds.findIndex((endTime) => endTime <= start);
    if (colIndex === -1) {
      colIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[colIndex] = end;
    }
    group.push({ event, colIndex });
    groupEndMax = groupEndMax === null ? end : Math.max(groupEndMax, end);
  }
  flushGroup();
  return results;
}

function rangeLabel(view, refDate) {
  if (view === "Liste") return "Aujourd'hui · " + refDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  if (view === "Jour") return refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const s = startOfWeek(refDate);
  const e = endOfWeek(refDate);
  return `${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function Agenda({ prospects, session, onOpenProspect, settings }) {
  // Les réglages arrivent après le premier rendu : la valeur initiale de
  // useState ne les voyait jamais et retombait toujours sur "Liste".
  const [view, setView] = useState(settings?.agenda_default_view || "Liste");
  const defaultApplied = useRef(!!settings);

  useEffect(() => {
    if (defaultApplied.current || !settings) return;
    defaultApplied.current = true;
    // On n'applique le réglage qu'une fois : si l'utilisateur a déjà changé
    // de vue entre-temps, on ne le ramène pas de force en arrière.
    if (VIEWS.includes(settings.agenda_default_view)) setView(settings.agenda_default_view);
  }, [settings]);
  const [refDate, setRefDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(TASK_TYPE_KEYS));
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [panelTask, setPanelTask] = useState(null);
  const [statusFilter, setStatusFilter] = useState("Tous");

  function toggleType(key) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const visibleTasks = tasks.filter((t) => visibleTypes.has(t.type));

  const range = view === "Jour" ? [startOfDay(refDate), endOfDay(refDate)]
    : view === "Semaine" ? [startOfWeek(refDate), endOfWeek(refDate)]
    : [startOfDay(new Date()), endOfDay(new Date())];

  async function loadTasks() {
    const { data } = await supabase.from("tasks").select("*").eq("done", false).not("due_at", "is", null);
    setTasks(data || []);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/calendar/range?start=${encodeURIComponent(range[0].toISOString())}&end=${encodeURIComponent(range[1].toISOString())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        setEvents(data.events || []);
      } catch (e) {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    setSelectedEventId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, refDate.toDateString()]);

  async function toggleTaskDone(task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await supabase.from("tasks").update({ done: true, completed_at: new Date().toISOString() }).eq("id", task.id);
  }

  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const prospectByEmail = Object.fromEntries(prospects.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));

  function matchProspect(event) {
    for (const email of event.attendees || []) {
      const p = prospectByEmail[(email || "").toLowerCase()];
      if (p) return p;
    }
    return null;
  }

  function navigate(delta) {
    const d = new Date(refDate);
    if (view === "Jour") d.setDate(d.getDate() + delta);
    else if (view === "Semaine") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setRefDate(d);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const now = new Date();
  const startToday = startOfDay(now);
  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < startToday);
  const todayTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) >= startToday && new Date(t.due_at) <= endOfDay(now));
  const upcomingTasks = tasks
    .filter((t) => t.due_at && new Date(t.due_at) > endOfDay(now))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  // Valeur réellement en jeu : somme des deals distincts touchés par ce qui est
  // en retard ou prévu aujourd'hui. Un même prospect n'est compté qu'une fois.
  const focusValue = [...new Set([...overdueTasks, ...todayTasks].map((t) => t.prospect_id).filter(Boolean))]
    .reduce((sum, id) => sum + (prospectById[id]?.deal_value || 0), 0);

  // Les filtres de type et de statut se cumulent.
  function passesStatus(task, bucket) {
    if (statusFilter === "Tous") return true;
    if (statusFilter === "En retard") return bucket === "overdue";
    if (statusFilter === "Aujourd'hui") return bucket === "today";
    if (statusFilter === "À venir") return bucket === "upcoming";
    if (statusFilter === "Priorité haute") return (task.priority || 0) >= 75;
    return true;
  }
  const applyFilters = (list, bucket) => list.filter((t) => visibleTypes.has(t.type) && passesStatus(t, bucket));

  async function reportTask(task, newDue) {
    await supabase.from("tasks").update({ due_at: newDue.toISOString() }).eq("id", task.id);
    loadTasks();
    setPanelTask(null);
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <div style={{ padding: "32px 32px 0" }}>
        <div className="hero-card" style={{ padding: "26px 32px" }}>
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div className="h2" style={{ color: "#fff" }}>Bonjour{getFirstName(session.user) ? ` ${getFirstName(session.user)}` : ""} 👋</div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "13px", marginTop: "4px" }}>
                {overdueTasks.length + todayTasks.length > 0 ? "Voici ce qui mérite votre attention aujourd'hui." : "Rien d'urgent aujourd'hui — le pipeline est à jour."}
              </div>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "14px" }}>
                {overdueTasks.length > 0 && (
                  <span style={{ fontSize: "13px", color: "#ffd9d4", fontWeight: 600 }}>{overdueTasks.length} en retard</span>
                )}
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.92)", fontWeight: 600 }}>{todayTasks.length} aujourd'hui</span>
                {focusValue > 0 && (
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.92)", fontWeight: 600 }}>{formatEuros(focusValue)} d'opportunités concernées</span>
                )}
              </div>
            </div>
            <button
              className="focusable"
              onClick={() => setShowAddForm((s) => !s)}
              style={{ background: "#fff", border: "none", borderRadius: "10px", color: "var(--blue-deep)", fontSize: "13px", fontWeight: 700, padding: "10px 18px", boxShadow: "0 4px 14px rgba(10,20,50,0.18)" }}
            >
              {showAddForm ? "Annuler" : "+ Ajouter une action"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "22px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {view !== "Liste" && (
            <>
              <button className="focusable" onClick={() => navigate(-1)} style={navBtn}>←</button>
              <button className="focusable" onClick={() => setRefDate(new Date())} style={navBtn}>Aujourd'hui</button>
              <button className="focusable" onClick={() => navigate(1)} style={navBtn}>→</button>
            </>
          )}
          <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px", marginLeft: "8px" }}>
            {VIEWS.map((v) => (
              <button key={v} className="focusable" onClick={() => setView(v)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: view === v ? "var(--hairline)" : "transparent", color: view === v ? "var(--text)" : "var(--text-dim)" }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "Liste" && (
        <DaySummaryBar overdueCount={overdueTasks.length} todayCount={todayTasks.length} onOrganize={() => setShowOrganize((s) => !s)} organizing={showOrganize} />
      )}

      {showOrganize && (
        <OrganizeDayPanel tasks={[...overdueTasks, ...todayTasks]} prospects={prospects} prospectById={prospectById} session={session} onOpenProspect={onOpenProspect} onOpenTask={setPanelTask} onClose={() => setShowOrganize(false)} />
      )}

      {showAddForm && (
        <AddActionForm prospects={prospects} session={session} onCreated={() => { loadTasks(); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />
      )}

      {view === "Liste" && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-faint)", marginRight: "2px" }}>Afficher :</span>
          {["Tous", "En retard", "Aujourd'hui", "À venir", "Priorité haute"].map((f) => (
            <button
              key={f}
              className="focusable"
              onClick={() => setStatusFilter(f)}
              style={{
                padding: "4px 11px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                background: statusFilter === f ? "var(--blue-dim)" : "var(--panel2)",
                color: statusFilter === f ? "var(--blue)" : "var(--text-faint)",
                border: `0.5px solid ${statusFilter === f ? "#147ff555" : "var(--hairline)"}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "18px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-faint)", marginRight: "2px" }}>Types :</span>
        {TASK_TYPE_KEYS.map((key) => {
          const meta = TASK_TYPE_META[key];
          const on = visibleTypes.has(key);
          return (
            <button
              key={key}
              className="focusable"
              onClick={() => toggleType(key)}
              style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                background: on ? meta.dim : "var(--panel2)",
                color: on ? meta.color : "var(--text-faint)",
                border: `0.5px solid ${on ? meta.color + "55" : "var(--hairline)"}`,
                opacity: on ? 1 : 0.7,
              }}
            >
              <meta.Icon size={10} color={on ? meta.color : "var(--text-faint)"} />
              {meta.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: (selectedEvent || panelTask) ? "minmax(0,1.4fr) minmax(0,1fr)" : "1fr", gap: "20px" }}>
        <div>
          {loading ? (
            <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
          ) : view === "Liste" ? (
            <ListView
              overdueTasks={applyFilters(overdueTasks, "overdue")}
              todayTasks={applyFilters(todayTasks, "today")}
              upcomingTasks={applyFilters(upcomingTasks, "upcoming")}
              events={statusFilter === "Tous" || statusFilter === "Aujourd'hui" ? events.filter((e) => e.start && e.start.length > 10) : []}
              prospectById={prospectById}
              matchProspect={matchProspect}
              onToggleTask={toggleTaskDone}
              onOpenProspect={onOpenProspect}
              onOpenPanel={setPanelTask}
              onSelectEvent={setSelectedEventId}
              onReport={(task, date) => reportTask(task, date)}
              onAdd={() => setShowAddForm(true)}
            />
          ) : (
            <TimeGrid events={events} tasks={visibleTasks} view={view} refDate={refDate} onSelect={setSelectedEventId} selectedId={selectedEventId} matchProspect={matchProspect} prospectById={prospectById} onToggleTask={toggleTaskDone} onOpenProspect={onOpenProspect} onOpenTask={setPanelTask} settings={settings} />
          )}
        </div>

        {selectedEvent && (
          <EventDetailPanel event={selectedEvent} prospect={matchProspect(selectedEvent)} session={session} onOpenProspect={onOpenProspect} onClose={() => setSelectedEventId(null)} />
        )}
        {panelTask && (view === "Liste" ? (
          <TaskDetailPanel task={panelTask} prospect={prospectById[panelTask.prospect_id]} onClose={() => setPanelTask(null)} onDone={() => { toggleTaskDone(panelTask); setPanelTask(null); }} onReport={(d) => reportTask(panelTask, d)} onOpenProspect={onOpenProspect} />
        ) : (
          // La vue Liste a une colonne pour l'accueillir ; la grille non — le
          // détail s'y superpose plutôt que de pousser la journée de côté.
          <div
            onClick={() => setPanelTask(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: "20px" }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "420px", maxHeight: "88vh", overflowY: "auto" }}>
              <TaskDetailPanel task={panelTask} prospect={prospectById[panelTask.prospect_id]} onClose={() => setPanelTask(null)} onDone={() => { toggleTaskDone(panelTask); setPanelTask(null); }} onReport={(d) => reportTask(panelTask, d)} onOpenProspect={onOpenProspect} />
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

const navBtn = { fontSize: "12px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" };

const MAX_TASK_PILLS = 3;
const REPORTED_PREFIX = "Tâche oubliée : ";

// Le préfixe est répété sur chaque ligne et mange la largeur utile : on le
// remplace par un marqueur et on rend son texte au libellé.
function taskLabel(note) {
  const reported = typeof note === "string" && note.startsWith(REPORTED_PREFIX);
  return { text: reported ? note.slice(REPORTED_PREFIX.length) : note || "", reported };
}

function TimeGrid({ events, tasks, view, refDate, onSelect, selectedId, matchProspect, prospectById, onToggleTask, onOpenProspect, onOpenTask, settings }) {
  const [expandedCluster, setExpandedCluster] = useState(null);
  // La semaine ne montre que les jours travaillés. Le jour affiché reste
  // celui qu'on a demandé, même s'il n'est pas travaillé.
  const workDays = settings?.work_days?.length ? settings.work_days : ["Lun", "Mar", "Mer", "Jeu", "Ven"];
  const days = view === "Jour"
    ? [startOfDay(refDate)]
    : (() => {
        const s = startOfWeek(refDate);
        const all = Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
        const kept = all.filter((d) => workDays.includes(DAY_CODES[d.getDay()]));
        // Un réglage vide ou incohérent ne doit pas produire une semaine vide.
        return kept.length > 0 ? kept : all;
      })();

  const allDayEvents = events.filter((e) => !e.start || e.start.length <= 10);
  const timedEvents = events.filter((e) => e.start && e.start.length > 10);

  // On part des horaires réglés, puis on élargit pour ne jamais masquer un
  // rendez-vous pris en dehors : se concentrer n'est pas cacher.
  const configuredStart = parseHour(settings?.work_start, DEFAULT_START_HOUR);
  const configuredEnd = Math.max(configuredStart + 1, parseHour(settings?.work_end, DEFAULT_END_HOUR));
  const dayKeys = new Set(days.map((d) => d.toDateString()));
  const shownTimes = [
    ...timedEvents.map((e) => e.start),
    ...tasks.map((t) => t.due_at),
  ].filter((iso) => iso && iso.length > 10 && dayKeys.has(new Date(iso).toDateString()));

  let startHour = configuredStart;
  let endHour = configuredEnd;
  for (const iso of shownTimes) {
    const d = new Date(iso);
    startHour = Math.min(startHour, d.getHours());
    endHour = Math.max(endHour, d.getHours() + 1);
  }

  const hours = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const gridHeight = GRID_TOP_PAD + (endHour - startHour) * ROW_HEIGHT;

  const now = new Date();
  const nowTop = topFor(now.toISOString(), startHour);
  const showNowLine = nowTop >= 0 && nowTop <= gridHeight;

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, borderBottom: "0.5px solid var(--hairline)" }}>
        <div />
        {days.map((d) => {
          const isToday = d.toDateString() === now.toDateString();
          return (
            <div key={d.toDateString()} style={{ padding: "10px 8px", textAlign: "center", borderLeft: "0.5px solid var(--hairline)" }}>
              <div style={{ fontSize: "10px", color: isToday ? "var(--blue)" : "var(--text-faint)", textTransform: "uppercase" }}>{d.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
              <div className="display" style={{ fontSize: "15px", fontWeight: 700, color: isToday ? "var(--blue)" : "var(--text)" }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {allDayEvents.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, borderBottom: "0.5px solid var(--hairline)", background: "var(--panel2)" }}>
          <div style={{ fontSize: "9px", color: "var(--text-faint)", padding: "6px", display: "flex", alignItems: "center" }}>Jour</div>
          {days.map((d) => {
            const dayAllDay = allDayEvents.filter((e) => new Date(e.start).toDateString() === d.toDateString());
            return (
              <div key={d.toDateString()} style={{ padding: "4px", borderLeft: "0.5px solid var(--hairline)", display: "flex", flexDirection: "column", gap: "2px" }}>
                {dayAllDay.map((e) => (
                  <button key={e.id} className="focusable" onClick={() => onSelect(e.id)} style={{ fontSize: "10px", background: selectedId === e.id ? "var(--blue)" : "var(--blue-dim)", color: selectedId === e.id ? "#fff" : "var(--blue)", border: "none", borderRadius: "4px", padding: "2px 5px", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", maxHeight: "640px", overflowY: "auto" }}>
        {/* La colonne des heures suit la même marge que la grille, sinon les
            libellés ne tombent plus sur leurs lignes. */}
        <div style={{ width: "56px", flexShrink: 0, paddingTop: GRID_TOP_PAD }}>
          {hours.map((h) => (
            <div key={h} style={{ height: ROW_HEIGHT, borderTop: "0.5px solid var(--hairline)", fontSize: "10px", color: "var(--text-faint)", textAlign: "right", paddingRight: "6px", boxSizing: "border-box", transform: "translateY(-6px)" }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)`, flex: 1 }}>
          {days.map((d) => {
            const dayEvents = timedEvents.filter((e) => new Date(e.start).toDateString() === d.toDateString());
            const laid = layoutDayEvents(dayEvents);
            const dayTasks = tasks.filter((t) => t.due_at && new Date(t.due_at).toDateString() === d.toDateString());
            const laidTasks = layoutDayEvents(dayTasks.map((t) => ({ ...t, start: t.due_at, end: new Date(new Date(t.due_at).getTime() + 30 * 60000).toISOString() })));
            const isToday = d.toDateString() === now.toDateString();
            const eventsLeftPct = dayTasks.length > 0 ? TASK_LANE_PCT : 0;
            // Sans rendez-vous d'agenda ce jour-là, rien ne justifie de tasser
            // les tâches sur un tiers de la colonne : leur libellé était
            // tronqué à « Envoy… » pendant que 68 % restaient vides.
            const taskLanePct = dayEvents.length > 0 ? TASK_LANE_PCT : 100;
            return (
              <div key={d.toDateString()} style={{ position: "relative", borderLeft: "0.5px solid var(--hairline)", height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} style={{ position: "absolute", top: GRID_TOP_PAD + (h - startHour) * ROW_HEIGHT, left: 0, right: 0, borderTop: "0.5px solid var(--hairline)" }} />
                ))}
                {isToday && showNowLine && (
                  <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, height: "2px", background: "var(--red)", zIndex: 3 }}>
                    <span style={{ position: "absolute", left: -4, top: -4, width: "8px", height: "8px", borderRadius: "50%", background: "var(--red)" }} />
                  </div>
                )}

                {(() => {
                  // Chaque tâche est placée à son heure réelle. On ne regroupe que les
                  // tâches qui tombent exactement à la même minute — sinon une tâche de
                  // 8h et une de 8h40 se retrouvaient empilées à 8h.
                  const byExactTime = new Map();
                  for (const item of laidTasks) {
                    const key = new Date(item.event.due_at).toISOString().slice(0, 16);
                    if (!byExactTime.has(key)) byExactTime.set(key, []);
                    byExactTime.get(key).push(item);
                  }

                  const nodes = [];
                  for (const [timeKey, group] of byExactTime) {
                    const top = Math.max(0, topFor(group[0].event.due_at, startHour));

                    if (group.length > MAX_TASK_PILLS) {
                      const clusterKey = `${d.toDateString()}-${timeKey}`;
                      const isOpen = expandedCluster === clusterKey;
                      nodes.push(
                        <button
                          key={clusterKey}
                          className="focusable"
                          onClick={() => setExpandedCluster(isOpen ? null : clusterKey)}
                          title={`${group.length} tâches à ${formatTime(group[0].event.due_at)}`}
                          style={{
                            position: "absolute", top, height: "26px",
                            left: "1px", width: `calc(${taskLanePct}% - 2px)`,
                            background: isOpen ? "var(--blue)" : "var(--panel2)", color: isOpen ? "#fff" : "var(--text-dim)",
                            border: `0.5px solid ${isOpen ? "var(--blue)" : "var(--hairline-strong)"}`, borderRadius: "5px",
                            fontSize: "10px", fontWeight: 700, zIndex: 2, textAlign: "left", padding: "0 5px",
                          }}
                        >
                          {group.length} tâches
                        </button>
                      );
                      if (isOpen) {
                        nodes.push(
                          <div
                            key={`${clusterKey}-popover`}
                            style={{
                              position: "absolute", top: top + 28, left: "1px", width: "min(340px, 92%)", zIndex: 10,
                              background: "var(--panel)", border: "0.5px solid var(--hairline-strong)", borderRadius: "10px",
                              boxShadow: "var(--shadow-md)", padding: "8px", display: "flex", flexDirection: "column", gap: "3px",
                              maxHeight: "320px", overflowY: "auto",
                            }}
                          >
                            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)", padding: "2px 6px 6px" }}>
                              {group.length} tâches à {formatTime(group[0].event.due_at)}
                            </div>
                            {group.map(({ event: task }) => {
                              const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
                              const prospect = prospectById?.[task.prospect_id];
                              const { text, reported } = taskLabel(task.note);
                              return (
                                <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: "7px", padding: "6px 7px", borderRadius: "6px", background: meta.dim }}>
                                  <button className="focusable" onClick={() => onToggleTask(task)} style={{ width: "12px", height: "12px", borderRadius: "50%", border: `1.4px solid ${meta.color}`, background: "transparent", flexShrink: 0, padding: 0, marginTop: "2px" }} title="Marquer comme fait" />
                                  <button
                                    className="focusable"
                                    onClick={() => onOpenTask?.(task)}
                                    title="Voir le détail"
                                    style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                                  >
                                    <span style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: meta.color, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                                      {reported && <span title="Reportée depuis un jour manqué" style={{ marginRight: "4px", opacity: 0.75 }}>↻</span>}
                                      {text}
                                    </span>
                                    {prospect && (
                                      <span style={{ display: "block", fontSize: "10.5px", color: "var(--text-dim)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {prospect.company || prospect.name}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      continue;
                    }

                    for (const { event: task, colIndex, colCount } of group) {
                      const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
                      const height = Math.max(26, heightFor(task.start, task.end));
                      // Les colonnes ne servent qu'aux tâches réellement simultanées.
                      const cols = Math.min(colCount, group.length);
                      const widthPct = taskLanePct / cols;
                      const col = Math.min(colIndex, cols - 1);
                      nodes.push(
                        <div
                          key={task.id}
                          title={`${meta.label} · ${formatTime(task.due_at)} · ${taskLabel(task.note).text}${taskLabel(task.note).reported ? " (reportée)" : ""}`}
                          style={{
                            position: "absolute", top: Math.max(0, topFor(task.due_at, startHour)), height,
                            left: `calc(${col * widthPct}% + 1px)`, width: `calc(${widthPct}% - 2px)`,
                            background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "5px",
                            padding: "2px 3px", overflow: "hidden", zIndex: 2, display: "flex", alignItems: "flex-start", gap: "2px",
                          }}
                        >
                          <button className="focusable" onClick={() => onToggleTask(task)} style={{ width: "9px", height: "9px", borderRadius: "50%", border: `1.3px solid ${meta.color}`, background: "transparent", flexShrink: 0, padding: 0, marginTop: "1px" }} title="Marquer comme fait" />
                          <button
                            className="focusable"
                            onClick={() => onOpenTask?.(task)}
                            title="Voir le détail"
                            style={{
                              background: "none", border: "none", padding: 0, textAlign: "left",
                              fontSize: "10px", lineHeight: 1.3, color: meta.color, cursor: "pointer",
                              // Le texte était clippé horizontalement mais débordait en hauteur
                              // sur la tâche suivante : on limite au nombre de lignes que
                              // la pastille peut réellement contenir.
                              minWidth: 0, flex: 1,
                              display: "-webkit-box", WebkitBoxOrient: "vertical",
                              WebkitLineClamp: Math.max(1, Math.floor((height - 6) / 13)),
                              overflow: "hidden", wordBreak: "break-word",
                            }}
                          >
                            {taskLabel(task.note).reported && <span title="Reportée depuis un jour manqué" style={{ marginRight: "3px", opacity: 0.75 }}>↻</span>}
                            {taskLabel(task.note).text}
                          </button>
                        </div>
                      );
                    }
                  }
                  return nodes;
                })()}

                {laid.map(({ event, colIndex, colCount }) => {
                  const prospect = matchProspect(event);
                  const top = Math.max(0, topFor(event.start, startHour));
                  const height = Math.max(24, heightFor(event.start, event.end));
                  const widthPct = (100 - eventsLeftPct) / colCount;
                  const active = selectedId === event.id;
                  return (
                    <button
                      key={event.id}
                      className="focusable"
                      onClick={() => onSelect(event.id)}
                      title={`${event.title} · ${formatTime(event.start)}${prospect ? ` · ${prospect.name}` : ""}`}
                      style={{
                        position: "absolute", top, height,
                        left: `calc(${eventsLeftPct + colIndex * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                        background: active ? "var(--blue)" : "var(--blue-dim)",
                        color: active ? "#fff" : "var(--blue)",
                        border: "0.5px solid #147ff555", borderRadius: "6px", padding: "4px 6px",
                        textAlign: "left", overflow: "hidden", zIndex: 2, fontSize: "11px", cursor: "pointer",
                      }}
                    >
                      <div className="display" style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</div>
                      {height > 34 && (
                        <div style={{ fontSize: "10px", opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {formatTime(event.start)}{prospect ? ` · ${prospect.name}` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventDetailPanel({ event, prospect, session, onOpenProspect, onClose }) {
  const [tasks, setTasks] = useState([]);
  const [prep, setPrep] = useState(null);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrep(null);
    setError("");
    if (!prospect) {
      setTasks([]);
      return;
    }
    supabase.from("tasks").select("*").eq("prospect_id", prospect.id).eq("done", false).then(({ data }) => setTasks(data || []));
  }, [prospect?.id]);

  async function generatePrep() {
    if (!prospect) return;
    setLoadingPrep(true);
    setError("");
    try {
      const [emails, analyses, activities] = await Promise.all([
        supabase.from("emails_generes").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("analyses_ia").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("activities").select("*").eq("prospect_id", prospect.id),
      ]);
      const callsAbouti = (activities.data || []).filter((a) => a.type === "appel_abouti").length;
      const callsManque = (activities.data || []).filter((a) => a.type === "appel_manque").length;
      const context = [
        `Appels précédents : ${callsAbouti} abouti(s), ${callsManque} manqué(s).`,
        emails.data?.[0] ? `Dernier email : "${emails.data[0].content.slice(0, 300)}"` : "",
        analyses.data?.[0] ? `Dernière analyse : ${analyses.data[0].content}` : "",
      ].filter(Boolean).join("\n");

      const prompt = `Tu es un coach commercial. Prépare ce rendez-vous : "${event.title}". Réponds UNIQUEMENT en JSON valide, format : {"summary": "résumé du compte en 1-2 phrases", "topics": ["point à aborder", "..."], "objections": ["...", "..."], "objective": "objectif du rendez-vous en une phrase"}. Maximum 3 éléments par liste, en français.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Contexte :
${context}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setPrep(parsed);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "La préparation a échoué. Réessaie.");
    } finally {
      setLoadingPrep(false);
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "16px" }}>{event.title}</div>
          <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{formatTime(event.start)} – {formatTime(event.end)} · {durationLabel(event.start, event.end)}</div>
        </div>
        <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px" }}>✕</button>
      </div>

      {(event.location || event.meetingUrl) && (
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px" }}>
          {event.meetingUrl ? <a href={event.meetingUrl} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Rejoindre la visio</a> : event.location}
        </div>
      )}

      {!prospect ? (
        <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>Aucun prospect associé — l'invité(e) de l'événement ne correspond à aucun email enregistré dans Closia.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", paddingBottom: "14px", borderBottom: "0.5px solid var(--hairline)" }}>
            <Avatar name={prospect.name} stage={prospect.stage} size={36} />
            <div>
              <div className="display" style={{ fontWeight: 700, fontSize: "14px" }}>{prospect.name}</div>
              <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{prospect.company}</div>
            </div>
            <button className="focusable" onClick={() => onOpenProspect?.(prospect.id)} style={{ marginLeft: "auto", fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555" }}>
              Ouvrir le dossier
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>DERNIER CONTACT</div>
              <div style={{ fontSize: "13px", color: "var(--text)" }}>{prospect.last_contact_at ? formatShortDate(prospect.last_contact_at) : "Jamais"}</div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>MONTANT</div>
              <div style={{ fontSize: "13px", color: "var(--text)" }}>{formatEuros(prospect.deal_value)}</div>
            </div>
          </div>

          {tasks.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "6px" }}>TÂCHES LIÉES</div>
              {tasks.map((t) => <div key={t.id} style={{ fontSize: "12px", color: "var(--text)", marginBottom: "4px" }}>• {t.note}</div>)}
            </div>
          )}

          <button className="focusable" onClick={generatePrep} disabled={loadingPrep} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px", fontSize: "13px", marginBottom: "12px", opacity: loadingPrep ? 0.6 : 1 }}>
            <SparklesIcon size={13} color="var(--blue)" /> {loadingPrep ? "Préparation..." : "Préparer avec l'IA"}
          </button>
          {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}

          {prep && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <PrepRow label="Résumé du compte">{prep.summary}</PrepRow>
              <PrepRow label="Points à aborder" list={prep.topics} />
              <PrepRow label="Objections probables" list={prep.objections} />
              <PrepRow label="Objectif du rendez-vous">{prep.objective}</PrepRow>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PrepRow({ label, children, list }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "4px" }}>{label.toUpperCase()}</div>
      {list ? (
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--text)", lineHeight: 1.6 }}>
          {(list || []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: "13px", color: "var(--text)" }}>{children}</div>
      )}
    </div>
  );
}

function DaySummaryBar({ overdueCount, todayCount, onOrganize, organizing }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
      <span style={{ fontSize: "13px", fontWeight: 600 }}>{todayCount} action{todayCount > 1 ? "s" : ""} aujourd'hui</span>
      {overdueCount > 0 && <span style={{ fontSize: "12.5px", color: "var(--red)", fontWeight: 600 }}>⚠ {overdueCount} en retard</span>}
      <button className="focusable" onClick={onOrganize} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", background: organizing ? "var(--blue)" : "var(--blue-dim)", color: organizing ? "#fff" : "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600 }}>
        <SparklesIcon size={12} color={organizing ? "#fff" : "var(--blue)"} /> Organiser ma journée
      </button>
    </div>
  );
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

const ACTION_VERB = { appel_telephone: "Appeler", appel_visio: "Appel visio avec", rdv_physique: "RDV avec", relance_email: "Relancer" };

// Report proposé directement sur la carte : reporter est le geste le plus fréquent
// quand on traite sa liste du matin, il ne doit pas demander d'ouvrir un panneau.
const QUICK_REPORT = [
  { label: "Plus tard aujourd'hui", compute: () => { const d = new Date(); d.setHours(Math.min(21, d.getHours() + 3), 0, 0, 0); return d; } },
  { label: "Demain", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: "Dans 3 jours", compute: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); return d; } },
];

const PRIMARY_ACTION = {
  appel_telephone: { label: "Appeler", ai: "Préparer l'appel", aiTab: "script" },
  appel_visio: { label: "Voir le RDV", ai: "Préparer la visio", aiTab: "script" },
  rdv_physique: { label: "Voir le RDV", ai: "Préparer le RDV", aiTab: "script" },
  relance_email: { label: "Envoyer", ai: "Générer l'email", aiTab: "email" },
};

function TaskActionCard({ task, prospect, bucket, onToggleTask, onOpenPanel, onOpenProspect, onReport }) {
  const [reporting, setReporting] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
  const action = PRIMARY_ACTION[task.type] || { label: "Faire maintenant", ai: "Préparer avec l'IA", aiTab: "script" };
  const overdue = bucket === "overdue";
  const days = prospect?.last_contact_at ? daysSince(prospect.last_contact_at) : null;

  // L'accent rouge est réservé au retard ; le reste garde un traitement neutre.
  const accent = overdue ? "var(--red)" : bucket === "today" ? meta.color : "var(--hairline-strong)";

  function doPrimary() {
    if (!prospect) return onOpenPanel(task);
    if (task.type === "appel_telephone" && prospect.phone) {
      window.location.href = `tel:${prospect.phone}`;
      return;
    }
    if (task.type === "relance_email") return onOpenProspect?.(prospect.id, "email");
    onOpenProspect?.(prospect.id);
  }

  return (
    <div style={{ background: "var(--panel)", border: `0.5px solid ${overdue ? "var(--red)33" : "var(--hairline)"}`, borderLeft: `3px solid ${accent}`, borderRadius: "10px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <button className="focusable" onClick={() => onToggleTask(task)} style={{ background: "none", border: "none", padding: 0, marginTop: "2px", flexShrink: 0 }} title="Marquer fait">
          <span style={{ width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--hairline-strong)" }}>
            <CheckIcon size={11} color="var(--text-faint)" />
          </span>
        </button>

        <button className="focusable" onClick={() => onOpenPanel(task)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <meta.Icon size={12} color={meta.color} />
            <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 700 }}>
              {bucket === "upcoming" ? formatShortDate(task.due_at) : formatTime(task.due_at)}
            </span>
            {overdue && (
              <span style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--red)", background: "var(--red-dim)", borderRadius: "4px", padding: "2px 7px" }}>
                EN RETARD · {formatShortDate(task.due_at)}
              </span>
            )}
            {(task.priority || 0) >= 75 && !overdue && (
              <span style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--blue)", background: "var(--blue-dim)", borderRadius: "4px", padding: "2px 7px" }}>PRIORITAIRE</span>
            )}
          </div>

          <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>
            {taskLabel(task.note).reported && <span title="Reportée depuis un jour manqué" style={{ marginRight: "5px", color: "var(--text-faint)" }}>↻</span>}
            {taskLabel(task.note).text}
          </div>

          {prospect && (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "3px" }}>
              {prospect.name} · {prospect.company}
            </div>
          )}
          {prospect && (prospect.deal_value > 0 || prospect.stage) && (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "1px" }}>
              {[prospect.deal_value > 0 ? formatEuros(prospect.deal_value) : null, prospect.stage].filter(Boolean).join(" · ")}
            </div>
          )}
          {days !== null && days >= 3 && (
            <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "3px" }}>Dernier contact : il y a {days} jours</div>
          )}
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", paddingLeft: "32px" }}>
        <button className="focusable" onClick={doPrimary} style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "7px", padding: "7px 13px" }}>
          {action.label}
        </button>
        <button className="focusable" onClick={() => setReporting((r) => !r)} style={{ fontSize: "11.5px", fontWeight: 600, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "7px", padding: "7px 13px" }}>
          Reporter
        </button>
        {prospect && (
          <button className="focusable" onClick={() => onOpenProspect?.(prospect.id, action.aiTab)} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, background: "none", color: "var(--violet)", border: "none", borderRadius: "7px", padding: "7px 6px" }}>
            <SparklesIcon size={11} color="var(--violet)" /> {action.ai}
          </button>
        )}
      </div>

      {reporting && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginTop: "10px", marginLeft: "32px", padding: "10px 12px", background: "var(--panel2)", borderRadius: "8px" }}>
          {QUICK_REPORT.map((opt) => (
            <button key={opt.label} className="focusable" onClick={() => { onReport(task, opt.compute()); setReporting(false); }} style={{ fontSize: "11.5px", fontWeight: 600, background: "var(--panel)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px" }}>
              {opt.label}
            </button>
          ))}
          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              if (e.target.value) {
                const d = new Date(`${e.target.value}T09:00`);
                onReport(task, d);
                setReporting(false);
              }
            }}
            style={{ fontSize: "11.5px", padding: "5px 8px", borderRadius: "6px", border: "0.5px solid var(--hairline)", background: "var(--panel)", color: "var(--text)" }}
          />
        </div>
      )}
    </div>
  );
}

function EventActionCard({ event, prospect, onSelectEvent }) {
  return (
    <button className="focusable" onClick={() => onSelectEvent(event.id)} style={{ display: "flex", alignItems: "flex-start", gap: "12px", width: "100%", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderLeft: "3px solid var(--blue)", borderRadius: "10px", padding: "14px", textAlign: "left" }}>
      <span style={{ width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>
        <CalendarIcon size={14} color="var(--blue)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 700 }}>{formatTime(event.start)}</span>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{event.title}</div>
        {prospect && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>{prospect.name} · {prospect.company}</div>}
      </div>
    </button>
  );
}

function SectionHeader({ dot, label, count, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, alignSelf: "center" }} />
      <span className="display" style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.03em" }}>{label}</span>
      <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)" }}>{count}</span>
      {hint && <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{hint}</span>}
    </div>
  );
}

const UPCOMING_INITIAL = 5;

function ListView({ overdueTasks, todayTasks, upcomingTasks, events, prospectById, matchProspect, onToggleTask, onOpenProspect, onOpenPanel, onSelectEvent, onReport, onAdd }) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const todayItems = [
    ...todayTasks.map((t) => ({ kind: "task", time: new Date(t.due_at), data: t })),
    ...events.map((e) => ({ kind: "event", time: new Date(e.start), data: e })),
  ].sort((a, b) => a.time - b.time);

  const visibleUpcoming = showAllUpcoming ? upcomingTasks : upcomingTasks.slice(0, UPCOMING_INITIAL);
  const nothingAtAll = overdueTasks.length === 0 && todayItems.length === 0 && upcomingTasks.length === 0;

  if (nothingAtAll) {
    return (
      <div style={{ textAlign: "center", padding: "56px 20px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px" }}>
        <SparklesIcon size={20} color="var(--blue)" />
        <div className="display" style={{ fontWeight: 700, fontSize: "15px", marginTop: "10px" }}>Rien à traiter aujourd'hui</div>
        <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "5px", marginBottom: "16px" }}>Toutes vos actions sont à jour.</div>
        <button className="focusable" onClick={onAdd} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", fontWeight: 600 }}>
          + Ajouter une action
        </button>
      </div>
    );
  }

  const cardProps = { onToggleTask, onOpenPanel, onOpenProspect, onReport };

  return (
    <div style={{ maxWidth: "760px" }}>
      {overdueTasks.length > 0 && (
        <div style={{ marginBottom: "26px" }}>
          <SectionHeader dot="var(--red)" label="À TRAITER" count={overdueTasks.length} hint="en retard ou oublié" />
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {overdueTasks.map((t) => (
              <TaskActionCard key={t.id} task={t} prospect={prospectById[t.prospect_id]} bucket="overdue" {...cardProps} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "26px" }}>
        <SectionHeader dot="var(--blue)" label="AUJOURD'HUI" count={todayItems.length} />
        {todayItems.length === 0 ? (
          <div style={{ fontSize: "12.5px", color: "var(--text-faint)", padding: "10px 0" }}>Rien de prévu aujourd'hui.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {todayItems.map((item) =>
              item.kind === "task" ? (
                <TaskActionCard key={`t-${item.data.id}`} task={item.data} prospect={prospectById[item.data.prospect_id]} bucket="today" {...cardProps} />
              ) : (
                <EventActionCard key={`e-${item.data.id}`} event={item.data} prospect={matchProspect(item.data)} onSelectEvent={onSelectEvent} />
              )
            )}
          </div>
        )}
      </div>

      <div>
        <SectionHeader dot="var(--success)" label="À VENIR" count={upcomingTasks.length} />
        {upcomingTasks.length === 0 ? (
          <div style={{ fontSize: "12.5px", color: "var(--text-faint)", padding: "10px 0" }}>
            Aucune action planifiée.{" "}
            <button className="focusable" onClick={onAdd} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontSize: "12.5px", fontWeight: 600 }}>+ Ajouter une action</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {visibleUpcoming.map((t) => (
                <TaskActionCard key={t.id} task={t} prospect={prospectById[t.prospect_id]} bucket="upcoming" {...cardProps} />
              ))}
            </div>
            {upcomingTasks.length > UPCOMING_INITIAL && (
              <button className="focusable" onClick={() => setShowAllUpcoming((v) => !v)} style={{ background: "none", border: "none", padding: "12px 0 0", color: "var(--blue)", fontSize: "12.5px", fontWeight: 600 }}>
                {showAllUpcoming ? "Réduire" : `Voir toutes les actions (${upcomingTasks.length})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const REPORT_OPTIONS = [
  { label: "Aujourd'hui 17h", compute: () => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; } },
  { label: "Demain 09h", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: "Demain 14h", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; } },
];

function TaskDetailPanel({ task, prospect, onClose, onDone, onReport, onOpenProspect }) {
  const [customDate, setCustomDate] = useState("");
  const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
  const days = prospect?.last_contact_at ? daysSince(prospect.last_contact_at) : null;

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <meta.Icon size={15} color={meta.color} />
          <span className="display" style={{ fontWeight: 700, fontSize: "15px" }}>
            {taskLabel(task.note).reported && <span title="Reportée depuis un jour manqué" style={{ marginRight: "5px", color: "var(--text-faint)" }}>↻</span>}
            {taskLabel(task.note).text}
          </span>
        </div>
        <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px" }}>✕</button>
      </div>

      <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginBottom: "14px" }}>{formatShortDate(task.due_at)}</div>

      {prospect && (
        <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <Avatar name={prospect.name} stage={prospect.stage} size={32} />
            <div>
              <div className="display" style={{ fontWeight: 700, fontSize: "13px" }}>{prospect.name}</div>
              <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{prospect.company}</div>
            </div>
            {prospect.deal_value > 0 && <span className="mono" style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "var(--gold-deep)" }}>{formatEuros(prospect.deal_value)}</span>}
          </div>
          {days !== null && <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>Dernier échange il y a {days} jour{days > 1 ? "s" : ""}.</div>}
          {prospect.last_analysis?.recommendation && (
            <div style={{ marginTop: "10px", background: "var(--blue-dim)", borderRadius: "8px", padding: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, color: "var(--blue)", marginBottom: "4px" }}>
                <SparklesIcon size={10} color="var(--blue)" /> RECOMMANDATION CLOSIA
              </div>
              <div style={{ fontSize: "12px", color: "var(--text)" }}>{prospect.last_analysis.recommendation}</div>
            </div>
          )}
          <button className="focusable" onClick={() => onOpenProspect?.(prospect.id)} style={{ marginTop: "12px", width: "100%", fontSize: "12.5px", fontWeight: 600, padding: "9px 10px", borderRadius: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555" }}>
            Ouvrir la fiche complète
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button className="focusable" onClick={onDone} style={{ flex: 1, background: "#eaf1ec", color: "#527a61", border: "none", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600 }}>
          Terminer
        </button>
      </div>

      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "8px" }}>REPORTER</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {REPORT_OPTIONS.map((opt) => (
          <button key={opt.label} className="focusable" onClick={() => onReport(opt.compute())} style={{ textAlign: "left", fontSize: "12.5px", background: "var(--panel2)", color: "var(--text)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "8px 10px" }}>
            {opt.label}
          </button>
        ))}
        <div style={{ display: "flex", gap: "6px" }}>
          <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} style={{ flex: 1, background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "6px", color: "var(--text)", fontSize: "12.5px", padding: "8px 10px" }} />
          <button className="focusable" onClick={() => customDate && onReport(new Date(`${customDate}T09:00`))} disabled={!customDate} style={{ fontSize: "12.5px", background: "var(--panel2)", color: "var(--text)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "8px 12px", opacity: customDate ? 1 : 0.5 }}>
            Reporter
          </button>
        </div>
      </div>
    </div>
  );
}

function AddActionForm({ prospects, session, onCreated, onCancel }) {
  const [type, setType] = useState("appel_telephone");
  const [prospectId, setProspectId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  const field = { background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "8px 10px" };

  async function submit(e) {
    e.preventDefault();
    if (!prospectId || !note.trim()) return;
    setSaving(true);
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospectId,
      type,
      note: note.trim(),
      due_at: date ? new Date(`${date}T${time || "09:00"}`).toISOString() : null,
    });
    setSaving(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      <select value={type} onChange={(e) => setType(e.target.value)} style={field}>
        {Object.entries(TASK_TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label.replace(/s$/, "")}</option>)}
      </select>
      <select required value={prospectId} onChange={(e) => setProspectId(e.target.value)} style={field}>
        <option value="">Prospect...</option>
        {prospects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
      </select>
      <input required placeholder="Action (ex : relancer sur le budget)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...field, gridColumn: "1 / -1" }} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
        <button type="submit" disabled={saving || !prospectId || !note.trim()} className="focusable" style={{ flex: 1, background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600 }}>
          {saving ? "Création..." : "Créer"}
        </button>
        <button type="button" onClick={onCancel} className="focusable" style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 16px", fontSize: "13px" }}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function OrganizeDayPanel({ tasks, prospects, prospectById, session, onOpenProspect, onOpenTask, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [thread, setThread] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  function describe(t) {
    const p = prospectById[t.prospect_id];
    return `${taskLabel(t.note).text} · ${TASK_TYPE_META[t.type]?.label || t.type} · ${t.due_at ? formatShortDate(t.due_at) : "sans heure"}${p ? ` · ${p.name} (${p.company}) · ${formatEuros(p.deal_value || 0)}` : ""}`;
  }

  async function organize() {
    setLoading(true);
    setError("");
    try {
      // On numérote les actions et on demande des numéros en retour : rapprocher
      // ensuite des intitulés libres se cassait dès que l'IA reformulait un mot.
      const list = tasks.map((t, i) => `${i + 1}. ${describe(t)}`).join("\n");
      const prompt = `Tu es un coach commercial. Voici les actions en retard et prévues aujourd'hui pour ce commercial. Réponds UNIQUEMENT en JSON valide, format :
{"summary": "1-2 phrases expliquant la priorité du jour", "order": [3, 1, 5]}

"order" contient les NUMÉROS des actions, du plus urgent au moins urgent. Reprends tous les numéros, n'en invente aucun.

Actions :
${list || "Aucune."}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
      setThread([]);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'organisation a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  // Chaque ligne du plan doit renvoyer à une vraie tâche. On accepte les numéros
  // (format demandé) comme les intitulés, au cas où l'IA réponde à sa façon.
  const ordered = (() => {
    if (!result?.order) return [];
    const used = new Set();
    const rows = [];
    for (const entry of result.order) {
      let task = null;
      const n = Number(entry);
      if (Number.isInteger(n) && n >= 1 && n <= tasks.length) {
        task = tasks[n - 1];
      } else if (typeof entry === "string") {
        const needle = entry.trim().toLowerCase().slice(0, 24);
        task = tasks.find((t) => !used.has(t.id) && taskLabel(t.note).text.trim().toLowerCase().startsWith(needle));
      }
      if (task && used.has(task.id)) task = null;
      if (task) used.add(task.id);
      // Un numéro hors liste ou répété n'a rien à afficher : on l'ignore plutôt
      // que de montrer une ligne « 9 » vide de sens.
      if (!task && !Number.isNaN(Number(entry))) continue;
      rows.push({ task, label: task ? taskLabel(task.note).text : String(entry) });
    }
    // Une action oubliée par l'IA reste visible : on ne perd pas de travail.
    for (const t of tasks) if (!used.has(t.id)) rows.push({ task: t, label: taskLabel(t.note).text });
    return rows;
  })();

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setQuestion("");
    setThread((t) => [...t, { role: "user", text: q }]);
    setAsking(true);
    try {
      const plan = ordered.map((r, i) => `${i + 1}. ${r.task ? describe(r.task) : r.label}`).join("\n");
      const prompt = `Tu es un coach commercial. Tu viens de proposer ce plan de journée :

${result?.summary || ""}

${plan}

Question du commercial : ${q}

Réponds en français, en 4 phrases maximum. Pas de markdown, pas d'emoji, pas de liste à puces. Ne parle que des actions ci-dessus, n'en invente aucune. Si la question sort de ce cadre, dis-le simplement.`;
      const answer = await callAI(prompt, session.access_token);
      setThread((t) => [...t, { role: "ai", text: (answer || "").trim() || "Je n'ai pas de réponse à donner sur ce plan." }]);
    } catch {
      setThread((t) => [...t, { role: "ai", text: "Je n'ai pas pu répondre. Réessaie." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={{ background: "var(--blue-dim)", border: "0.5px solid #147ff555", borderRadius: "12px", padding: "16px", marginBottom: "18px" }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "14px" }}>
            {ordered.map((row, i) => {
              const meta = row.task ? TASK_TYPE_META[row.task.type] || TASK_TYPE_META.appel_telephone : null;
              const prospect = row.task ? prospectById[row.task.prospect_id] : null;
              return (
                <button
                  key={row.task?.id || `x-${i}`}
                  className="focusable"
                  disabled={!row.task}
                  onClick={() => row.task && onOpenTask?.(row.task)}
                  title={row.task ? "Voir ce qu'il faut faire" : undefined}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "10px", textAlign: "left",
                    background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px",
                    padding: "9px 11px", cursor: row.task ? "pointer" : "default", opacity: row.task ? 1 : 0.6,
                  }}
                >
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--blue)", flexShrink: 0, marginTop: "1px", width: "16px" }}>{i + 1}</span>
                  {meta && <meta.Icon size={12} color={meta.color} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--text)", lineHeight: 1.35, overflowWrap: "anywhere" }}>{row.label}</span>
                    {prospect && (
                      <span style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginTop: "1px" }}>
                        {prospect.company || prospect.name}{prospect.deal_value > 0 ? ` · ${formatEuros(prospect.deal_value)}` : ""}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ borderTop: "0.5px solid #147ff533", paddingTop: "12px" }}>
            {thread.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
                {thread.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "88%", fontSize: "12.5px", lineHeight: 1.5,
                      background: m.role === "user" ? "var(--blue)" : "var(--panel)",
                      color: m.role === "user" ? "#fff" : "var(--text)",
                      border: m.role === "user" ? "none" : "0.5px solid var(--hairline)",
                      borderRadius: "10px", padding: "8px 11px", whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.text}
                  </div>
                ))}
                {asking && <div style={{ alignSelf: "flex-start", fontSize: "12px", color: "var(--text-dim)" }}>Closia réfléchit…</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: "7px" }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }}
                placeholder="Par quoi commencer si je n'ai que deux heures ?"
                style={{ flex: 1, minWidth: 0, background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "12.5px", padding: "9px 11px" }}
              />
              <button className="focusable" onClick={ask} disabled={asking || !question.trim()} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 14px", fontSize: "12.5px", fontWeight: 600, opacity: asking || !question.trim() ? 0.5 : 1 }}>
                Demander
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
