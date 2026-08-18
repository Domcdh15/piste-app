import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { callAI, parseJsonLoose, formatEuros, formatShortDate, Avatar, SparklesIcon, PhoneIcon, MailIcon, VideoIcon, PinIcon, CalendarIcon, CheckIcon, AlertIcon } from "../lib/ui.jsx";

const VIEWS = ["Liste", "Jour", "Semaine"];

const TASK_TYPE_META = {
  appel_telephone: { label: "Appels", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  appel_visio: { label: "Visio", color: "#7c3aed", dim: "#f1e9fe", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", color: "#527a61", dim: "#eaf1ec", Icon: PinIcon },
  relance_email: { label: "Emails", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
};
const TASK_TYPE_KEYS = Object.keys(TASK_TYPE_META);
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;
const ROW_HEIGHT = 56;
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
  const [view, setView] = useState(settings?.agenda_default_view || "Liste");
  const [refDate, setRefDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(TASK_TYPE_KEYS));
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [panelTask, setPanelTask] = useState(null);

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

  async function reportTask(task, newDue) {
    await supabase.from("tasks").update({ due_at: newDue.toISOString() }).eq("id", task.id);
    loadTasks();
    setPanelTask(null);
  }

  return (
    <div>
      <div className="hero-band" style={{ color: "#fff", padding: "40px 32px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div className="h2" style={{ color: "#fff" }}>Agenda</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "13px", marginTop: "4px" }}>{rangeLabel(view, refDate)}</div>
          </div>
          <button className="focusable" onClick={() => setShowAddForm((s) => !s)} style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: "8px", color: "#fff", fontSize: "13px", fontWeight: 600, padding: "9px 16px" }}>
            {showAddForm ? "Annuler" : "+ Ajouter une action"}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 32px 48px" }}>
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
        <OrganizeDayPanel tasks={[...overdueTasks, ...todayTasks]} prospects={prospects} prospectById={prospectById} session={session} onOpenProspect={onOpenProspect} onClose={() => setShowOrganize(false)} />
      )}

      {showAddForm && (
        <AddActionForm prospects={prospects} session={session} onCreated={() => { loadTasks(); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "18px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-faint)", marginRight: "2px" }}>Types affichés :</span>
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
              overdueTasks={overdueTasks.filter((t) => visibleTypes.has(t.type))}
              todayTasks={todayTasks.filter((t) => visibleTypes.has(t.type))}
              events={events.filter((e) => e.start && e.start.length > 10)}
              prospectById={prospectById}
              matchProspect={matchProspect}
              onToggleTask={toggleTaskDone}
              onOpenProspect={onOpenProspect}
              onOpenPanel={setPanelTask}
              onSelectEvent={setSelectedEventId}
            />
          ) : (
            <TimeGrid events={events} tasks={visibleTasks} view={view} refDate={refDate} onSelect={setSelectedEventId} selectedId={selectedEventId} matchProspect={matchProspect} prospectById={prospectById} onToggleTask={toggleTaskDone} onOpenProspect={onOpenProspect} />
          )}
        </div>

        {selectedEvent && (
          <EventDetailPanel event={selectedEvent} prospect={matchProspect(selectedEvent)} session={session} onOpenProspect={onOpenProspect} onClose={() => setSelectedEventId(null)} />
        )}
        {panelTask && (
          <TaskDetailPanel task={panelTask} prospect={prospectById[panelTask.prospect_id]} onClose={() => setPanelTask(null)} onDone={() => { toggleTaskDone(panelTask); setPanelTask(null); }} onReport={(d) => reportTask(panelTask, d)} onOpenProspect={onOpenProspect} />
        )}
      </div>
      </div>
    </div>
  );
}

const navBtn = { fontSize: "12px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" };

const MAX_TASK_PILLS = 3;

