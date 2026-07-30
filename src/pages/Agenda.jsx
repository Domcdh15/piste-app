import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { callAI, parseJsonLoose, formatEuros, formatShortDate, Avatar, SparklesIcon, PhoneIcon, MailIcon, VideoIcon, PinIcon } from "../lib/ui.jsx";

const VIEWS = ["Jour", "Semaine", "Mois"];

const TASK_TYPE_META = {
  appel_telephone: { color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  appel_visio: { color: "#7c3aed", dim: "#f1e9fe", Icon: VideoIcon },
  rdv_physique: { color: "#0ea968", dim: "#e2f7ec", Icon: PinIcon },
  relance_email: { color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
};
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;
const ROW_HEIGHT = 56;
const TASK_LANE_PCT = 26;

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d) { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function endOfWeek(d) { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return endOfDay(x); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }

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

function topFor(iso) {
  const d = new Date(iso);
  const hours = d.getHours() + d.getMinutes() / 60;
  return (hours - GRID_START_HOUR) * ROW_HEIGHT;
}

function heightFor(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso || startIso);
  const mins = Math.max(24, (end - start) / 60000);
  return (mins / 60) * ROW_HEIGHT;
}

function layoutDayEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => new Date(a.start) - new Date(b.start));
  const columnEnds = [];
  const placed = sorted.map((event) => {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end || event.start).getTime();
    let colIndex = columnEnds.findIndex((endTime) => endTime <= start);
    if (colIndex === -1) {
      colIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[colIndex] = end;
    }
    return { event, colIndex };
  });
  const colCount = columnEnds.length || 1;
  return placed.map((p) => ({ ...p, colCount }));
}

