import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PhoneIcon, MailIcon, CheckIcon, formatShortDate, isOverdue, PRIORITY_LEVELS, inputStyle } from "../lib/ui.jsx";

export default function Tasks({ prospects, session }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [dateFilter, setDateFilter] = useState("Toutes");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ note: "", prospectId: "", type: "appeler", dueAt: "", priority: "50" });
  const [saving, setSaving] = useState(false);

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
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: form.prospectId,
      type: form.type,
      note: form.note.trim(),
      due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      priority: Number(form.priority),
    });
    setForm({ note: "", prospectId: "", type: "appeler", dueAt: "", priority: "50" });
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleDone(t) {
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

  const filtered = tasks
    .filter((t) => typeFilter === "Tous" || t.type === typeFilter)
    .filter((t) => {
      if (dateFilter === "Toutes") return true;
      if (!t.due_at) return dateFilter === "Sans échéance";
      const d = new Date(t.due_at);
      if (dateFilter === "En retard") return d < now && !t.done;
      if (dateFilter === "Aujourd'hui") return d <= endOfDay;
      if (dateFilter === "Cette semaine") return d < endOfWeek;
      return true;
    });

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "20px" }}>✅ Tâches</div>
        <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "7px 12px", fontSize: "13px" }}>
          {showForm ? "Annuler" : "+ Nouvelle tâche"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="Toutes">Toutes les dates</option>
          <option value="En retard">En retard</option>
          <option value="Aujourd'hui">Aujourd'hui</option>
          <option value="Cette semaine">Cette semaine</option>
          <option value="Sans échéance">Sans échéance</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="Tous">Tous les types</option>
          <option value="appeler">Appel</option>
          <option value="email">Email</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={addTask} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <input required placeholder="Titre" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          <select required value={form.prospectId} onChange={(e) => setForm({ ...form, prospectId: e.target.value })} style={inputStyle}>
            <option value="">Lié à un prospect...</option>
            {prospects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
            <option value="appeler">Appel</option>
            <option value="email">Email</option>
          </select>
          <input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} style={inputStyle} />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
            {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
          </select>
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
            {saving ? "Enregistrement..." : "Créer la tâche"}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune tâche pour ces filtres.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "760px" }}>
          {filtered.map((t) => {
            const prospect = prospectById[t.prospect_id];
            const level = PRIORITY_LEVELS.find((l) => l.value === t.priority) || PRIORITY_LEVELS[1];
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", opacity: t.done ? 0.55 : 1 }}>
                <button className="focusable" onClick={() => toggleDone(t)} style={{ background: "none", border: "none", padding: 0, display: "flex" }}>
                  <CheckIcon size={18} color={t.done ? "#0ea968" : "var(--text-faint)"} />
                </button>
                {t.type === "email" ? <MailIcon size={13} color="var(--text-dim)" /> : <PhoneIcon size={13} color="var(--text-dim)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", textDecoration: t.done ? "line-through" : "none" }}>{t.note}</div>
                  {prospect && <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{prospect.name} · {prospect.company}</div>}
                </div>
                <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: level.value >= 75 ? "var(--red)" : "var(--text-dim)", background: "var(--panel2)", borderRadius: "5px", padding: "3px 6px" }}>
                  {level.label}
                </span>
                {t.due_at && (
                  <span className="mono" style={{ fontSize: "11px", color: !t.done && isOverdue(t.due_at) ? "var(--red)" : "var(--text-faint)" }}>
                    {formatShortDate(t.due_at)}
                  </span>
                )}
                <button className="focusable" onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "12px" }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