function TimeGrid({ events, tasks, view, refDate, onSelect, selectedId, matchProspect, prospectById, onToggleTask, onOpenProspect }) {
  const [expandedCluster, setExpandedCluster] = useState(null);
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

                {Object.values(
                  laidTasks.reduce((acc, item) => {
                    (acc[item.groupId] = acc[item.groupId] || []).push(item);
                    return acc;
                  }, {})
                ).flatMap((clusterItems) => {
                  const clusterKey = `${d.toDateString()}-${clusterItems[0].groupId}`;
                  const dense = clusterItems.length > MAX_TASK_PILLS;
                  const top = Math.max(0, topFor(clusterItems[0].event.due_at));

                  if (!dense) {
                    return clusterItems.map(({ event: task, colIndex, colCount }) => {
                      const prospect = prospectById?.[task.prospect_id];
                      const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
                      const height = Math.max(26, heightFor(task.start, task.end));
                      const widthPct = TASK_LANE_PCT / colCount;
                      return (
                        <div
                          key={task.id}
                          title={`${meta.label} · ${formatTime(task.due_at)} · ${task.note}`}
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
                            style={{ background: "none", border: "none", padding: 0, textAlign: "left", fontSize: "10px", lineHeight: 1.25, color: meta.color, overflow: "hidden", cursor: prospect ? "pointer" : "default" }}
                          >
                            {task.note}
                          </button>
                        </div>
                      );
                    });
                  }

                  const isOpen = expandedCluster === clusterKey;
                  return [
                    <button
                      key={clusterKey}
                      className="focusable"
                      onClick={() => setExpandedCluster(isOpen ? null : clusterKey)}
                      title={`${clusterItems.length} tâches à ${formatTime(clusterItems[0].event.due_at)}`}
                      style={{
                        position: "absolute", top, height: "26px",
                        left: "1px", width: `calc(${TASK_LANE_PCT}% - 2px)`,
                        background: isOpen ? "var(--blue)" : "var(--panel2)", color: isOpen ? "#fff" : "var(--text-dim)",
                        border: `0.5px solid ${isOpen ? "var(--blue)" : "var(--hairline-strong, var(--hairline))"}`, borderRadius: "5px",
                        fontSize: "10px", fontWeight: 700, zIndex: 2, textAlign: "left", padding: "0 5px",
                      }}
                    >
                      {clusterItems.length} tâches
                    </button>,
                    isOpen && (
                      <div
                        key={`${clusterKey}-popover`}
                        style={{
                          position: "absolute", top: top + 28, left: "1px", width: "220px", zIndex: 10,
                          background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "8px",
                          boxShadow: "var(--shadow-md)", padding: "6px", display: "flex", flexDirection: "column", gap: "2px",
                        }}
                      >
                        {clusterItems.map(({ event: task }) => {
                          const prospect = prospectById?.[task.prospect_id];
                          const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
                          return (
                            <div key={task.id} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px", borderRadius: "5px" }}>
                              <button className="focusable" onClick={() => onToggleTask(task)} style={{ width: "10px", height: "10px", borderRadius: "50%", border: `1.3px solid ${meta.color}`, background: "transparent", flexShrink: 0, padding: 0 }} title="Marquer comme fait" />
                              <meta.Icon size={11} color={meta.color} />
                              <button
                                className="focusable"
                                onClick={() => prospect && onOpenProspect?.(prospect.id)}
                                style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", fontSize: "11px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: prospect ? "pointer" : "default" }}
                              >
                                {task.note}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ),
                  ];
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

function TaskActionCard({ task, prospect, overdue, onToggleTask, onOpenPanel, onOpenProspect }) {
  const meta = TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone;
  const days = prospect?.last_contact_at ? daysSince(prospect.last_contact_at) : null;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "var(--panel)", border: `0.5px solid ${overdue ? "var(--red)55" : "var(--hairline)"}`, borderLeft: `3px solid ${overdue ? "var(--red)" : meta.color}`, borderRadius: "10px", padding: "14px" }}>
      <button className="focusable" onClick={() => onToggleTask(task)} style={{ background: "none", border: "none", padding: 0, marginTop: "2px" }} title="Terminer">
        <span style={{ width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--hairline-strong, var(--hairline))" }}>
          <CheckIcon size={11} color="var(--text-faint)" />
        </span>
      </button>

      <button className="focusable" onClick={() => onOpenPanel(task)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
          <meta.Icon size={12} color={meta.color} />
          <span className="mono" style={{ fontSize: "11px", color: overdue ? "var(--red)" : "var(--text-faint)", fontWeight: 700 }}>
            {overdue ? `En retard · ${formatShortDate(task.due_at)}` : formatTime(task.due_at)}
          </span>
        </div>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{task.note}</div>
        {prospect && (
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>
            {prospect.name} · {prospect.company}{prospect.deal_value > 0 ? ` · ${formatEuros(prospect.deal_value)}` : ""}
          </div>
        )}
        {days !== null && days >= 3 && (
          <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "2px" }}>Dernier échange il y a {days} jour{days > 1 ? "s" : ""}.</div>
        )}
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
        {task.type === "appel_telephone" || task.type === "appel_visio" ? (
          prospect?.phone && <a href={`tel:${prospect.phone}`} className="focusable" style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px", textDecoration: "none", textAlign: "center" }}>Appeler</a>
        ) : task.type === "relance_email" ? (
          <button className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id, "email")} style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px" }}>Générer avec l'IA</button>
        ) : (
          <button className="focusable" onClick={() => prospect && onOpenProspect?.(prospect.id, "script")} style={{ fontSize: "11.5px", fontWeight: 600, background: meta.dim, color: meta.color, border: "none", borderRadius: "6px", padding: "6px 10px" }}>Préparer avec l'IA</button>
        )}
      </div>
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

function ListView({ overdueTasks, todayTasks, events, prospectById, matchProspect, onToggleTask, onOpenProspect, onOpenPanel, onSelectEvent }) {
  const todayItems = [
    ...todayTasks.map((t) => ({ kind: "task", time: new Date(t.due_at), data: t })),
    ...events.map((e) => ({ kind: "event", time: new Date(e.start), data: e })),
  ].sort((a, b) => a.time - b.time);

  if (overdueTasks.length === 0 && todayItems.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-faint)" }}>
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎉</div>
        <div style={{ fontSize: "13px" }}>Rien de prévu aujourd'hui.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "720px" }}>
      {overdueTasks.length > 0 && (
        <div style={{ marginBottom: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
            <AlertIcon size={12} color="var(--red)" />
            <span className="display" style={{ fontWeight: 700, fontSize: "12px", color: "var(--red)", letterSpacing: "0.02em" }}>EN RETARD ({overdueTasks.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {overdueTasks.map((t) => (
              <TaskActionCard key={t.id} task={t} prospect={prospectById[t.prospect_id]} overdue onToggleTask={onToggleTask} onOpenPanel={onOpenPanel} onOpenProspect={onOpenProspect} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="display" style={{ fontWeight: 700, fontSize: "12px", color: "var(--text-dim)", letterSpacing: "0.02em", marginBottom: "10px" }}>AUJOURD'HUI ({todayItems.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {todayItems.map((item) =>
            item.kind === "task" ? (
              <TaskActionCard key={`t-${item.data.id}`} task={item.data} prospect={prospectById[item.data.prospect_id]} onToggleTask={onToggleTask} onOpenPanel={onOpenPanel} onOpenProspect={onOpenProspect} />
            ) : (
              <EventActionCard key={`e-${item.data.id}`} event={item.data} prospect={matchProspect(item.data)} onSelectEvent={onSelectEvent} />
            )
          )}
          {todayItems.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Rien d'autre prévu aujourd'hui.</div>}
        </div>
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
          <span className="display" style={{ fontWeight: 700, fontSize: "15px" }}>{task.note}</span>
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
          <button className="focusable" onClick={() => onOpenProspect?.(prospect.id)} style={{ marginTop: "10px", fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
            Voir la fiche
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

function OrganizeDayPanel({ tasks, prospects, prospectById, session, onOpenProspect, onClose }) {
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
          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "12.5px", color: "var(--text)", lineHeight: 1.9 }}>
            {(result.order || []).map((label, i) => <li key={i}>{label}</li>)}
          </ol>
        </>
      )}
    </div>
  );
}