function rangeLabel(view, refDate) {
  if (view === "Jour") return refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "Mois") return refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const s = startOfWeek(refDate);
  const e = endOfWeek(refDate);
  return `${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function Agenda({ prospects, session, onOpenProspect }) {
  const [view, setView] = useState("Semaine");
  const [refDate, setRefDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [tasks, setTasks] = useState([]);

  const range = view === "Jour" ? [startOfDay(refDate), endOfDay(refDate)]
    : view === "Semaine" ? [startOfWeek(refDate), endOfWeek(refDate)]
    : [startOfMonth(refDate), endOfMonth(refDate)];

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
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
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

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "20px" }}>🗓️ Agenda</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="focusable" onClick={() => navigate(-1)} style={navBtn}>←</button>
          <button className="focusable" onClick={() => setRefDate(new Date())} style={navBtn}>Aujourd'hui</button>
          <button className="focusable" onClick={() => navigate(1)} style={navBtn}>→</button>
          <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px", marginLeft: "8px" }}>
            {VIEWS.map((v) => (
              <button key={v} className="focusable" onClick={() => setView(v)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: view === v ? "var(--hairline)" : "transparent", color: view === v ? "var(--text)" : "var(--text-dim)" }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "18px" }}>{rangeLabel(view, refDate)}</div>

      <div style={{ display: "grid", gridTemplateColumns: selectedEvent ? "minmax(0,1.4fr) minmax(0,1fr)" : "1fr", gap: "20px" }}>
        <div>
          {loading ? (
            <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
          ) : view === "Mois" ? (
            <MonthGrid refDate={refDate} events={events} tasks={tasks} onSelectDay={(d) => { setRefDate(d); setView("Jour"); }} />
          ) : (
            <TimeGrid events={events} tasks={tasks} view={view} refDate={refDate} onSelect={setSelectedEventId} selectedId={selectedEventId} matchProspect={matchProspect} prospectById={prospectById} onToggleTask={toggleTaskDone} onOpenProspect={onOpenProspect} />
          )}
        </div>

        {selectedEvent && (
          <EventDetailPanel event={selectedEvent} prospect={matchProspect(selectedEvent)} session={session} onOpenProspect={onOpenProspect} onClose={() => setSelectedEventId(null)} />
        )}
      </div>
    </div>
  );
}

const navBtn = { fontSize: "12px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" };

function TimeGrid({ events, tasks, view, refDate, onSelect, selectedId, matchProspect, prospectById, onToggleTask, onOpenProspect }) {
  const days = view === "Jour"
    ? [startOfDay(refDate)]
    : (() => {
        const s = startOfWeek(refDate);
        return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
      })();

  const allDayEvents = events.filter((e) => !e.start || e.start.length <= 10);
  const timedEvents = events.filter((e) => e.start && e.start.length > 10);

  const hours = [];
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) hours.push(h);
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT;

  const now = new Date();
  const nowTop = topFor(now.toISOString());
  const showNowLine = nowTop >= 0 && nowTop <= gridHeight;

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", overflow: "hidden" }}>
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
        <div style={{ width: "56px", flexShrink: 0 }}>
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
            return (
              <div key={d.toDateString()} style={{ position: "relative", borderLeft: "0.5px solid var(--hairline)", height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} style={{ position: "absolute", top: (h - GRID_START_HOUR) * ROW_HEIGHT, left: 0, right: 0, borderTop: "0.5px solid var(--hairline)" }} />
                ))}
                {isToday && showNowLine && (
                  <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, height: "2px", background: "var(--red)", zIndex: 3 }}>
                    <span style={{ position: "absolute", left: -4, top: -4, width: "8px", height: "8px", borderRadius: "50%", background: "var(--red)" }} />
                  </div>
                )}

                {laidTasks.map(({ event: task, colIndex, colCount }) => {
                  const prospect = prospectById?.[task.prospect_id];
                  const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
                  const top = Math.max(0, topFor(task.due_at));
                  const height = Math.max(22, heightFor(task.start, task.end));
                  const widthPct = TASK_LANE_PCT / colCount;
                  return (
                    <div
                      key={task.id}
                      style={{
                        position: "absolute", top, height,
                        left: `calc(${colIndex * widthPct}% + 1px)`, width: `calc(${widthPct}% - 2px)`,
                        background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "5px",
                        padding: "2px 3px", overflow: "hidden", zIndex: 2, display: "flex", alignItems: "flex-start", gap: "2px",
                      }}
                    >
                      <button className="focusable" onClick={() => onToggleTask(task)} style={{ width: "9px", height: "9px", borderRadius: "50%", border: `1.3px solid ${meta.color}`, background: "transparent", flexShrink: 0, padding: 0, marginTop: "1px" }} title="Marquer comme fait" />
                      <button
                        className="focusable"
                        onClick={() => prospect && onOpenProspect?.(prospect.id)}
                        style={{ background: "none", border: "none", padding: 0, textAlign: "left", fontSize: "9px", lineHeight: 1.2, color: meta.color, overflow: "hidden", cursor: prospect ? "pointer" : "default" }}
                      >
                        {task.note}
                      </button>
                    </div>
                  );
                })}

                {laid.map(({ event, colIndex, colCount }) => {
                  const prospect = matchProspect(event);
                  const top = Math.max(0, topFor(event.start));
                  const height = Math.max(24, heightFor(event.start, event.end));
                  const widthPct = (100 - eventsLeftPct) / colCount;
                  const active = selectedId === event.id;
                  return (
                    <button
                      key={event.id}
                      className="focusable"
                      onClick={() => onSelect(event.id)}
                      style={{
                        position: "absolute", top, height,
                        left: `calc(${eventsLeftPct + colIndex * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                        background: active ? "var(--blue)" : "var(--blue-dim)",
                        color: active ? "#fff" : "var(--blue)",
                        border: "0.5px solid #2563eb55", borderRadius: "6px", padding: "4px 6px",
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

function MonthGrid({ refDate, events, tasks, onSelectDay }) {
  const start = startOfMonth(refDate);
  const gridStart = startOfWeek(start);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    cells.push(d);
  }
  const eventsByDay = {};
  events.forEach((e) => {
    const key = new Date(e.start).toDateString();
    (eventsByDay[key] = eventsByDay[key] || []).push(e);
  });
  const tasksByDay = {};
  (tasks || []).forEach((t) => {
    if (!t.due_at) return;
    const key = new Date(t.due_at).toDateString();
    (tasksByDay[key] = tasksByDay[key] || []).push(t);
  });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", marginBottom: "6px" }}>
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} style={{ fontSize: "11px", color: "var(--text-faint)", textAlign: "center" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === refDate.getMonth();
          const dayEvents = eventsByDay[d.toDateString()] || [];
          const dayTasks = tasksByDay[d.toDateString()] || [];
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <button
              key={i}
              className="focusable"
              onClick={() => onSelectDay(d)}
              style={{ minHeight: "72px", background: isToday ? "var(--blue-dim)" : "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "6px", textAlign: "left", opacity: inMonth ? 1 : 0.4, display: "flex", flexDirection: "column", gap: "3px", overflow: "hidden" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: "11px", color: isToday ? "var(--blue)" : "var(--text-dim)" }}>{d.getDate()}</span>
                {dayTasks.length > 0 && (
                  <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--amber)", background: "var(--amber-dim)", borderRadius: "8px", padding: "1px 5px" }}>✓ {dayTasks.length}</span>
                )}
              </div>
              {dayEvents.slice(0, 2).map((e) => (
                <span key={e.id} style={{ fontSize: "10px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatTime(e.start)} {e.title}</span>
              ))}
              {dayEvents.length > 2 && <span style={{ fontSize: "10px", color: "var(--text-faint)" }}>+{dayEvents.length - 2}</span>}
            </button>
          );
        })}
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
      setError("La préparation a échoué. Réessaie.");
    } finally {
      setLoadingPrep(false);
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px" }}>
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
        <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>Aucun prospect associé — l'invité(e) de l'événement ne correspond à aucun email enregistré dans Clos'IA.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", paddingBottom: "14px", borderBottom: "0.5px solid var(--hairline)" }}>
            <Avatar name={prospect.name} stage={prospect.stage} size={36} />
            <div>
              <div className="display" style={{ fontWeight: 700, fontSize: "14px" }}>{prospect.name}</div>
              <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{prospect.company}</div>
            </div>
            <button className="focusable" onClick={() => onOpenProspect?.(prospect.id)} style={{ marginLeft: "auto", fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55" }}>
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

          <button className="focusable" onClick={generatePrep} disabled={loadingPrep} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px", marginBottom: "12px", opacity: loadingPrep ? 0.6 : 1 }}>
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
