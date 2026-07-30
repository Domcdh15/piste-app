import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  STATUS_META,
  STAGE_META,
  computeDealScore,
  formatRelative,
  SCRIPT_SECTIONS,
  OPEN_STAGES,
  CLOSED_STAGES,
  formatEuros,
  formatDate,
  formatShortDate,
  isOverdue,
  callAI,
  parseJsonLoose,
  PRIORITY_LEVELS,
  EMAIL_TEMPLATES,
  SCRIPT_TEMPLATES,
  appendSignature,
  nearestPriorityLevel,
  Avatar,
  SparklesIcon,
  CalendarIcon,
  CheckIcon,
  XIcon,
  TrophyIcon,
  PhoneIcon,
  MailIcon,
  VideoIcon,
  PinIcon,
  ArrowLeftIcon,
  inputStyle,
  selectStyle,
} from "../lib/ui.jsx";

const TASK_TYPE_META = {
  appel_telephone: { label: "Appel téléphonique", color: "var(--amber)", Icon: PhoneIcon },
  appel_visio: { label: "Appel visio", color: "#7c3aed", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", color: "#0ea968", Icon: PinIcon },
  relance_email: { label: "Relance mail", color: "var(--blue)", Icon: MailIcon },
};

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

export default function Pipeline({ prospects, loading, reload, session, initialSelectedId, onConsumeInitialSelection, initialShowForm, onConsumeInitialShowForm, initialTab, settings }) {
  const [showForm, setShowForm] = useState(!!initialShowForm);
  const [form, setForm] = useState({ civility: "-", firstName: "", lastName: "", company: "", jobTitle: "", email: "", phone: "", stage: "À contacter", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [sortKey, setSortKey] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");
  const [openTasks, setOpenTasks] = useState([]);

  useEffect(() => {
    supabase.from("tasks").select("*").eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).then(({ data }) => setOpenTasks(data || []));
  }, []);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "company" ? "asc" : "desc");
    }
  }

  function sortList(list) {
    return [...list].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "name" || sortKey === "company") {
        av = (av || "").toLowerCase();
        bv = (bv || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = av || 0;
      bv = bv || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }

  useEffect(() => {
    if (initialSelectedId) onConsumeInitialSelection?.();
    if (initialShowForm) onConsumeInitialShowForm?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddProspect(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("prospects").insert({
      user_id: session.user.id,
      name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      civility: form.civility,
      company: form.company,
      job_title: form.jobTitle.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      stage: form.stage,
      status: form.status,
      priority: Number(form.priority),
      deal_value: Number(form.deal_value) || 0,
    });
    setSaving(false);
    if (!error) {
      setForm({ civility: "-", firstName: "", lastName: "", company: "", jobTitle: "", email: "", phone: "", stage: "À contacter", status: "attente", priority: 50, deal_value: "" });
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
  const q = search.trim().toLowerCase();
  const visibleProspects = prospects
    .filter((p) => stageFilter === "Toutes" || p.stage === stageFilter)
    .filter((p) => statusFilter === "Tous" || p.status === statusFilter)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));
  const combinedList = sortList(visibleProspects);

  if (selected) {
    return (
      <ProspectDetailPage
        prospect={selected}
        session={session}
        settings={settings}
        onBack={() => setSelectedId(null)}
        onUpdate={(changes) => handleUpdateProspect(selected.id, changes)}
        onDelete={() => handleDeleteProspect(selected.id)}
        onLogActivity={(type, note) => logActivity(selected.id, type, note)}
        initialTab={initialTab}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="display" style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.06em", color: "var(--text-dim)", whiteSpace: "nowrap" }}>FILE DE PRIORITÉ</div>
          <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
            <button className="focusable" onClick={() => setViewMode("table")} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: viewMode === "table" ? "var(--bg)" : "transparent", color: viewMode === "table" ? "var(--blue)" : "var(--text-dim)", boxShadow: viewMode === "table" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
              📋 Tableau
            </button>
            <button className="focusable" onClick={() => setViewMode("kanban")} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: viewMode === "kanban" ? "var(--bg)" : "transparent", color: viewMode === "kanban" ? "var(--blue)" : "var(--text-dim)", boxShadow: viewMode === "kanban" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
              💼 Kanban
            </button>
          </div>
        </div>
        <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", whiteSpace: "nowrap" }}>
          {showForm ? "Annuler" : "+ Ajouter un prospect"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          placeholder="Rechercher un nom ou une entreprise..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="Tous">Tous les statuts</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="Toutes">Toutes les étapes</option>
          <optgroup label="En cours">
            {OPEN_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </optgroup>
          <option value="Gagné">Client</option>
          <optgroup label="Clôturé">
            <option value="Perdu">Perdu</option>
          </optgroup>
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleAddProspect} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <select value={form.civility} onChange={(e) => setForm({ ...form, civility: e.target.value })} style={inputStyle}>
            <option value="-">Civilité —</option>
            <option value="Monsieur">Monsieur</option>
            <option value="Madame">Madame</option>
          </select>
          <div />
          <input required placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} />
          <input required placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} />
          <input required placeholder="Entreprise" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={inputStyle} />
          <input placeholder="Poste (ex : Directeur commercial)" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} style={inputStyle} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          <input type="tel" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} style={inputStyle}>
            {OPEN_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
            <option value="appeler">À appeler</option>
            <option value="relancer">À relancer</option>
            <option value="attente">En attente</option>
            <option value="retard">En retard</option>
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
            {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
          </select>
          <input type="number" min="0" placeholder="Valeur du deal (€)" value={form.deal_value} onChange={(e) => setForm({ ...form, deal_value: e.target.value })} style={inputStyle} />
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
            {saving ? "Enregistrement..." : "Enregistrer le prospect"}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Chargement...</div>
      ) : prospects.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun prospect pour l'instant. Ajoute ton premier prospect ci-dessus.</div>
      ) : visibleProspects.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun résultat pour cette recherche ou ces filtres.</div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard list={combinedList} tasks={openTasks} onOpenProspect={setSelectedId} />
      ) : (
        <ProspectTable list={combinedList} onSelect={setSelectedId} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      )}
    </div>
  );
}

