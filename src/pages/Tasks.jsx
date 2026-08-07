import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PhoneIcon, MailIcon, VideoIcon, PinIcon, CheckIcon, ClockIcon, AlertIcon, formatShortDate, isOverdue, PRIORITY_LEVELS, inputStyle, PageTitle } from "../lib/ui.jsx";

const TYPE_META = {
  appel_telephone: { label: "Appel téléphonique", short: "Appel", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  appel_visio: { label: "Appel visio", short: "Visio", color: "#7c3aed", dim: "#f1e9fe", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", short: "RDV", color: "#0ea968", dim: "#e2f7ec", Icon: PinIcon },
  relance_email: { label: "Relance mail", short: "Email", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
};

const PRIORITY_COLORS = {
  25: { color: "var(--text-dim)", dim: "var(--panel2)" },
  50: { color: "var(--blue)", dim: "var(--blue-dim)" },
  75: { color: "var(--amber)", dim: "var(--amber-dim)" },
  100: { color: "var(--red)", dim: "var(--red-dim)" },
};

const DATE_FILTERS = [
  { key: "Toutes", label: "Toutes" },
  { key: "En retard", label: "En retard", color: "var(--red)" },
  { key: "Aujourd'hui", label: "Aujourd'hui", color: "var(--blue)" },
  { key: "Cette semaine", label: "Cette semaine", color: "var(--amber)" },
  { key: "Sans échéance", label: "Sans échéance", color: "var(--text-dim)" },
];

export default function Tasks({ prospects, session, settings, onOpenProspect }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [dateFilter, setDateFilter] = useState("Toutes");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ note: "", prospectId: "", type: "appel_telephone", dueDate: "", dueTime: "", priority: "50" });
  const [saving, setSaving] = useState(false);
  const [justDone, setJustDone] = useState(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false });
    setTasks(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addTask(e) {
    e.preventDefault();
    if (!form.note.trim() || !form.prospectId) return;
    setSaving(true);
    const time = form.dueTime || settings?.default_task_time || "17:00";
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: form.prospectId,
      type: form.type,
      note: form.note.trim(),
      due_at: form.dueDate ? new Date(`${form.dueDate}T${time}`).toISOString() : null,
      priority: Number(form.priority),
    });
    setForm({ note: "", prospectId: "", type: "appel_telephone", dueDate: "", dueTime: "", priority: "50" });
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleDone(t) {
    if (!t.done) {
      setJustDone(t.id);
      setTimeout(() => setJustDone(null), 500);
    }
    await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    load();
  }

  async function remove(id) {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  }

  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const startOfWeek = new Date(now);
  const dayIndex = (startOfWeek.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - dayIndex);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const typeFiltered = tasks.filter((t) => typeFilter === "Tous" || t.type === typeFilter);

  const dateCounts = {
    "En retard": typeFiltered.filter((t) => !t.done && t.due_at && new Date(t.due_at) < now).length,
    "Aujourd'hui": typeFiltered.filter((t) => !t.done && t.due_at && new Date(t.due_at) >= now && new Date(t.due_at) <= endOfDay).length,
    "Cette semaine": typeFiltered.filter((t) => !t.done && t.due_at && new Date(t.due_at) > endOfDay && new Date(t.due_at) < endOfWeek).length,
    "Sans échéance": typeFiltered.filter((t) => !t.done && !t.due_at).length,
  };

  const filtered = typeFiltered.filter((t) => {
    if (dateFilter === "Toutes") return true;
    if (!t.due_at) return dateFilter === "Sans échéance";
    const d = new Date(t.due_at);
    if (dateFilter === "En retard") return d < now && !t.done;
    if (dateFilter === "Aujourd'hui") return d <= endOfDay;
    if (dateFilter === "Cette semaine") return d < endOfWeek;
    return true;
  });

  const active = filtered.filter((t) => !t.done);
  const done = filtered.filter((t) => t.done);

  function bucketOf(t) {
    if (!t.due_at) return "plus_tard";
    const d = new Date(t.due_at);
    if (d < now) return "en_retard";
    if (d <= endOfDay) return "aujourdhui";
    if (d < endOfWeek) return "semaine";
    return "plus_tard";
  }

  const BUCKETS = [
    { key: "en_retard", label: "En retard", color: "var(--red)" },
    { key: "aujourdhui", label: "Aujourd'hui", color: "var(--blue)" },
    { key: "semaine", label: "Cette semaine", color: "var(--amber)" },
    { key: "plus_tard", label: "Plus tard / sans échéance", color: "var(--text-dim)" },
  ];

  const activeByBucket = BUCKETS.map((b) => ({ ...b, tasks: active.filter((t) => bucketOf(t) === b.key) })).filter((b) => b.tasks.length > 0);

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "12px" }}>
        <PageTitle icon={CheckIcon} color="#0ea5e9">Tâches</PageTitle>
        <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2a3ed655", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", fontWeight: 600 }}>
          {showForm ? "Annuler" : "+ Nouvelle tâche"}
        </button>
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "18px" }}>
        {active.length} tâche{active.length !== 1 ? "s" : ""} active{active.length !== 1 ? "s" : ""}
        {dateCounts["En retard"] > 0 && <span style={{ color: "var(--red)", fontWeight: 600 }}> · {dateCounts["En retard"]} en retard</span>}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        {DATE_FILTERS.map((f) => {
          const count = dateCounts[f.key];
          const activeState = dateFilter === f.key;
          return (
            <button
              key={f.key}
              className="focusable"
              onClick={() => setDateFilter(f.key)}
              style={{
                display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                background: activeState ? (f.color || "var(--text)") : "var(--panel)",
                color: activeState ? "#fff" : (f.color || "var(--text-dim)"),
                border: activeState ? "none" : "0.5px solid var(--hairline)",
              }}
            >
              {f.label}
              {count > 0 && (
                <span style={{ fontSize: "10px", fontWeight: 700, background: activeState ? "rgba(255,255,255,0.3)" : (f.color ? f.color + "22" : "var(--panel2)"), color: activeState ? "#fff" : f.color, borderRadius: "10px", padding: "1px 6px" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
        {["Tous", ...Object.keys(TYPE_META)].map((t) => {
          const activeState = typeFilter === t;
          const meta = TYPE_META[t];
          return (
            <button
              key={t}
              className="focusable"
              onClick={() => setTypeFilter(t)}
              style={{
                display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "16px", fontSize: "11px", fontWeight: 500,
                background: activeState ? (meta?.dim || "var(--hairline)") : "transparent",
                color: activeState ? (meta?.color || "var(--text)") : "var(--text-faint)",
                border: "0.5px solid " + (activeState ? (meta?.color || "var(--hairline)") + "55" : "var(--hairline)"),
              }}
            >
              {meta && <meta.Icon size={11} color={activeState ? meta.color : "var(--text-faint)"} />}
              {t === "Tous" ? "Tous les types" : meta.short}
            </button>
          );
        })}
      </div>

      {showForm && (
        <form onSubmit={addTask} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <input required placeholder="Titre" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          <select required value={form.prospectId} onChange={(e) => setForm({ ...form, prospectId: e.target.value })} style={inputStyle}>
            <option value="">Lié à un prospect...</option>
            {prospects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
            {Object.entries(TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} title={`Heure (défaut : ${settings?.default_task_time || "17:00"})`} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
            {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
          </select>
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2a3ed655", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600 }}>
            {saving ? "Enregistrement..." : "Créer la tâche"}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-faint)" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎉</div>
          <div style={{ fontSize: "13px" }}>Aucune tâche pour ces filtres.</div>
        </div>
      ) : (
        <div style={{ maxWidth: "760px" }}>
          {activeByBucket.map((bucket) => (
            <div key={bucket.key} style={{ marginBottom: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: bucket.color }} />
                <span className="display" style={{ fontWeight: 700, fontSize: "12px", color: bucket.color, letterSpacing: "0.02em" }}>{bucket.label.toUpperCase()}</span>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>({bucket.tasks.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {bucket.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} prospect={prospectById[t.prospect_id]} onToggle={() => toggleDone(t)} onRemove={() => remove(t.id)} onOpen={onOpenProspect} justDone={justDone === t.id} />
                ))}
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0ea968" }} />
                <span className="display" style={{ fontWeight: 700, fontSize: "12px", color: "#0ea968", letterSpacing: "0.02em" }}>TERMINÉES</span>
                <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>({done.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {done.map((t) => (
                  <TaskRow key={t.id} t={t} prospect={prospectById[t.prospect_id]} onToggle={() => toggleDone(t)} onRemove={() => remove(t.id)} onOpen={onOpenProspect} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, prospect, onToggle, onRemove, onOpen, justDone }) {
  const level = PRIORITY_LEVELS.find((l) => l.value === t.priority) || PRIORITY_LEVELS[1];
  const priorityColor = PRIORITY_COLORS[level.value] || PRIORITY_COLORS[50];
  const type = TYPE_META[t.type] || TYPE_META.appel_telephone;
  const overdue = !t.done && t.due_at && isOverdue(t.due_at);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "12px", background: "var(--panel)",
        border: "0.5px solid " + (overdue ? "var(--red)55" : "var(--hairline)"),
        borderLeft: `3px solid ${t.done ? "var(--hairline)" : priorityColor.color}`,
        borderRadius: "10px", padding: "12px", opacity: t.done ? 0.55 : 1,
        transform: justDone ? "scale(0.99)" : "scale(1)", transition: "opacity 0.2s, transform 0.2s",
      }}
    >
      <button className="focusable" onClick={onToggle} style={{ background: "none", border: "none", padding: 0, display: "flex", cursor: "pointer" }}>
        <span style={{ width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: t.done ? "#0ea96822" : "var(--panel2)", border: `1.5px solid ${t.done ? "#0ea968" : "var(--hairline-strong)"}` }}>
          {t.done && <CheckIcon size={12} color="#0ea968" />}
        </span>
      </button>

      <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: type.dim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <type.Icon size={12} color={type.color} />
      </span>

      {prospect ? (
        <button className="focusable" onClick={() => onOpen?.(prospect.id)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
          <div style={{ fontSize: "13px", fontWeight: 500, textDecoration: t.done ? "line-through" : "none", color: "var(--text)" }}>{t.note}</div>
          <div style={{ fontSize: "11px", color: "var(--blue)" }}>{prospect.name} · {prospect.company}</div>
        </button>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 500, textDecoration: t.done ? "line-through" : "none" }}>{t.note}</div>
        </div>
      )}

      <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: priorityColor.color, background: priorityColor.dim, borderRadius: "5px", padding: "3px 7px", whiteSpace: "nowrap" }}>
        {level.label}
      </span>

      {t.due_at && (
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: overdue ? "var(--red)" : "var(--text-faint)", fontWeight: overdue ? 700 : 400, whiteSpace: "nowrap" }}>
          {overdue ? <AlertIcon size={11} color="var(--red)" /> : <ClockIcon size={11} color="var(--text-faint)" />}
          <span className="mono">{formatShortDate(t.due_at)}</span>
        </span>
      )}

      <button className="focusable" onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px", padding: "0 2px" }}>✕</button>
    </div>
  );
}
