import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  STATUS_META,
  SCRIPT_SECTIONS,
  OPEN_STAGES,
  CLOSED_STAGES,
  formatEuros,
  formatDate,
  formatShortDate,
  isOverdue,
  callAI,
  parseJsonLoose,
  Avatar,
  SparklesIcon,
  CalendarIcon,
  CheckIcon,
  XIcon,
  PhoneIcon,
  MailIcon,
  ArrowLeftIcon,
  inputStyle,
  selectStyle,
} from "../lib/ui.jsx";

const ACTIVITY_LABEL = {
  appel_abouti: "Appel abouti",
  appel_manque: "Appel manqué",
  deal_gagne: "Deal gagné",
  deal_perdu: "Deal perdu",
  note: "Note",
};

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

function useProspectHistory(prospectId) {
  const [history, setHistory] = useState({ emails: [], scripts: [], analyses: [], activities: [], loading: true });

  async function load() {
    setHistory((h) => ({ ...h, loading: true }));
    const [emails, scripts, analyses, activities] = await Promise.all([
      supabase.from("emails_generes").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
      supabase.from("scripts_appel").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
      supabase.from("analyses_ia").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
      supabase.from("activities").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
    ]);
    setHistory({
      emails: emails.data || [],
      scripts: scripts.data || [],
      analyses: analyses.data || [],
      activities: activities.data || [],
      loading: false,
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  return { ...history, reload: load };
}

// Condense les échanges passés en un texte exploitable par le prompt IA,
// pour que les générations s'appuient sur le vrai historique du prospect
// plutôt que sur son seul statut/étape actuels.
function buildHistoryContext(history) {
  const parts = [];

  const callsAbouti = history.activities.filter((a) => a.type === "appel_abouti").length;
  const callsManque = history.activities.filter((a) => a.type === "appel_manque").length;
  if (callsAbouti + callsManque > 0) {
    parts.push(`Appels précédents : ${callsAbouti} abouti(s), ${callsManque} manqué(s) sans réponse.`);
  }

  if (history.emails.length > 0) {
    parts.push(`Dernier email envoyé (${formatShortDate(history.emails[0].created_at)}) :\n"${truncate(history.emails[0].content, 400)}"`);
  }

  if (history.scripts.length > 0) {
    parts.push(`Dernier script d'appel préparé (${history.scripts[0].section}) :\n"${truncate(history.scripts[0].content, 300)}"`);
  }

  if (history.analyses.length > 0) {
    parts.push(`Dernière analyse du prospect (${formatShortDate(history.analyses[0].created_at)}) :\n${history.analyses[0].content}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "Aucun échange précédent enregistré — premier contact.";
}

export default function Pipeline({ prospects, loading, reload, session }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", stage: "Découverte", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  async function handleAddProspect(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("prospects").insert({
      user_id: session.user.id,
      name: form.name,
      company: form.company,
      stage: form.stage,
      status: form.status,
      priority: Number(form.priority),
      deal_value: Number(form.deal_value) || 0,
    });
    setSaving(false);
    if (!error) {
      setForm({ name: "", company: "", stage: "Découverte", status: "attente", priority: 50, deal_value: "" });
      setShowForm(false);
      reload();
    }
  }

  async function handleUpdateProspect(id, changes) {
    const { error } = await supabase.from("prospects").update(changes).eq("id", id);
    if (!error) reload();
  }

  async function handleDeleteProspect(id) {
    const { error } = await supabase.from("prospects").delete().eq("id", id);
    if (!error) {
      setSelectedId(null);
      reload();
    }
  }

  async function logActivity(prospectId, type, note) {
    await supabase.from("activities").insert({ user_id: session.user.id, prospect_id: prospectId, type, note, source: "manual" });
  }

  const selected = prospects.find((p) => p.id === selectedId);
  const closedCount = prospects.filter((p) => CLOSED_STAGES.includes(p.stage)).length;
  const q = search.trim().toLowerCase();
  const visibleProspects = prospects
    .filter((p) => showClosed || !CLOSED_STAGES.includes(p.stage))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));

  if (selected) {
    return (
      <ProspectDetailPage
        prospect={selected}
        session={session}
        onBack={() => setSelectedId(null)}
        onUpdate={(changes) => handleUpdateProspect(selected.id, changes)}
        onDelete={() => handleDeleteProspect(selected.id)}
        onLogActivity={(type, note) => logActivity(selected.id, type, note)}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.06em", color: "var(--text-dim)", whiteSpace: "nowrap" }}>FILE DE PRIORITÉ</div>
        <input
          placeholder="Rechercher un nom ou une entreprise..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, maxWidth: "320px" }}
        />
        <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>
          {showForm ? "Annuler" : "+ Ajouter un prospect"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddProspect} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <input required placeholder="Nom du contact" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input required placeholder="Entreprise" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={inputStyle} />
          <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} style={inputStyle}>
            {OPEN_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
            <option value="appeler">À appeler</option>
            <option value="relancer">À relancer</option>
            <option value="attente">En attente</option>
            <option value="retard">En retard</option>
          </select>
          <input type="number" min="0" max="100" placeholder="Priorité (0-100)" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle} />
          <input type="number" min="0" placeholder="Valeur du deal (€)" value={form.deal_value} onChange={(e) => setForm({ ...form, deal_value: e.target.value })} style={inputStyle} />
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
            {saving ? "Enregistrement..." : "Enregistrer le prospect"}
          </button>
        </form>
      )}

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "10px" }}>
        {loading ? (
          <div style={{ color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Chargement...</div>
        ) : prospects.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun prospect pour l'instant. Ajoute ton premier prospect ci-dessus.</div>
        ) : visibleProspects.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun résultat pour cette recherche.</div>
        ) : (
          visibleProspects.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.attente;
            const closed = CLOSED_STAGES.includes(p.stage);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="focusable"
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", width: "100%", textAlign: "left", background: "transparent", border: "0.5px solid transparent", borderRadius: "8px", opacity: closed ? 0.6 : 1 }}
              >
                <Avatar name={p.name} stage={p.stage} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="display" style={{ fontWeight: 500, fontSize: "14px" }}>{p.name}</div>
                  <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{p.company} · {p.stage}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", minWidth: "110px" }}>
                  <div className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "6px", padding: "4px 8px" }}>
                    <meta.Icon size={11} color={meta.color} />
                    {meta.label}
                  </div>
                  {p.next_contact_at && (
                    <div className="mono" style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: isOverdue(p.next_contact_at) ? "var(--red)" : "var(--text-faint)" }}>
                      <CalendarIcon size={10} color={isOverdue(p.next_contact_at) ? "var(--red)" : "var(--text-faint)"} />
                      {formatShortDate(p.next_contact_at)}
                    </div>
                  )}
                </div>
                <div className="mono" style={{ fontSize: "13px", color: "var(--blue)", width: "90px", textAlign: "right" }}>{formatEuros(p.deal_value)}</div>
              </button>
            );
          })
        )}
      </div>

      {closedCount > 0 && (
        <button
          className="focusable"
          onClick={() => setShowClosed((s) => !s)}
          style={{ background: "none", border: "none", padding: "10px 2px", color: "var(--text-faint)", fontSize: "12px" }}
        >
          {showClosed ? "Masquer les clôturés" : `${closedCount} prospect(s) clôturé(s) masqué(s) — Afficher`}
        </button>
      )}
    </div>
  );
}

function ProspectDetailPage({ prospect, session, onBack, onUpdate, onDelete, onLogActivity }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState("email");
  const [logged, setLogged] = useState("");
  const history = useProspectHistory(prospect.id);

  async function handleStageChange(stage) {
    const changes = { stage };
    if (CLOSED_STAGES.includes(stage) && !CLOSED_STAGES.includes(prospect.stage)) {
      changes.closed_at = new Date().toISOString();
      await onLogActivity(stage === "Gagné" ? "deal_gagne" : "deal_perdu");
    }
    onUpdate(changes);
  }

  async function handleCallLog(outcome) {
    await onLogActivity(outcome);
    onUpdate({ last_contact_at: new Date().toISOString() });
    setLogged(outcome);
    setTimeout(() => setLogged(""), 1500);
  }

  return (
    <div style={{ padding: "24px 32px 48px", maxWidth: "820px", margin: "0 auto" }}>
      <button className="focusable" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 0", marginBottom: "16px", color: "var(--text-dim)", fontSize: "13px" }}>
        <ArrowLeftIcon size={14} color="var(--text-dim)" /> Retour à la file de priorité
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Avatar name={prospect.name} stage={prospect.stage} size={52} />
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "20px" }}>{prospect.name}</div>
            <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{prospect.company}</div>
          </div>
        </div>
        {confirmDelete ? (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="focusable" onClick={onDelete} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55" }}>Confirmer</button>
            <button className="focusable" onClick={() => setConfirmDelete(false)} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>Annuler</button>
          </div>
        ) : (
          <button className="focusable" onClick={() => setConfirmDelete(true)} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "transparent", color: "var(--text-faint)", border: "0.5px solid var(--hairline)" }}>Supprimer</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>STATUT</div>
          <select value={prospect.status} onChange={(e) => onUpdate({ status: e.target.value })} style={{ ...selectStyle }}>
            <option value="appeler">À appeler</option>
            <option value="relancer">À relancer</option>
            <option value="attente">En attente</option>
            <option value="retard">En retard</option>
          </select>
        </div>
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>ÉTAPE</div>
          <select value={prospect.stage} onChange={(e) => handleStageChange(e.target.value)} style={{ ...selectStyle }}>
            <optgroup label="En cours">
              {OPEN_STAGES.map((s) => <option key={s}>{s}</option>)}
            </optgroup>
            <optgroup label="Clôturé">
              {CLOSED_STAGES.map((s) => <option key={s}>{s}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>DERNIER CONTACT</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: prospect.last_contact_at ? "var(--text)" : "var(--text-faint)" }}>
              {prospect.last_contact_at ? formatShortDate(prospect.last_contact_at) : "Jamais"}
            </span>
            <button
              className="focusable"
              onClick={() => onUpdate({ last_contact_at: new Date().toISOString() })}
              title="Marquer contacté aujourd'hui"
              style={{ fontSize: "10px", padding: "3px 7px", borderRadius: "5px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}
            >
              Aujourd'hui
            </button>
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>PROCHAIN CONTACT</div>
          <input
            type="date"
            value={prospect.next_contact_at ? prospect.next_contact_at.slice(0, 10) : ""}
            onChange={(e) => onUpdate({ next_contact_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            style={{ ...selectStyle, color: isOverdue(prospect.next_contact_at) ? "var(--red)" : "var(--text)" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        <button
          className="focusable"
          onClick={() => handleCallLog("appel_abouti")}
          style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "center", background: logged === "appel_abouti" ? "var(--blue-dim)" : "var(--panel2)", color: logged === "appel_abouti" ? "var(--blue)" : "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "12px" }}
        >
          <PhoneIcon size={13} /> {logged === "appel_abouti" ? "Appel enregistré" : "Appel abouti"}
        </button>
        <button
          className="focusable"
          onClick={() => handleCallLog("appel_manque")}
          style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "center", background: logged === "appel_manque" ? "var(--red-dim)" : "var(--panel2)", color: logged === "appel_manque" ? "var(--red)" : "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "12px" }}
        >
          <XIcon size={13} /> {logged === "appel_manque" ? "Enregistré" : "Appel manqué"}
        </button>
      </div>

      <NoteAnalyzer prospect={prospect} history={history} session={session} onLogActivity={onLogActivity} />

      <CoachingCard prospect={prospect} history={history} session={session} />

      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
        {[["email", "Email"], ["script", "Script"], ["analyse", "Analyse"], ["taches", "Tâches"], ["historique", "Historique"]].map(([key, label]) => (
          <button key={key} className="focusable" onClick={() => setTab(key)} style={{ flex: 1, padding: "7px 6px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, background: tab === key ? "var(--hairline)" : "transparent", color: tab === key ? "var(--text)" : "var(--text-dim)" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px" }}>
        {tab === "email" && <EmailGenerator prospect={prospect} history={history} session={session} />}
        {tab === "script" && <ScriptGenerator prospect={prospect} history={history} session={session} />}
        {tab === "analyse" && <AnalyseGenerator prospect={prospect} history={history} session={session} />}
        {tab === "taches" && <TasksTab prospect={prospect} session={session} />}
        {tab === "historique" && <Historique history={history} />}
      </div>
    </div>
  );
}

function NoteAnalyzer({ prospect, history, session, onLogActivity }) {
  const [note, setNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function analyze() {
    const text = note.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      await onLogActivity("note", text);
      const prompt = `Tu es un assistant commercial. Un commercial vient de noter comment s'est passé un échange (appel, RDV ou autre) avec ce prospect. Analyse cette note et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :
{"summary": "résumé en 1-2 phrases de ce qu'il faut faire ensuite", "pain_points": ["...", "..."], "opportunities": ["...", "..."], "suggested_tasks": [{"type": "appeler", "note": "description courte", "due_in_days": 3}]}

Limite chaque tableau à 3 éléments maximum, en français. "type" doit être "appeler" ou "email".

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}

Note de l'échange : "${text}"

Contexte des échanges précédents :
${buildHistoryContext(history)}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
      setSelected((parsed.suggested_tasks || []).map((_, i) => i));
      setShowModal(true);
      setNote("");
      history.reload();
    } catch (e) {
      setError("L'analyse a échoué. Réessaie.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function createTasks() {
    setCreating(true);
    const tasks = (result.suggested_tasks || []).filter((_, i) => selected.includes(i));
    for (const t of tasks) {
      const due = new Date();
      due.setDate(due.getDate() + (Number(t.due_in_days) || 3));
      await supabase.from("tasks").insert({
        user_id: session.user.id,
        prospect_id: prospect.id,
        type: t.type === "email" ? "email" : "appeler",
        note: t.note,
        due_at: due.toISOString(),
      });
    }
    setCreating(false);
    setShowModal(false);
    setResult(null);
  }

  function toggle(i) {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Comment s'est passé l'appel, le RDV... ? Note ce qui compte, l'IA en tire les prochaines étapes."
        style={{ width: "100%", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.5, padding: "10px 12px", minHeight: "70px", resize: "vertical", fontFamily: "Inter, sans-serif", marginBottom: "8px", boxSizing: "border-box" }}
      />
      <button
        className="focusable"
        onClick={analyze}
        disabled={!note.trim() || analyzing}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: !note.trim() || analyzing ? 0.6 : 1 }}
      >
        <SparklesIcon size={14} color="var(--blue)" />
        {analyzing ? "Analyse en cours..." : "Analyser la note"}
      </button>
      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "6px" }}>{error}</div>}

      {showModal && result && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="display" style={{ fontWeight: 700, fontSize: "16px", marginBottom: "12px" }}>Analyse de l'échange</div>

          <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "16px", lineHeight: 1.5 }}>{result.summary}</div>

          {result.pain_points?.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", color: "var(--red)", fontWeight: 700, marginBottom: "6px" }}>DOULEURS</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
                {result.pain_points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {result.opportunities?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "#0ea968", fontWeight: 700, marginBottom: "6px" }}>OPPORTUNITÉS</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
                {result.opportunities.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {result.suggested_tasks?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "8px" }}>TÂCHES SUGGÉRÉES — pour ne rien oublier</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {result.suggested_tasks.map((t, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 10px", fontSize: "12px", cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                    {t.type === "email" ? <MailIcon size={13} color="var(--text-dim)" /> : <PhoneIcon size={13} color="var(--text-dim)" />}
                    <span style={{ flex: 1 }}>{t.note}</span>
                    <span className="mono" style={{ color: "var(--text-faint)", fontSize: "11px" }}>dans {t.due_in_days || 3}j</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button className="focusable" onClick={() => setShowModal(false)} style={{ background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 14px", fontSize: "13px" }}>
              Ignorer
            </button>
            <button
              className="focusable"
              onClick={createTasks}
              disabled={creating || selected.length === 0}
              style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", opacity: creating || selected.length === 0 ? 0.6 : 1 }}
            >
              {creating ? "Création..." : `Créer ${selected.length} tâche${selected.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "14px", padding: "22px", maxWidth: "480px", width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(15,23,42,0.25)" }}>
        {children}
      </div>
    </div>
  );
}

function CoachingCard({ prospect, history, session }) {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const latest = history.analyses[0];

  async function regenerate() {
    setRegenerating(true);
    setError("");
    try {
      const prompt = `Tu es un coach commercial. Sur la base des échanges réels ci-dessous avec ce prospect, donne en français deux sections courtes : "Points forts" (ce qui fonctionne dans la relation ou l'approche actuelle) et "Points à améliorer" (ce qui freine la vente ou pourrait être mieux exploité), 2 à 3 puces courtes chacune. Termine par une ligne "Conseil : " avec une recommandation concrète et actionnable pour le prochain échange (appel ou email).

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}

${buildHistoryContext(history)}`;
      const text = await callAI(prompt, session.access_token);
      await supabase.from("analyses_ia").insert({ prospect_id: prospect.id, type: "points_forts_faibles", content: text });
      await history.reload();
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div style={{ background: "var(--blue-dim)", border: "0.5px solid #2563eb40", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <SparklesIcon size={13} color="var(--blue)" />
          <span className="display" style={{ fontWeight: 700, fontSize: "13px", color: "var(--blue)" }}>Points forts / points faibles</span>
        </div>
        <button className="focusable" onClick={regenerate} disabled={regenerating} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--panel)", color: "var(--blue)", border: "0.5px solid #2563eb40" }}>
          {regenerating ? "Analyse..." : latest ? "Régénérer" : "Générer"}
        </button>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "6px" }}>{error}</div>}

      {history.loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>Chargement de l'historique...</div>
      ) : latest ? (
        <>
          <div style={{ fontSize: "12px", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{latest.content}</div>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "8px" }}>Basé sur les échanges jusqu'au {formatShortDate(latest.created_at)}</div>
        </>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
          Pas encore d'analyse pour ce prospect — génère-la pour voir ce qui fonctionne et ce qui freine la vente, et pour que les emails générés s'en inspirent.
        </div>
      )}
    </div>
  );
}

function Historique({ history }) {
  if (history.loading) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>;

  const items = [
    ...history.emails.map((x) => ({ ...x, kind: "Email" })),
    ...history.scripts.map((x) => ({ ...x, kind: `Script — ${x.section}` })),
    ...history.analyses.map((x) => ({ ...x, kind: "Analyse" })),
    ...history.activities.map((x) => ({ ...x, kind: ACTIVITY_LABEL[x.type] || x.type, content: x.note || "" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (items.length === 0) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Rien d'enregistré pour ce prospect pour l'instant.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span className="mono" style={{ fontSize: "11px", color: "var(--blue)" }}>{item.kind}</span>
            <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatDate(item.created_at)}</span>
          </div>
          {item.content && <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{item.content}</div>}
        </div>
      ))}
    </div>
  );
}

function TasksTab({ prospect, session }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("appeler");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("prospect_id", prospect.id)
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false });
    setTasks(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id]);

  async function addTask(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type,
      note: note.trim(),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setNote("");
    setDueAt("");
    setSaving(false);
    load();
  }

  async function toggleDone(task) {
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    load();
  }

  async function removeTask(id) {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <form onSubmit={addTask} style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="appeler">Appeler</option>
          <option value="email">Emailer</option>
        </select>
        <input placeholder="Ex : relancer sur le budget" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: "160px" }} />
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
        <button type="submit" disabled={saving || !note.trim()} className="focusable" style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 14px", fontSize: "13px" }}>
          Ajouter
        </button>
      </form>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : tasks.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Aucune tâche pour ce prospect.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px", opacity: t.done ? 0.55 : 1 }}>
              <button className="focusable" onClick={() => toggleDone(t)} style={{ background: "none", border: "none", padding: 0, display: "flex" }}>
                <CheckIcon size={18} color={t.done ? "#0ea968" : "var(--text-faint)"} />
              </button>
              {t.type === "appeler" ? <PhoneIcon size={13} color="var(--text-dim)" /> : <MailIcon size={13} color="var(--text-dim)" />}
              <div style={{ flex: 1, fontSize: "13px", textDecoration: t.done ? "line-through" : "none" }}>{t.note}</div>
              {t.due_at && (
                <span className="mono" style={{ fontSize: "11px", color: !t.done && isOverdue(t.due_at) ? "var(--red)" : "var(--text-faint)" }}>
                  {formatShortDate(t.due_at)}
                </span>
              )}
              <button className="focusable" onClick={() => removeTask(t.id)} style={{ background: "none", border: "none", padding: "2px", color: "var(--text-faint)", fontSize: "12px" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailGenerator({ prospect, history, session }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [keywords, setKeywords] = useState("");

  function template() {
    const firstName = prospect.name.trim().split(/\s+/)[0];
    return `Bonjour ${firstName},\n\nJe me permets de revenir vers vous au sujet de ${prospect.company}. N'hésitez pas à me faire signe si vous avez des questions ou si vous souhaitez qu'on échange à ce sujet.\n\nBonne journée,\n— [Ton prénom]`;
  }

  function useTemplate() {
    setContent(template());
    setShowModal(false);
  }

  async function generateWithAI() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige un email de relance court (5 à 6 phrases maximum), professionnel mais chaleureux, en français. Ne mets pas d'objet, uniquement le corps de l'email, termine par "— [Ton prénom]". Appuie-toi sur les points forts identifiés dans l'historique pour renforcer l'argumentaire, et adresse discrètement les points faibles ou objections potentielles. Ne répète pas ce qui a déjà été dit dans les échanges précédents.
${keywords.trim() ? `\nÉléments à intégrer absolument, donnés par le commercial : ${keywords.trim()}\n` : ""}
Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Historique des échanges avec ce prospect :
${buildHistoryContext(history)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(text);
      setShowModal(false);
      setKeywords("");
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("emails_generes").insert({ prospect_id: prospect.id, type: "relance", content });
    history.reload();
  }

  return (
    <>
      <GeneratorBlock label="Générer un email de relance" loading={false} error={error} content={content} setContent={setContent} onGenerate={() => setShowModal(true)} onSave={save} />

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="display" style={{ fontWeight: 700, fontSize: "16px", marginBottom: "14px" }}>Nouvel email</div>

          <div style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>Modèle rapide</div>
            <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: "10px" }}>{template()}</div>
            <button className="focusable" onClick={useTemplate} style={{ width: "100%", background: "var(--panel)", color: "var(--text)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px", fontSize: "12px" }}>
              Utiliser ce modèle
            </button>
          </div>

          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>Ou personnalise avec l'IA</div>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Mots-clés (ex : insister sur le prix, mentionner la démo de mardi)"
            style={{ ...inputStyle, width: "100%", marginBottom: "10px", boxSizing: "border-box" }}
          />
          <button
            className="focusable"
            onClick={generateWithAI}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: loading ? 0.6 : 1 }}
          >
            <SparklesIcon size={13} color="var(--blue)" />
            {loading ? "Génération..." : "Générer avec l'IA"}
          </button>
          {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "8px" }}>{error}</div>}
        </Modal>
      )}
    </>
  );
}

function ScriptGenerator({ prospect, history, session }) {
  const [section, setSection] = useState(SCRIPT_SECTIONS[0]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige la section "${section}" d'un script d'appel de vente B2B, en français, sous forme de puces courtes et actionnables (pas de phrases longues), 3 à 5 puces maximum. Tiens compte de l'historique des échanges pour éviter de répéter ce qui a déjà été abordé.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Historique des échanges avec ce prospect :
${buildHistoryContext(history)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(text);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("scripts_appel").insert({ prospect_id: prospect.id, section, content });
    history.reload();
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
        {SCRIPT_SECTIONS.map((s) => (
          <button key={s} className="focusable" onClick={() => { setSection(s); setContent(""); }} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: section === s ? "var(--blue-dim)" : "var(--panel2)", color: section === s ? "var(--blue)" : "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
            {s}
          </button>
        ))}
      </div>
      <GeneratorBlock label={`Générer : ${section}`} loading={loading} error={error} content={content} setContent={setContent} onGenerate={generate} onSave={save} />
    </div>
  );
}

function AnalyseGenerator({ prospect, history, session }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Analyse ce prospect et donne, en français, deux sections claires : "Points positifs" (ce qui va dans le bon sens) et "Points à améliorer" (ce qui freine la vente), chacune en 2 à 3 puces courtes. Base ton analyse sur les échanges réels ci-dessous, pas seulement sur le statut actuel.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Historique des échanges avec ce prospect :
${buildHistoryContext(history)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(text);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("analyses_ia").insert({ prospect_id: prospect.id, type: "points_forts_faibles", content });
    history.reload();
  }

  return (
    <GeneratorBlock label="Analyser ce prospect" loading={loading} error={error} content={content} setContent={setContent} onGenerate={generate} onSave={save} />
  );
}

function GeneratorBlock({ label, loading, error, content, setContent, onGenerate, onSave }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    await onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <button className="focusable" onClick={onGenerate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "10px", fontSize: "13px", opacity: loading ? 0.7 : 1 }}>
        <SparklesIcon size={14} color="var(--blue)" />
        {loading ? "Génération en cours..." : label}
      </button>

      {error && <div style={{ color: "var(--red)", fontSize: "12px" }}>{error}</div>}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Le contenu généré apparaîtra ici, modifiable avant utilisation..."
        style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.6, padding: "12px", minHeight: "160px", resize: "vertical", fontFamily: "Inter, sans-serif" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "11px" }}>Généré par Claude — à relire avant envoi</div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="focusable" onClick={handleCopy} disabled={!content} style={{ background: "transparent", color: content ? "var(--text)" : "var(--text-faint)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
            {copied ? "Copié" : "Copier"}
          </button>
          <button className="focusable" onClick={handleSave} disabled={!content} style={{ background: "transparent", color: content ? "var(--text)" : "var(--text-faint)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
