import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { callAI, parseJsonLoose, formatEuros, formatShortDate, Avatar, SparklesIcon } from "../lib/ui.jsx";

const VIEWS = ["Jour", "Semaine", "Mois"];

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

  const range = view === "Jour" ? [startOfDay(refDate), endOfDay(refDate)]
    : view === "Semaine" ? [startOfWeek(refDate), endOfWeek(refDate)]
    : [startOfMonth(refDate), endOfMonth(refDate)];

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
            <MonthGrid refDate={refDate} events={events} onSelectDay={(d) => { setRefDate(d); setView("Jour"); }} />
          ) : (
            <EventList events={events} view={view} refDate={refDate} onSelect={setSelectedEventId} selectedId={selectedEventId} matchProspect={matchProspect} />
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

function EventList({ events, view, refDate, onSelect, selectedId, matchProspect }) {
  if (view === "Jour") {
    if (events.length === 0) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucun événement ce jour-là.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {events.map((e) => <EventCard key={e.id} event={e} prospect={matchProspect(e)} onClick={() => onSelect(e.id)} active={selectedId === e.id} />)}
      </div>
    );
  }

  const days = [];
  const start = startOfWeek(refDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {days.map((day) => {
        const dayEvents = events.filter((e) => new Date(e.start).toDateString() === day.toDateString());
        const isToday = day.toDateString() === new Date().toDateString();
        return (
          <div key={day.toDateString()}>
            <div className="display" style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px", color: isToday ? "var(--blue)" : "var(--text)" }}>
              {day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            {dayEvents.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: "12px", paddingLeft: "2px" }}>Aucun événement</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {dayEvents.map((e) => <EventCard key={e.id} event={e} prospect={matchProspect(e)} onClick={() => onSelect(e.id)} active={selectedId === e.id} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ event, prospect, onClick, active }) {
  return (
    <button className="focusable" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "12px", background: active ? "var(--blue-dim)" : "var(--panel)", border: active ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", textAlign: "left" }}>
      <div style={{ minWidth: "60px" }}>
        <div className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--blue)" }}>{formatTime(event.start)}</div>
        <div className="mono" style={{ fontSize: "10px", color: "var(--text-faint)" }}>{durationLabel(event.start, event.end)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="display" style={{ fontWeight: 600, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
          {prospect ? (
            <>
              <Avatar name={prospect.name} stage={prospect.stage} size={18} />
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{prospect.name} · {prospect.company}</span>
            </>
          ) : (event.location || event.meetingUrl) ? (
            <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{event.location || "Visio"}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MonthGrid({ refDate, events, onSelectDay }) {
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
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <button
              key={i}
              className="focusable"
              onClick={() => onSelectDay(d)}
              style={{ minHeight: "72px", background: isToday ? "var(--blue-dim)" : "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "6px", textAlign: "left", opacity: inMonth ? 1 : 0.4, display: "flex", flexDirection: "column", gap: "3px", overflow: "hidden" }}
            >
              <span className="mono" style={{ fontSize: "11px", color: isToday ? "var(--blue)" : "var(--text-dim)" }}>{d.getDate()}</span>
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
        <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>Aucun prospect associé — l'invité(e) de l'événement ne correspond à aucun email enregistré dans Piste.</div>
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