const KANBAN_COLUMNS = [
  { key: "À contacter", label: "À contacter" },
  { key: "Contact établi", label: "Contact établi" },
  { key: "Rendez-vous prévu", label: "Rendez-vous prévu" },
  { key: "Proposition envoyée", label: "Proposition envoyée" },
  { key: "Négociation", label: "Négociation" },
  { key: "closed", label: "Gagné / Perdu" },
];

function KanbanBoard({ list, tasks, onOpenProspect }) {
  const nextTaskByProspect = {};
  for (const t of tasks) {
    if (!nextTaskByProspect[t.prospect_id]) nextTaskByProspect[t.prospect_id] = t;
  }

  return (
    <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "8px" }}>
      {KANBAN_COLUMNS.map((col) => {
        const items = list.filter((p) => (col.key === "closed" ? p.stage === "Gagné" || p.stage === "Perdu" : p.stage === col.key));
        const columnValue = items.reduce((sum, p) => sum + (p.deal_value || 0), 0);
        const accent = col.key === "closed" ? "#0ea968" : (STAGE_META[col.key]?.color || "var(--text-dim)");
        return (
          <div key={col.key} style={{ minWidth: "260px", width: "260px", display: "flex", flexDirection: "column", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", flexShrink: 0 }}>
            <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--hairline)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                <span className="display" style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.03em" }}>{col.label.toUpperCase()}</span>
                <span className="mono" style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: "11px" }}>{items.length}</span>
              </div>
              {columnValue > 0 && <div className="mono" style={{ color: "var(--text-faint)", fontSize: "11px" }}>{formatEuros(columnValue)}</div>}
            </div>

            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
              {items.length === 0 ? (
                <div style={{ color: "var(--text-faint)", fontSize: "11px", padding: "8px" }}>Vide</div>
              ) : (
                items.map((p) => (
                  <OpportunityCard key={p.id} prospect={p} nextTask={nextTaskByProspect[p.id]} onClick={() => onOpenProspect(p.id)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityCard({ prospect: p, nextTask, onClick }) {
  const score = computeDealScore(p);
  const scoreColor = score >= 70 ? "#0ea968" : score >= 40 ? "var(--amber)" : "var(--red)";

  return (
    <button
      onClick={onClick}
      className="focusable"
      style={{ textAlign: "left", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.company}</div>
        <span className="mono" style={{ background: "#e2f7ec", color: "#0ea968", borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "2px 8px", flexShrink: 0 }}>
          {formatEuros(p.deal_value)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-dim)", fontSize: "11px" }}>
        <Avatar name={p.name} stage={p.stage} size={18} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <KanbanRow label="Dernière activité" value={p.last_contact_at ? formatRelative(p.last_contact_at) : "Jamais"} />
        <KanbanRow
          label="Prochaine action"
          value={nextTask ? `${nextTask.note}${nextTask.due_at ? ` (${formatShortDate(nextTask.due_at)})` : ""}` : p.next_contact_at ? `Relance le ${formatShortDate(p.next_contact_at)}` : "Aucune prévue"}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "0.5px solid var(--hairline)", paddingTop: "8px" }}>
        <span className="mono" style={{ background: "var(--panel2)", color: scoreColor, borderRadius: "999px", fontSize: "11px", fontWeight: 700, padding: "2px 8px" }}>
          {score} %
        </span>
        <SparklesIcon size={12} color="var(--blue)" />
      </div>
    </button>
  );
}

function KanbanRow({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: "11px" }}>
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 12px", fontSize: "10px", letterSpacing: "0.04em", color: "var(--text-faint)", whiteSpace: "nowrap", fontWeight: 700 };

function SortHeader({ label, sortKeyName, sortKey, sortDir, onSort }) {
  const active = sortKey === sortKeyName;
  return (
    <th onClick={() => onSort(sortKeyName)} style={{ ...th, color: active ? "var(--blue)" : "var(--text-faint)", cursor: "pointer", userSelect: "none" }}>
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

function ProspectTable({ list, onSelect, onSort, sortKey, sortDir }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", overflow: "hidden", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "0.5px solid var(--hairline)" }}>
            <SortHeader label="NOM" sortKeyName="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="ENTREPRISE" sortKeyName="company" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th style={th}>STATUT</th>
            <th style={th}>ÉTAPE</th>
            <th style={th}>PROCHAIN CONTACT</th>
            <SortHeader label="MONTANT" sortKeyName="deal_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => <ProspectTableRow key={p.id} p={p} onClick={() => onSelect(p.id)} />)}
        </tbody>
      </table>
    </div>
  );
}

function ProspectTableRow({ p, onClick }) {
  const meta = STATUS_META[p.status] || STATUS_META.attente;
  const isClient = p.stage === "Gagné";
  const closed = p.stage === "Perdu";
  const td = { padding: "10px 12px", fontSize: "13px", verticalAlign: "middle" };
  return (
    <tr onClick={onClick} style={{ cursor: "pointer", borderBottom: "0.5px solid var(--hairline)", opacity: closed ? 0.6 : 1 }}>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Avatar name={p.name} stage={p.stage} size={26} />
          <span className="display" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{p.name}</span>
        </div>
      </td>
      <td style={{ ...td, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{p.company}</td>
      <td style={td}>
        {isClient ? (
          <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#0ea968", background: "#e2f7ec", border: "0.5px solid #0ea96855", borderRadius: "6px", padding: "4px 8px", whiteSpace: "nowrap" }}>
            <TrophyIcon size={11} color="#0ea968" /> CLIENT
          </span>
        ) : (
          <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "6px", padding: "4px 8px", whiteSpace: "nowrap" }}>
            <meta.Icon size={11} color={meta.color} /> {meta.label}
          </span>
        )}
      </td>
      <td style={{ ...td, color: "var(--text-dim)", fontSize: "12px", whiteSpace: "nowrap" }}>{p.stage}</td>
      <td style={td}>
        {p.next_contact_at ? (
          <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", color: isOverdue(p.next_contact_at) ? "var(--red)" : "var(--text-faint)", whiteSpace: "nowrap" }}>
            <CalendarIcon size={10} color={isOverdue(p.next_contact_at) ? "var(--red)" : "var(--text-faint)"} />
            {formatShortDate(p.next_contact_at)}
          </span>
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: "12px" }}>—</span>
        )}
      </td>
      <td className="mono" style={{ ...td, color: "var(--blue)", textAlign: "right", whiteSpace: "nowrap" }}>{formatEuros(p.deal_value)}</td>
    </tr>
  );
}

function ProspectDetailPage({ prospect, session, settings, onBack, onUpdate, onDelete, onLogActivity, initialTab }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState(initialTab || "email");
  const [logged, setLogged] = useState("");
  const [dealValueInput, setDealValueInput] = useState(prospect.deal_value ?? 0);

  useEffect(() => {
    setDealValueInput(prospect.deal_value ?? 0);
  }, [prospect.id, prospect.deal_value]);

  function commitDealValue() {
    const n = Number(dealValueInput) || 0;
    if (n !== prospect.deal_value) onUpdate({ deal_value: n });
  }
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
            <div className="display" style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "20px" }}>
              {prospect.civility && prospect.civility !== "-" ? `${prospect.civility} ` : ""}{prospect.name}
              {prospect.stage === "Gagné" && (
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#0ea968", background: "#e2f7ec", border: "0.5px solid #0ea96855", borderRadius: "6px", padding: "3px 7px" }}>
                  <TrophyIcon size={10} color="#0ea968" /> CLIENT
                </span>
              )}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>
              {prospect.job_title ? `${prospect.job_title} · ` : ""}{prospect.company}
            </div>
            {(prospect.email || prospect.phone) && (
              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                {prospect.email && (
                  <a href={`mailto:${prospect.email}`} style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--blue)", fontSize: "12px", textDecoration: "none" }}>
                    <MailIcon size={11} color="var(--blue)" /> {prospect.email}
                  </a>
                )}
                {prospect.phone && (
                  <a href={`tel:${prospect.phone}`} style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--blue)", fontSize: "12px", textDecoration: "none" }}>
                    <PhoneIcon size={11} color="var(--blue)" /> {prospect.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!confirmDelete && (
            <button className="focusable" onClick={() => setShowEdit((s) => !s)} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: showEdit ? "var(--blue-dim)" : "transparent", color: showEdit ? "var(--blue)" : "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
              {showEdit ? "Fermer" : "Modifier"}
            </button>
          )}
          {confirmDelete ? (
            <div style={{ display: "flex", gap: "6px" }}>
              <button className="focusable" onClick={onDelete} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55" }}>Confirmer</button>
              <button className="focusable" onClick={() => setConfirmDelete(false)} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>Annuler</button>
            </div>
          ) : (
            <button className="focusable" onClick={() => setConfirmDelete(true)} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: "transparent", color: "var(--text-faint)", border: "0.5px solid var(--hairline)" }}>Supprimer</button>
          )}
        </div>
      </div>

      {showEdit && (
        <EditProspectForm
          prospect={prospect}
          onSave={(changes) => { onUpdate(changes); setShowEdit(false); }}
          onCancel={() => setShowEdit(false)}
        />
      )}

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

      <div style={{ marginBottom: "14px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>MONTANT DU DEAL (€)</div>
        <input
          type="number"
          min="0"
          value={dealValueInput}
          onChange={(e) => setDealValueInput(e.target.value)}
          onBlur={commitDealValue}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          style={{ ...selectStyle, width: "160px" }}
        />
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
        {tab === "email" && <EmailGenerator prospect={prospect} history={history} session={session} settings={settings} />}
        {tab === "script" && <ScriptGenerator prospect={prospect} history={history} session={session} />}
        {tab === "analyse" && <AnalyseGenerator prospect={prospect} history={history} session={session} />}
        {tab === "taches" && <TasksTab prospect={prospect} session={session} settings={settings} />}
        {tab === "historique" && <Historique history={history} />}
      </div>
    </div>
  );
}

function NoteAnalyzer({ prospect, history, session, onLogActivity }) {
  const [note, setNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function saveNote() {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    setError("");
    try {
      await onLogActivity("note", text);
      setNote("");
      history.reload();
    } catch (e) {
      setError("L'enregistrement a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function analyze() {
    const text = note.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      await onLogActivity("note", text);
      const prompt = `Tu es un assistant commercial. Un commercial vient de noter comment s'est passé un échange (appel, RDV ou autre) avec ce prospect. Analyse cette note et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :
{"summary": "résumé en 1-2 phrases de ce qu'il faut faire ensuite", "pain_points": ["...", "..."], "opportunities": ["...", "..."], "suggested_tasks": [{"type": "appel_telephone", "note": "description courte", "due_in_days": 3}]}

Limite chaque tableau à 3 éléments maximum, en français. "type" doit être l'une de ces valeurs exactes : "appel_telephone", "appel_visio", "rdv_physique", "relance_email".

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
        type: TASK_TYPE_META[t.type] ? t.type : "appel_telephone",
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
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          className="focusable"
          onClick={saveNote}
          disabled={!note.trim() || saving || analyzing}
          style={{ flex: 1, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: !note.trim() || saving || analyzing ? 0.6 : 1 }}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          className="focusable"
          onClick={analyze}
          disabled={!note.trim() || analyzing || saving}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: !note.trim() || analyzing || saving ? 0.6 : 1 }}
        >
          <SparklesIcon size={14} color="var(--blue)" />
          {analyzing ? "Analyse en cours..." : "Analyser la note"}
        </button>
      </div>
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
                    {(() => { const meta = TASK_TYPE_META[t.type] || TASK_TYPE_META.appel_telephone; return <meta.Icon size={13} color={meta.color} />; })()}
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

function EditProspectForm({ prospect, onSave, onCancel }) {
  const nameParts = prospect.name.trim().split(/\s+/);
  const [civility, setCivility] = useState(prospect.civility || "-");
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" "));
  const [company, setCompany] = useState(prospect.company);
  const [jobTitle, setJobTitle] = useState(prospect.job_title || "");
  const [email, setEmail] = useState(prospect.email || "");
  const [phone, setPhone] = useState(prospect.phone || "");
  const [priority, setPriority] = useState(nearestPriorityLevel(prospect.priority));
  const [dealValue, setDealValue] = useState(prospect.deal_value);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      civility,
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      company,
      job_title: jobTitle.trim(),
      email: email.trim(),
      phone: phone.trim(),
      priority: Number(priority),
      deal_value: Number(dealValue) || 0,
    });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      <select value={civility} onChange={(e) => setCivility(e.target.value)} style={inputStyle}>
        <option value="-">Civilité —</option>
        <option value="Monsieur">Monsieur</option>
        <option value="Madame">Madame</option>
      </select>
      <div />
      <input required placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
      <input required placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
      <input required placeholder="Entreprise" value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
      <input placeholder="Poste (ex : Directeur commercial)" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={inputStyle} />
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      <input type="tel" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
        {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
      </select>
      <input type="number" min="0" placeholder="Valeur du deal (€)" value={dealValue} onChange={(e) => setDealValue(e.target.value)} style={inputStyle} />
      <div style={{ display: "flex", gap: "8px", gridColumn: "1 / -1" }}>
        <button type="submit" disabled={saving} className="focusable" style={{ flex: 1, background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
          {saving ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
        <button type="button" onClick={onCancel} className="focusable" style={{ background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 14px", fontSize: "13px" }}>
          Annuler
        </button>
      </div>
    </form>
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

function TasksTab({ prospect, session, settings }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("appel_telephone");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("50");
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
    const time = dueTime || settings?.default_task_time || "17:00";
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type,
      note: note.trim(),
      due_at: dueDate ? new Date(`${dueDate}T${time}`).toISOString() : null,
      priority: Number(priority),
    });
    setNote("");
    setDueDate("");
    setDueTime("");
    setPriority("50");
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
          {Object.entries(TASK_TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <input placeholder="Ex : relancer sur le budget" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: "160px" }} />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} title={`Heure (défaut : ${settings?.default_task_time || "17:00"})`} style={inputStyle} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
        </select>
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
          {tasks.map((t) => {
            const meta = TASK_TYPE_META[t.type] || TASK_TYPE_META.appel_telephone;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px", opacity: t.done ? 0.55 : 1 }}>
                <button className="focusable" onClick={() => toggleDone(t)} style={{ background: "none", border: "none", padding: 0, display: "flex" }}>
                  <CheckIcon size={18} color={t.done ? "#0ea968" : "var(--text-faint)"} />
                </button>
                <meta.Icon size={13} color={meta.color} />
                <div style={{ flex: 1, fontSize: "13px", textDecoration: t.done ? "line-through" : "none" }}>{t.note}</div>
                {t.due_at && (
                  <span className="mono" style={{ fontSize: "11px", color: !t.done && isOverdue(t.due_at) ? "var(--red)" : "var(--text-faint)" }}>
                    {formatShortDate(t.due_at)}
                  </span>
                )}
                <button className="focusable" onClick={() => removeTask(t.id)} style={{ background: "none", border: "none", padding: "2px", color: "var(--text-faint)", fontSize: "12px" }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmailGenerator({ prospect, history, session, settings }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [templateIndex, setTemplateIndex] = useState(0);

  function useTemplate() {
    setContent(appendSignature(EMAIL_TEMPLATES[templateIndex].build(prospect), settings));
    setShowModal(false);
  }

  async function generateWithAI() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige un email de relance court (5 à 6 phrases maximum), professionnel mais chaleureux, en français. Ne mets pas d'objet, uniquement le corps de l'email, termine par une formule de politesse simple (ex : "Bonne journée,"), sans nom ni signature — la signature sera ajoutée automatiquement après. Appuie-toi sur les points forts identifiés dans l'historique pour renforcer l'argumentaire, et adresse discrètement les points faibles ou objections potentielles. Ne répète pas ce qui a déjà été dit dans les échanges précédents.
${keywords.trim() ? `\nÉléments à intégrer absolument, donnés par le commercial : ${keywords.trim()}\n` : ""}
Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Historique des échanges avec ce prospect :
${buildHistoryContext(history)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(appendSignature(text, settings));
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
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>Bibliothèque de modèles</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              {EMAIL_TEMPLATES.map((t, i) => (
                <button key={t.label} className="focusable" onClick={() => setTemplateIndex(i)} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: templateIndex === i ? "var(--blue-dim)" : "var(--panel)", color: templateIndex === i ? "var(--blue)" : "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5, marginBottom: "10px" }}>{EMAIL_TEMPLATES[templateIndex].build(prospect)}</div>
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
      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "6px" }}>Modèles rapides</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
        {SCRIPT_TEMPLATES.map((t) => (
          <button key={t.label} className="focusable" onClick={() => setContent(t.build(prospect))} style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "6px" }}>Ou génère avec l'IA</div>
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
