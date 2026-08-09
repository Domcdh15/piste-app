import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  STATUS_META,
  STAGE_META,
  computeDealScore,
  computeHotProspects,
  computeAtRiskDeals,
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
  LinkedinIcon,
  ArrowLeftIcon,
  TableIcon,
  KanbanIcon,
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
  rdv_physique: "RDV physique",
  appel_visio: "Visio",
  message_linkedin: "Message LinkedIn",
  deal_gagne: "Deal gagné",
  deal_perdu: "Deal perdu",
  note: "Note",
  reassignation: "Réattribution",
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

const TAB_LABELS = { today: "Aujourd'hui", planning: "Agenda", assistant: "Assistant IA", activities: "Activités", integrations: "Intégrations", settings: "Paramètres", chauds: "Chauds", "a-sauver": "À sauver", equipe: "Équipe" };

export default function Pipeline({ prospects, loading, reload, session, initialSelectedId, onConsumeInitialSelection, initialShowForm, onConsumeInitialShowForm, initialTab, settings, returnTab, onBackToPrevious, team, presetFilter }) {
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
  const [quickFilter, setQuickFilter] = useState("tous");
  const [panelId, setPanelId] = useState(null);
  const [showOptimize, setShowOptimize] = useState(false);

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
  const presetIds =
    presetFilter === "chauds"
      ? new Set(computeHotProspects(prospects).map((p) => p.id))
      : presetFilter === "a-sauver"
      ? new Set(computeAtRiskDeals(prospects).map((x) => x.prospect.id))
      : null;
  const visibleProspects = prospects
    .filter((p) => !presetIds || presetIds.has(p.id))
    .filter((p) => stageFilter === "Toutes" || p.stage === stageFilter)
    .filter((p) => statusFilter === "Tous" || p.status === statusFilter)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));
  const now = new Date();
  const nextTaskByProspect = {};
  for (const t of openTasks) {
    if (!nextTaskByProspect[t.prospect_id]) nextTaskByProspect[t.prospect_id] = t;
  }
  const isAtRisk = (p) => !CLOSED_STAGES.includes(p.stage) && (!p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 7);
  const hasNoNextAction = (p) => !CLOSED_STAGES.includes(p.stage) && !nextTaskByProspect[p.id] && !p.next_contact_at;
  const openList = prospects.filter((p) => !CLOSED_STAGES.includes(p.stage));
  const atRiskCount = openList.filter(isAtRisk).length;
  const noActionCount = openList.filter(hasNoNextAction).length;
  const totalValue = openList.reduce((sum, p) => sum + (p.deal_value || 0), 0);

  const quickFiltered = visibleProspects.filter((p) => {
    if (quickFilter === "risque") return isAtRisk(p);
    if (quickFilter === "a_traiter") return isAtRisk(p) || hasNoNextAction(p);
    if (quickFilter === "semaine") {
      const t = nextTaskByProspect[p.id];
      const inWeek = (iso) => iso && (new Date(iso) - now) / 86400000 <= 7 && (new Date(iso) - now) / 86400000 >= -1;
      return inWeek(t?.due_at) || inWeek(p.next_contact_at);
    }
    if (quickFilter === "moi") return p.sales_owner_id === session.user.id || p.csm_owner_id === session.user.id;
    return true;
  });

  const combinedList = sortList(quickFiltered);
  const priorityLabel =
    presetFilter === "chauds" ? "PROSPECTS CHAUDS" : presetFilter === "a-sauver" ? "DEALS À SAUVER" : "FILE DE PRIORITÉ";

  if (selected) {
    return (
      <ProspectDetailPage
        prospect={selected}
        session={session}
        settings={settings}
        team={team}
        onBack={() => { setSelectedId(null); if (returnTab) onBackToPrevious?.(); }}
        backLabel={returnTab ? `Retour à ${TAB_LABELS[returnTab] || "la page précédente"}` : "Retour à la file de priorité"}
        onUpdate={(changes) => handleUpdateProspect(selected.id, changes)}
        onDelete={() => handleDeleteProspect(selected.id)}
        onLogActivity={(type, note) => logActivity(selected.id, type, note)}
        initialTab={initialTab}
        reload={reload}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "20px" }}>Opportunités</div>
          <div style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "2px" }}>
            {openList.length} opportunité{openList.length > 1 ? "s" : ""} · {formatEuros(totalValue)} de pipeline
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="focusable" onClick={() => setShowOptimize((s) => !s)} style={{ display: "flex", alignItems: "center", gap: "6px", background: showOptimize ? "var(--blue)" : "var(--blue-dim)", color: showOptimize ? "#fff" : "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>
            <SparklesIcon size={13} color={showOptimize ? "#fff" : "var(--blue)"} /> Optimiser mon pipeline
          </button>
          <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap" }}>
            {showForm ? "Annuler" : "+ Opportunité"}
          </button>
        </div>
      </div>

      {(atRiskCount > 0 || noActionCount > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", background: "var(--red-dim)", border: "0.5px solid var(--red)33", borderRadius: "8px", padding: "9px 14px", marginBottom: "14px" }}>
          <span style={{ fontSize: "12.5px", color: "var(--red)", fontWeight: 600 }}>⚠ {atRiskCount} deal{atRiskCount > 1 ? "s" : ""} à risque</span>
          {noActionCount > 0 && <span style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>{noActionCount} sans prochaine action</span>}
          <button className="focusable" onClick={() => setQuickFilter("a_traiter")} style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 600, color: "var(--red)", background: "none", border: "none", padding: 0 }}>
            Voir →
          </button>
        </div>
      )}

      {showOptimize && <OptimizePipelinePanel prospects={openList} session={session} onOpenProspect={setPanelId} onClose={() => setShowOptimize(false)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {QUICK_FILTERS.map((f) => (
            <button key={f.key} className="focusable" onClick={() => setQuickFilter(f.key)} style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, background: quickFilter === f.key ? "var(--blue)" : "var(--panel2)", color: quickFilter === f.key ? "#fff" : "var(--text-dim)", border: "none" }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
          <button className="focusable" onClick={() => setViewMode("kanban")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: viewMode === "kanban" ? "var(--bg)" : "transparent", color: viewMode === "kanban" ? "var(--blue)" : "var(--text-dim)", boxShadow: viewMode === "kanban" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
            <KanbanIcon size={13} color={viewMode === "kanban" ? "var(--blue)" : "var(--text-dim)"} /> Pipeline
          </button>
          <button className="focusable" onClick={() => setViewMode("table")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, background: viewMode === "table" ? "var(--bg)" : "transparent", color: viewMode === "table" ? "var(--blue)" : "var(--text-dim)", boxShadow: viewMode === "table" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
            <TableIcon size={13} color={viewMode === "table" ? "var(--blue)" : "var(--text-dim)"} /> Liste
          </button>
        </div>
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

      {panelId && (() => {
        const panelProspect = prospects.find((p) => p.id === panelId);
        return panelProspect ? (
          <ProspectSidePanel
            prospect={panelProspect}
            nextTask={nextTaskByProspect[panelProspect.id]}
            onClose={() => setPanelId(null)}
            onOpenFull={() => { setSelectedId(panelProspect.id); setPanelId(null); }}
          />
        ) : null;
      })()}

      {showForm && (
        <form onSubmit={handleAddProspect} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Chargement...</div>
      ) : prospects.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun prospect pour l'instant. Ajoute ton premier prospect ci-dessus.</div>
      ) : visibleProspects.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Aucun résultat pour cette recherche ou ces filtres.</div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard list={combinedList} tasks={openTasks} onOpenProspect={setPanelId} team={team} />
      ) : (
        <ProspectTable list={combinedList} onSelect={setPanelId} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} team={team} />
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

const QUICK_FILTERS = [
  { key: "a_traiter", label: "À traiter" },
  { key: "tous", label: "Tous" },
  { key: "risque", label: "À risque" },
  { key: "semaine", label: "Cette semaine" },
  { key: "moi", label: "Mes deals" },
];

function nextActionInfo(p, nextTask) {
  if (nextTask) {
    const overdue = nextTask.due_at && isOverdue(nextTask.due_at);
    const dueToday = nextTask.due_at && new Date(nextTask.due_at).toDateString() === new Date().toDateString();
    const label = nextTask.due_at
      ? overdue ? `${nextTask.note} · en retard` : dueToday ? `${nextTask.note} aujourd'hui` : `${nextTask.note} · ${formatShortDate(nextTask.due_at)}`
      : nextTask.note;
    return { dot: overdue ? "🔴" : dueToday ? "🟢" : "🟠", color: overdue ? "var(--red)" : dueToday ? "#0ea968" : "var(--amber)", text: label };
  }
  const days = p.last_contact_at ? Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000) : null;
  if (days === null) return { dot: "🔴", color: "var(--red)", text: "Aucune activité enregistrée" };
  if (days >= 10) return { dot: "🔴", color: "var(--red)", text: `Aucune activité depuis ${days} jours` };
  if (days >= 4) return { dot: "🟠", color: "var(--amber)", text: `Relancer depuis ${days} jours` };
  return { dot: "🟢", color: "#0ea968", text: "À jour" };
}

function ownerInitials(team, userId) {
  if (!userId || !team) return null;
  const m = (team.members || []).find((x) => x.user_id === userId);
  if (!m) return "?";
  if (m.first_name || m.last_name) return `${(m.first_name || "")[0] || ""}${(m.last_name || "")[0] || ""}`.toUpperCase() || "?";
  return (m.email || "?")[0].toUpperCase();
}

function OwnerBadges({ team, prospect, size = "sm" }) {
  if (!team) return null;
  const showSales = team.team?.has_multiple_sales;
  const showCsm = team.team?.has_multiple_csm;
  if (!showSales && !showCsm) return null;
  const dim = size === "sm" ? 18 : 22;
  const font = size === "sm" ? 9 : 10;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
      {showSales && (
        <span title={`Commercial : ${ownerInitials(team, prospect.sales_owner_id) ? "" : "non attribué"}`} style={{ width: dim, height: dim, borderRadius: "50%", background: "var(--blue-dim)", color: "var(--blue)", fontSize: font, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {ownerInitials(team, prospect.sales_owner_id) || "—"}
        </span>
      )}
      {showCsm && (
        <span title="CSM" style={{ width: dim, height: dim, borderRadius: "50%", background: "var(--gold-dim)", color: "var(--gold-deep)", fontSize: font, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {ownerInitials(team, prospect.csm_owner_id) || "—"}
        </span>
      )}
    </div>
  );
}

function KanbanBoard({ list, tasks, onOpenProspect, team }) {
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
          <div key={col.key} style={{ minWidth: "260px", width: "260px", display: "flex", flexDirection: "column", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", flexShrink: 0 }}>
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
                  <OpportunityCard key={p.id} prospect={p} nextTask={nextTaskByProspect[p.id]} onClick={() => onOpenProspect(p.id)} team={team} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityCard({ prospect: p, nextTask, onClick, team }) {
  const temp = prospectTemperature(p);
  const action = nextActionInfo(p, nextTask);
  const days = p.last_contact_at ? Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000) : null;

  return (
    <button
      onClick={onClick}
      className="focusable"
      style={{ textAlign: "left", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.company}{temp && <span style={{ marginLeft: "5px" }}>{temp.emoji}</span>}
        </div>
        <OwnerBadges team={team} prospect={p} />
      </div>

      <div style={{ color: "var(--text-dim)", fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>

      <div className="mono" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>{formatEuros(p.deal_value)}</div>

      <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
        {p.stage}{days !== null ? ` · il y a ${days} j` : ""}
      </div>

      <div style={{ fontSize: "11.5px", color: action.color, fontWeight: 600, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {action.dot} {action.text}
      </div>
    </button>
  );
}


function ProspectSidePanel({ prospect, nextTask, onClose, onOpenFull }) {
  const history = useProspectHistory(prospect.id);
  const temp = prospectTemperature(prospect);
  const action = nextActionInfo(prospect, nextTask);
  const recentActivities = history.activities.slice(0, 3);
  const recommendation = prospect.last_analysis?.recommendation || prospect.last_analysis?.next_action;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: "360px", maxWidth: "92vw", background: "var(--bg)", borderLeft: "0.5px solid var(--hairline)", boxShadow: "var(--shadow-md)", zIndex: 41, overflowY: "auto", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "16px" }}>{prospect.company}</div>
            <div style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>{prospect.name}</div>
          </div>
          <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "16px", padding: "2px" }}>✕</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
          {temp && <span style={{ fontSize: "11px", fontWeight: 700, color: temp.color, background: temp.bg, borderRadius: "999px", padding: "3px 9px" }}>{temp.emoji} {temp.label}</span>}
          <span className="mono" style={{ fontSize: "13px", fontWeight: 700 }}>{formatEuros(prospect.deal_value)}</span>
          <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>· {prospect.stage}</span>
        </div>

        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px", marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "6px" }}>PROCHAINE ACTION</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: action.color, marginBottom: nextTask ? "10px" : 0 }}>{action.dot} {action.text}</div>
          {nextTask && (
            <div style={{ display: "flex", gap: "6px" }}>
              {prospect.phone && (
                <a href={`tel:${prospect.phone}`} className="focusable" style={{ fontSize: "12px", fontWeight: 600, background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "6px", padding: "6px 12px", textDecoration: "none" }}>
                  Appeler
                </a>
              )}
              <button className="focusable" onClick={onOpenFull} style={{ fontSize: "12px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 12px" }}>
                Modifier
              </button>
            </div>
          )}
        </div>

        {recommendation && (
          <div style={{ background: "var(--blue-dim)", border: "0.5px solid #2563eb55", borderRadius: "10px", padding: "12px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, color: "var(--blue)", letterSpacing: "0.03em", marginBottom: "6px" }}>
              <SparklesIcon size={11} color="var(--blue)" /> RECOMMANDATION CLOSIA
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text)", lineHeight: 1.5 }}>{recommendation}</div>
          </div>
        )}

        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "8px" }}>DERNIÈRES ACTIVITÉS</div>
        {recentActivities.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-faint)", marginBottom: "16px" }}>Aucune activité enregistrée.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
            {recentActivities.map((a) => (
              <div key={a.id} style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                {ACTIVITY_LABEL[a.type] || a.type} · {formatShortDate(a.created_at)}
              </div>
            ))}
          </div>
        )}

        <button className="focusable" onClick={onOpenFull} style={{ width: "100%", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600 }}>
          Voir la fiche complète
        </button>
      </div>
    </>
  );
}

function OptimizePipelinePanel({ prospects, session, onOpenProspect, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function analyze() {
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const atRisk = prospects.filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 7);
      const summary = prospects
        .slice(0, 40)
        .map((p) => `- ${p.name} (${p.company}) · ${p.stage} · ${formatEuros(p.deal_value || 0)} · dernier contact ${p.last_contact_at ? `${Math.floor((now - new Date(p.last_contact_at)) / 86400000)}j` : "jamais"}`)
        .join("\n");
      const prompt = `Tu es un coach commercial. Analyse ce pipeline et réponds UNIQUEMENT en JSON valide, format :
{"at_risk_count": 0, "hot_count": 0, "cooling_count": 0, "proposal_value": 0, "priorities": [{"name": "...", "company": "...", "action": "..."}]}

"priorities" liste au maximum 3 deals prioritaires (nom du contact, entreprise, action recommandée courte), classés par urgence/valeur. "proposal_value" est la somme approximative en euros des deals actuellement en phase de proposition/négociation, en te basant sur les montants listés.

Pipeline (${prospects.length} opportunités ouvertes) :
${summary}

Opportunités sans activité depuis 7+ jours (${atRisk.length}) :
${atRisk.slice(0, 15).map((p) => `- ${p.name} (${p.company}), ${formatEuros(p.deal_value || 0)}`).join("\n") || "Aucune."}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'analyse a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span className="display" style={{ fontWeight: 700, fontSize: "13px" }}>Analyse de votre pipeline</span>
        <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px" }}>✕</button>
      </div>

      {!result && (
        <button className="focusable" onClick={analyze} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
          <SparklesIcon size={13} color="#fff" /> {loading ? "Analyse..." : "Lancer l'analyse"}
        </button>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "8px" }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
            <span style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>{prospects.length} deals actifs</span>
            <span style={{ fontSize: "12.5px", color: "var(--red)" }}>⚠ {result.at_risk_count} nécessitent une action</span>
            <span style={{ fontSize: "12.5px", color: "#0ea968" }}>🔥 {result.hot_count} fort potentiel</span>
            <span style={{ fontSize: "12.5px", color: "var(--blue)" }}>🧊 {result.cooling_count} refroidissent</span>
            <span style={{ fontSize: "12.5px", color: "var(--gold-deep)" }}>💰 {formatEuros(result.proposal_value || 0)} en proposition</span>
          </div>

          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.03em", marginBottom: "8px" }}>VOS PRIORITÉS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(result.priorities || []).map((pr, i) => {
              const match = prospects.find((p) => p.name === pr.name && p.company === pr.company) || prospects.find((p) => p.company === pr.company);
              return (
                <button key={i} className="focusable" onClick={() => match && onOpenProspect(match.id)} style={{ textAlign: "left", background: "var(--bg)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 12px", cursor: match ? "pointer" : "default" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{i + 1}. {pr.name} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {pr.company}</span></div>
                  <div style={{ fontSize: "12px", color: "var(--blue)", marginTop: "2px" }}>{pr.action}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
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

function ProspectTable({ list, onSelect, onSort, sortKey, sortDir, team }) {
  const showOwners = team && (team.team?.has_multiple_sales || team.team?.has_multiple_csm);
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", overflow: "hidden", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "0.5px solid var(--hairline)" }}>
            <SortHeader label="NOM" sortKeyName="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="ENTREPRISE" sortKeyName="company" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th style={th}>STATUT</th>
            <th style={th}>ÉTAPE</th>
            <th style={th}>PROCHAIN CONTACT</th>
            {showOwners && <th style={th}>RESPONSABLE</th>}
            <SortHeader label="MONTANT" sortKeyName="deal_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => <ProspectTableRow key={p.id} p={p} onClick={() => onSelect(p.id)} team={team} showOwners={showOwners} />)}
        </tbody>
      </table>
    </div>
  );
}

function ProspectTableRow({ p, onClick, team, showOwners }) {
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
      {showOwners && (
        <td style={td}>
          <OwnerBadges team={team} prospect={p} />
        </td>
      )}
      <td className="mono" style={{ ...td, color: "var(--blue)", textAlign: "right", whiteSpace: "nowrap" }}>{formatEuros(p.deal_value)}</td>
    </tr>
  );
}

function ProspectDetailPage({ prospect, session, settings, team, onBack, backLabel, onUpdate, onDelete, onLogActivity, initialTab, reload }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState(initialTab && initialTab !== "historique" ? initialTab : "email");
  const [dealValueInput, setDealValueInput] = useState(prospect.deal_value ?? 0);
  const [taskVersion, setTaskVersion] = useState(0);
  const toolsRef = useRef(null);

  useEffect(() => {
    setDealValueInput(prospect.deal_value ?? 0);
  }, [prospect.id, prospect.deal_value]);

  function goToTab(key) {
    setTab(key);
    toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function commitDealValue() {
    const n = Number(dealValueInput) || 0;
    if (n !== prospect.deal_value) onUpdate({ deal_value: n });
  }
  const history = useProspectHistory(prospect.id);
  const bumpTasks = () => setTaskVersion((v) => v + 1);

  async function handleStageChange(stage) {
    const changes = { stage };
    if (CLOSED_STAGES.includes(stage) && !CLOSED_STAGES.includes(prospect.stage)) {
      changes.closed_at = new Date().toISOString();
      await onLogActivity(stage === "Gagné" ? "deal_gagne" : "deal_perdu");
    }
    onUpdate(changes);
  }

  const temperature = prospectTemperature(prospect);

  return (
    <div style={{ padding: "24px 32px 60px", maxWidth: "1080px", margin: "0 auto" }}>
      <button className="focusable" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 0", marginBottom: "16px", color: "var(--text-dim)", fontSize: "13px" }}>
        <ArrowLeftIcon size={14} color="var(--text-dim)" /> {backLabel || "Retour à la file de priorité"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: "24px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <Avatar name={prospect.name} stage={prospect.stage} size={48} />
              <div style={{ minWidth: 0 }}>
                <div className="display" style={{ fontWeight: 700, fontSize: "17px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {prospect.civility && prospect.civility !== "-" ? `${prospect.civility} ` : ""}{prospect.name}
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: "12.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {prospect.job_title ? `${prospect.job_title} · ` : ""}{prospect.company}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
              {prospect.stage === "Gagné" && (
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#0ea968", background: "#e2f7ec", border: "0.5px solid #0ea96855", borderRadius: "6px", padding: "3px 7px" }}>
                  <TrophyIcon size={10} color="#0ea968" /> CLIENT
                </span>
              )}
              {temperature && (
                <span style={{ fontSize: "11px", fontWeight: 700, color: temperature.color, background: temperature.bg, borderRadius: "999px", padding: "3px 9px" }}>
                  {temperature.emoji} {temperature.label}
                </span>
              )}
              {prospect.deal_value > 0 && (
                <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--gold-deep)", background: "var(--gold-dim)", borderRadius: "999px", padding: "3px 9px" }}>
                  {formatEuros(prospect.deal_value)}
                </span>
              )}
            </div>

            <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
              Dernier contact : {prospect.last_contact_at ? formatShortDate(prospect.last_contact_at) : "jamais"}
            </div>

            <ProspectOwnersReadout team={team} prospect={prospect} />
          </div>

          <PipelineStepper stage={prospect.stage} onChange={handleStageChange} />

          {(prospect.email || prospect.phone || prospect.linkedin_url) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {prospect.email && (
                <a href={`mailto:${prospect.email}`} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--blue)", fontSize: "12.5px", textDecoration: "none", minWidth: 0 }}>
                  <MailIcon size={12} color="var(--blue)" /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prospect.email}</span>
                </a>
              )}
              {prospect.phone && (
                <a href={`tel:${prospect.phone}`} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--blue)", fontSize: "12.5px", textDecoration: "none" }}>
                  <PhoneIcon size={12} color="var(--blue)" /> {prospect.phone}
                </a>
              )}
              {prospect.linkedin_url && (
                <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--blue)", fontSize: "12.5px", textDecoration: "none" }}>
                  <LinkedinIcon size={12} color="var(--blue)" /> LinkedIn
                </a>
              )}
            </div>
          )}

          {team && (team.team?.has_multiple_sales || team.team?.has_multiple_csm) && (
            <ProspectOwnersPanel prospect={prospect} session={session} team={team} onAssigned={reload} />
          )}

          <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginTop: "4px" }}>ACTIONS RAPIDES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {prospect.phone && (
              <a href={`tel:${prospect.phone}`} className="focusable" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: "var(--text)", textDecoration: "none" }}>
                <PhoneIcon size={12} color="var(--blue)" /> Appeler
              </a>
            )}
            {prospect.email && (
              <a href={`mailto:${prospect.email}`} className="focusable" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: "var(--text)", textDecoration: "none" }}>
                <MailIcon size={12} color="var(--blue)" /> Envoyer un email
              </a>
            )}
            <button className="focusable" onClick={() => onUpdate({ last_contact_at: new Date().toISOString() })} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: "var(--text)" }}>
              <CheckIcon size={12} color="#0ea968" /> Marquer contacté aujourd'hui
            </button>
            <button className="focusable" onClick={() => goToTab("devis")} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: "var(--text)" }}>
              <MailIcon size={12} color="var(--gold-deep)" /> Générer un devis
            </button>
            <button className="focusable" onClick={() => setShowEdit((s) => !s)} style={{ display: "flex", alignItems: "center", gap: "8px", background: showEdit ? "var(--blue-dim)" : "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: showEdit ? "var(--blue)" : "var(--text)" }}>
              {showEdit ? "Fermer l'édition" : "Modifier la fiche"}
            </button>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <button className="focusable" onClick={onDelete} style={{ flex: 1, fontSize: "12px", padding: "8px", borderRadius: "8px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55" }}>Confirmer</button>
                <button className="focusable" onClick={() => setConfirmDelete(false)} style={{ flex: 1, fontSize: "12px", padding: "8px", borderRadius: "8px", background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>Annuler</button>
              </div>
            ) : (
              <button className="focusable" onClick={() => setConfirmDelete(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: "var(--text-faint)" }}>
                Supprimer la fiche
              </button>
            )}
          </div>

          {showEdit && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <EditProspectForm
                prospect={prospect}
                onSave={(changes) => onUpdate(changes)}
                onCancel={() => setShowEdit(false)}
              />
              <div>
                <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>STATUT</div>
                <select value={prospect.status} onChange={(e) => onUpdate({ status: e.target.value })} style={{ ...selectStyle, width: "100%" }}>
                  <option value="appeler">À appeler</option>
                  <option value="relancer">À relancer</option>
                  <option value="attente">En attente</option>
                  <option value="retard">En retard</option>
                </select>
              </div>
              <div>
                <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>PROCHAIN CONTACT</div>
                <input
                  type="date"
                  value={prospect.next_contact_at ? prospect.next_contact_at.slice(0, 10) : ""}
                  onChange={(e) => onUpdate({ next_contact_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  style={{ ...selectStyle, width: "100%", color: isOverdue(prospect.next_contact_at) ? "var(--red)" : "var(--text)" }}
                />
              </div>
              <div>
                <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>MONTANT DU DEAL (€)</div>
                <input
                  type="number"
                  min="0"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  onBlur={commitDealValue}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{ ...selectStyle, width: "100%" }}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <NextActionCard prospect={prospect} refreshKey={taskVersion} onOpenTab={goToTab} />

          <NoteAnalyzer prospect={prospect} history={history} session={session} onLogActivity={onLogActivity} onUpdate={onUpdate} settings={settings} onTaskCreated={bumpTasks} onOpenTab={goToTab} />

          <OpportunityAI prospect={prospect} history={history} session={session} onUpdate={onUpdate} />

          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "18px", marginBottom: "16px" }}>
            <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "12px" }}>ACTIVITÉ</div>
            <ActivityTimeline history={history} />
          </div>

          <div ref={toolsRef} style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "8px", scrollMarginTop: "20px" }}>OUTILS</div>
          <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
            {[["email", "Email"], ["script", "Script"], ["taches", "Tâches"], ["devis", "Devis"]].map(([key, label]) => (
              <button key={key} className="focusable" onClick={() => setTab(key)} style={{ flex: 1, padding: "7px 6px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, background: tab === key ? "var(--hairline)" : "transparent", color: tab === key ? "var(--text)" : "var(--text-dim)" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "18px" }}>
            {tab === "email" && <EmailGenerator prospect={prospect} history={history} session={session} settings={settings} />}
            {tab === "script" && <ScriptGenerator prospect={prospect} history={history} session={session} />}
            {tab === "taches" && <TasksTab prospect={prospect} session={session} settings={settings} onChange={bumpTasks} />}
            {tab === "devis" && <DevisGenerator prospect={prospect} history={history} session={session} settings={settings} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function prospectTemperature(p) {
  if (CLOSED_STAGES.includes(p.stage)) return null;
  const days = p.last_contact_at ? Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000) : null;
  if (days !== null && days <= 3 && computeDealScore(p) >= 70) return { emoji: "🔥", label: "Chaud", color: "#dc2626", bg: "#fbe7e7" };
  if (days === null || days >= 5) return { emoji: "❄️", label: "À relancer", color: "var(--blue)", bg: "var(--blue-dim)" };
  return null;
}

function PipelineStepper({ stage, onChange }) {
  const closed = CLOSED_STAGES.includes(stage);
  const currentIndex = OPEN_STAGES.indexOf(stage);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {!closed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {OPEN_STAGES.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, background: i <= currentIndex ? "var(--blue)" : "var(--hairline-strong, var(--hairline))" }} />
              <span style={{ fontSize: "11.5px", fontWeight: i === currentIndex ? 700 : 500, color: i === currentIndex ? "var(--blue)" : i < currentIndex ? "var(--text-dim)" : "var(--text-faint)" }}>
                {s}
              </span>
            </div>
          ))}
        </div>
      )}
      {closed && (
        <span style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: "12px", fontWeight: 700, color: stage === "Gagné" ? "#0ea968" : "var(--text-faint)", background: stage === "Gagné" ? "#e2f7ec" : "var(--panel2)", borderRadius: "999px", padding: "5px 12px" }}>
          {stage === "Gagné" ? "🏆 Gagné" : "Perdu"}
        </span>
      )}
      <select value={stage} onChange={(e) => onChange(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
        <optgroup label="En cours">
          {OPEN_STAGES.map((s) => <option key={s}>{s}</option>)}
        </optgroup>
        <optgroup label="Clôturé">
          {CLOSED_STAGES.map((s) => <option key={s}>{s}</option>)}
        </optgroup>
      </select>
    </div>
  );
}

function NextActionCard({ prospect, refreshKey, onOpenTab }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("prospect_id", prospect.id)
      .eq("done", false)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(1);
    setTask(data?.[0] || null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id, refreshKey]);

  async function markDone() {
    if (!task) return;
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
    load();
  }

  if (loading) return null;

  const meta = task ? (TASK_TYPE_META[task.type] || TASK_TYPE_META.appel_telephone) : null;
  const VERB = { appel_telephone: "Appeler", appel_visio: "Appel visio avec", rdv_physique: "RDV avec", relance_email: "Relancer" };

  return (
    <div style={{ background: "var(--gold-dim)", border: "0.5px solid var(--gold)55", borderRadius: "12px", padding: "18px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
        <span style={{ fontSize: "14px" }}>⚡</span>
        <span className="display" style={{ fontWeight: 700, fontSize: "11.5px", color: "var(--gold-deep)", letterSpacing: "0.04em" }}>PROCHAINE ACTION</span>
      </div>
      {task ? (
        <>
          <div className="display" style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "16px", marginBottom: "2px" }}>
            <meta.Icon size={15} color="var(--gold-deep)" /> {VERB[task.type] || meta.label} {prospect.name}
          </div>
          <div className="mono" style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: task.note ? "8px" : "14px", textTransform: "capitalize" }}>
            {formatDayTime(task.due_at)}
          </div>
          {task.note && <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "14px" }}>Objectif : {task.note}</div>}
          <div style={{ display: "flex", gap: "8px" }}>
            {prospect.phone && task.type !== "relance_email" ? (
              <a href={`tel:${prospect.phone}`} className="focusable" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--gold)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                Appeler
              </a>
            ) : (
              <button className="focusable" onClick={markDone} style={{ background: "var(--gold)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600 }}>
                Marquer fait
              </button>
            )}
            <button className="focusable" onClick={() => onOpenTab?.("taches")} style={{ background: "var(--panel)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 16px", fontSize: "13px" }}>
              Modifier
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "12px" }}>Aucune action planifiée pour ce prospect.</div>
          <button className="focusable" onClick={() => onOpenTab?.("taches")} style={{ background: "var(--gold)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600 }}>
            Planifier une action
          </button>
        </>
      )}
    </div>
  );
}

function formatDayTime(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

const ACTION_TYPES = [
  { key: "appel_abouti", label: "Appel abouti", Icon: PhoneIcon },
  { key: "appel_manque", label: "Appel manqué", Icon: XIcon },
  { key: "rdv_physique", label: "RDV physique", Icon: PinIcon },
  { key: "appel_visio", label: "Visio", Icon: VideoIcon },
  { key: "message_linkedin", label: "Message LinkedIn", Icon: LinkedinIcon },
];

const RDV_KEYWORDS = /\brdv\b|rendez-vous|rendez vous/i;
const EMAIL_KEYWORDS = /\bmails?\b|\be-?mails?\b|\bcourriels?\b/i;
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function mentionsRdv(actionType, text) {
  return actionType === "rdv_physique" || actionType === "appel_visio" || RDV_KEYWORDS.test(text);
}

function mentionsEmail(text) {
  return EMAIL_KEYWORDS.test(text);
}

function extractDateFromText(text) {
  const t = text.toLowerCase();
  const now = new Date();
  if (/\bapr[eè]s[\s-]?demain\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + 2); return d;
  }
  if (/\bdemain\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + 1); return d;
  }
  if (/\baujourd\W?hui\b/.test(t)) {
    return new Date(now);
  }
  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    if (new RegExp(`\\b${WEEKDAY_NAMES[i]}\\b`).test(t)) {
      const d = new Date(now);
      let diff = (i - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  const slash = t.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (slash) {
    const d = new Date(now.getFullYear(), parseInt(slash[2], 10) - 1, parseInt(slash[1], 10));
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const dayOfMonth = t.match(/\ble\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const day = parseInt(dayOfMonth[1], 10);
    if (day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), now.getMonth(), day);
      if (d < now) d.setMonth(d.getMonth() + 1);
      return d;
    }
  }
  return null;
}

function extractTimeFromText(text) {
  const m = text.match(/\b(\d{1,2})h(\d{2})?\b/) || text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, "0");
  const min = m[2] ? m[2].padStart(2, "0") : "00";
  return `${h}:${min}`;
}

function NoteAnalyzer({ prospect, history, session, onLogActivity, onUpdate, settings, onTaskCreated, onOpenTab }) {
  const [actionType, setActionType] = useState("appel_abouti");
  const [note, setNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [improving, setImproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [rdvSaving, setRdvSaving] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);

  async function saveNote() {
    if (saving) return;
    setSaving(true);
    setError("");
    const text = note.trim();
    try {
      await onLogActivity(actionType, text || undefined);
      onUpdate?.({ last_contact_at: new Date().toISOString() });
      const extractedDate = extractDateFromText(text);
      const extractedTime = extractTimeFromText(text);
      const dateStr = extractedDate ? extractedDate.toISOString().slice(0, 10) : "";
      const timeStr = extractedTime || settings?.default_task_time || "17:00";
      if (mentionsRdv(actionType, text)) {
        setSuggestion({
          kind: "rdv",
          type: actionType === "appel_visio" ? "appel_visio" : "rdv_physique",
          date: dateStr,
          time: timeStr,
        });
      } else if (mentionsEmail(text)) {
        setSuggestion({ kind: "email", date: dateStr, time: timeStr });
      } else if ((settings?.ai_initiative || "Équilibré") !== "Discret") {
        setSuggestion({ kind: "generic", date: dateStr, time: timeStr });
      }
      setNote("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      history.reload();
    } catch (e) {
      setError("L'enregistrement a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function createRdvTask() {
    if (!suggestion?.date || rdvSaving) return;
    setRdvSaving(true);
    const time = suggestion.time || settings?.default_task_time || "17:00";
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type: suggestion.type,
      note: `${TASK_TYPE_META[suggestion.type]?.label || "RDV"} avec ${prospect.name}`,
      due_at: new Date(`${suggestion.date}T${time}`).toISOString(),
    });
    setRdvSaving(false);
    setSuggestion(null);
    onTaskCreated?.();
  }

  async function createFollowUpTask() {
    if (followUpSaving) return;
    setFollowUpSaving(true);
    const time = suggestion?.time || settings?.default_task_time || "17:00";
    let dateStr = suggestion?.date;
    if (!dateStr) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      dateStr = d.toISOString().slice(0, 10);
    }
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type: "appel_telephone",
      note: `Relancer ${prospect.name} suite à la note du ${new Date().toLocaleDateString("fr-FR")}`,
      due_at: new Date(`${dateStr}T${time}`).toISOString(),
    });
    setFollowUpSaving(false);
    setSuggestion(null);
    onTaskCreated?.();
  }

  function openEmailTool() {
    setSuggestion(null);
    onOpenTab?.("email");
  }

  async function improveWithAI() {
    const text = note.trim();
    if (!text || improving) return;
    setImproving(true);
    setError("");
    try {
      const actionLabel = ACTION_TYPES.find((a) => a.key === actionType)?.label || "échange";
      const prompt = `Tu es un assistant commercial. Reformule cette note prise rapidement par un commercial après un(e) "${actionLabel}" avec un prospect, pour la rendre claire, structurée et professionnelle, en français. Garde exactement les mêmes informations, n'invente rien de nouveau. Réponds uniquement avec la note reformulée, sans préambule ni guillemets.

Note brute : "${text}"`;
      const improved = await callAI(prompt, session.access_token);
      setNote(improved.trim());
    } catch (e) {
      setError("L'amélioration a échoué. Réessaie.");
    } finally {
      setImproving(false);
    }
  }

  async function analyze() {
    const text = note.trim();
    if (!text || analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      await onLogActivity(actionType, text);
      onUpdate?.({ last_contact_at: new Date().toISOString() });
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
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'analyse a échoué. Réessaie.");
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

  const busy = saving || analyzing || improving;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "6px" }}>TYPE D'ACTION</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
        {ACTION_TYPES.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="focusable"
            onClick={() => setActionType(key)}
            style={{ display: "flex", alignItems: "center", gap: "5px", background: actionType === key ? "var(--blue-dim)" : "var(--panel2)", color: actionType === key ? "var(--blue)" : "var(--text-dim)", border: actionType === key ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)", borderRadius: "999px", padding: "6px 11px", fontSize: "12px" }}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Comment s'est passé l'appel, le RDV... ? Note ce qui compte, l'IA en tire les prochaines étapes."
        style={{ width: "100%", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.5, padding: "10px 12px", minHeight: "70px", resize: "vertical", fontFamily: "Inter, sans-serif", marginBottom: "8px", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          className="focusable"
          onClick={saveNote}
          disabled={busy}
          style={{ flex: 1, background: saved ? "#e2f7ec" : "var(--panel2)", color: saved ? "#0ea968" : "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "12.5px", opacity: busy ? 0.6 : 1 }}
        >
          {saving ? "Enregistrement..." : saved ? "Ajoutée ✓" : "Ajouter la note"}
        </button>
        <button
          className="focusable"
          onClick={improveWithAI}
          disabled={!note.trim() || busy}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--gold-dim)", color: "var(--gold-deep)", border: "0.5px solid var(--gold)55", borderRadius: "8px", padding: "9px", fontSize: "12.5px", opacity: !note.trim() || busy ? 0.6 : 1 }}
        >
          <SparklesIcon size={13} color="var(--gold-deep)" />
          {improving ? "Amélioration..." : "Améliorer avec l'IA"}
        </button>
        <button
          className="focusable"
          onClick={analyze}
          disabled={!note.trim() || busy}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "12.5px", opacity: !note.trim() || busy ? 0.6 : 1 }}
        >
          <SparklesIcon size={13} color="var(--blue)" />
          {analyzing ? "Analyse..." : "Analyser la note"}
        </button>
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "6px" }}>{error}</div>}

      {suggestion && (
        <Modal onClose={() => setSuggestion(null)}>
          {suggestion.kind === "rdv" && (
            <>
              <div className="display" style={{ fontWeight: 700, fontSize: "16px", marginBottom: "6px" }}>Un rendez-vous a été mentionné</div>
              <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Créer une tâche de suivi ?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                <select value={suggestion.type} onChange={(e) => setSuggestion((s) => ({ ...s, type: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>
                  {Object.entries(TASK_TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                </select>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={suggestion.date} onChange={(e) => setSuggestion((s) => ({ ...s, date: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                  <input type="time" value={suggestion.time} onChange={(e) => setSuggestion((s) => ({ ...s, time: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                </div>
                {suggestion.date && <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>Date détectée automatiquement dans la note — modifiable si besoin.</div>}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="focusable" onClick={createRdvTask} disabled={!suggestion.date || rdvSaving} style={{ flex: 1, background: "var(--gold)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: !suggestion.date || rdvSaving ? 0.6 : 1 }}>
                  {rdvSaving ? "Création..." : "Créer la tâche"}
                </button>
                <button className="focusable" onClick={() => setSuggestion(null)} style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 16px", fontSize: "13px" }}>
                  Ignorer
                </button>
              </div>
            </>
          )}

          {suggestion.kind === "email" && (
            <>
              <div className="display" style={{ fontWeight: 700, fontSize: "16px", marginBottom: "6px" }}>Un email a été mentionné</div>
              <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "18px" }}>Générer la relance maintenant, ou créer une tâche pour plus tard ?</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="focusable" onClick={openEmailTool} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600 }}>
                  <SparklesIcon size={13} color="#fff" /> Générer un email
                </button>
                <button className="focusable" onClick={createFollowUpTask} disabled={followUpSaving} style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", opacity: followUpSaving ? 0.6 : 1 }}>
                  {followUpSaving ? "Création..." : "Créer une tâche"}
                </button>
              </div>
              <button className="focusable" onClick={() => setSuggestion(null)} style={{ marginTop: "10px", background: "none", color: "var(--text-faint)", border: "none", fontSize: "12.5px", padding: 0 }}>
                Ignorer
              </button>
            </>
          )}

          {suggestion.kind === "generic" && (
            <>
              <div className="display" style={{ fontWeight: 700, fontSize: "16px", marginBottom: "6px" }}>Note enregistrée</div>
              <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "18px" }}>Prochaine étape ?</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="focusable" onClick={createFollowUpTask} disabled={followUpSaving} style={{ flex: 1, background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: followUpSaving ? 0.6 : 1 }}>
                  {followUpSaving ? "Création..." : "Créer une tâche de suivi"}
                </button>
                <button className="focusable" onClick={openEmailTool} style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" }}>
                  Générer un email
                </button>
              </div>
              <button className="focusable" onClick={() => setSuggestion(null)} style={{ marginTop: "10px", background: "none", color: "var(--text-faint)", border: "none", fontSize: "12.5px", padding: 0 }}>
                Ignorer
              </button>
            </>
          )}
        </Modal>
      )}

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

function ProspectOwnersReadout({ team, prospect }) {
  if (!team) return null;
  const memberLabel = (id) => {
    const m = (team.members || []).find((x) => x.user_id === id);
    if (!m) return null;
    return m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}`.trim() : m.email;
  };
  const salesLabel = memberLabel(prospect.sales_owner_id);
  const csmLabel = memberLabel(prospect.csm_owner_id);
  if (!salesLabel && !csmLabel) return null;
  return (
    <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
      {salesLabel && (
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--blue)", background: "var(--blue-dim)", borderRadius: "999px", padding: "3px 9px" }}>
          Commercial : {salesLabel}
        </span>
      )}
      {csmLabel && (
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--gold-deep)", background: "var(--gold-dim)", borderRadius: "999px", padding: "3px 9px" }}>
          CSM : {csmLabel}
        </span>
      )}
    </div>
  );
}

function ProspectOwnersPanel({ prospect, session, team, onAssigned }) {
  const [busy, setBusy] = useState(false);
  const isAdmin = team.role === "admin";
  const members = team.members || [];
  const salesMembers = members.filter((m) => m.role === "sales" || m.role === "admin");
  const csmMembers = members.filter((m) => m.role === "customer_success" || m.role === "admin");

  function memberLabel(m) {
    if (!m) return "";
    return m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}`.trim() : m.email;
  }

  async function assign(patch) {
    setBusy(true);
    try {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "assign_prospect", prospectId: prospect.id, ...patch }),
      });
      onAssigned?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
      {team.team?.has_multiple_sales && (
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>COMMERCIAL RESPONSABLE</div>
          {isAdmin ? (
            <select
              value={prospect.sales_owner_id || ""}
              disabled={busy}
              onChange={(e) => assign({ salesOwnerId: e.target.value || null })}
              style={selectStyle}
            >
              <option value="">— Non attribué —</option>
              {salesMembers.map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: "13px" }}>{memberLabel(members.find((m) => m.user_id === prospect.sales_owner_id)) || "Non attribué"}</div>
          )}
        </div>
      )}
      {team.team?.has_multiple_csm && (
        <div>
          <div style={{ color: "var(--text-faint)", fontSize: "10px", marginBottom: "3px" }}>CSM RESPONSABLE</div>
          {isAdmin ? (
            <select
              value={prospect.csm_owner_id || ""}
              disabled={busy}
              onChange={(e) => assign({ csmOwnerId: e.target.value || null })}
              style={selectStyle}
            >
              <option value="">— Non attribué —</option>
              {csmMembers.map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: "13px" }}>{memberLabel(members.find((m) => m.user_id === prospect.csm_owner_id)) || "Non attribué"}</div>
          )}
        </div>
      )}
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
  const [linkedinUrl, setLinkedinUrl] = useState(prospect.linkedin_url || "");
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
      linkedin_url: linkedinUrl.trim(),
      priority: Number(priority),
      deal_value: Number(dealValue) || 0,
    });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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
      <input type="url" placeholder="Profil LinkedIn (URL)" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} style={inputStyle} />
      <div />
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

function OpportunityAI({ prospect, history, session, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const data = prospect.last_analysis;

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un coach commercial. Analyse ce prospect à partir des échanges réels ci-dessous. Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :
{"needs": "besoin principal identifié en une phrase", "budget": "budget estimé ou fourchette si mentionné, sinon 'Non évoqué'", "recommendation": "recommandation d'action concrète en une phrase", "positive_signals": ["signal positif court", "..."], "watch_points": ["point de vigilance court", "..."]}

Limite positive_signals et watch_points à 4 éléments maximum chacun, puces courtes de 5 à 8 mots, en français.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}

${buildHistoryContext(history)}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      const readable = `Recommandation : ${parsed.recommendation}\n\nSignaux positifs :\n${(parsed.positive_signals || []).map((s) => `+ ${s}`).join("\n")}\n\nPoints de vigilance :\n${(parsed.watch_points || []).map((s) => `- ${s}`).join("\n")}`;
      await supabase.from("analyses_ia").insert({ user_id: session.user.id, prospect_id: prospect.id, type: "opportunite", content: readable });
      await onUpdate({ last_analysis: { ...parsed, analyzed_at: new Date().toISOString() } });
      history.reload();
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'analyse a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "11.5px", color: "var(--text-faint)", letterSpacing: "0.04em", marginBottom: "12px" }}>RÉSUMÉ IA</div>
        {data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <SummaryRow label="Besoin" value={data.needs} />
            <SummaryRow label="Budget" value={data.budget} />
            <SummaryRow label="Recommandation" value={data.recommendation} accent />
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Pas encore d'analyse.</div>
        )}
      </div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", boxShadow: "var(--shadow-sm)", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span className="display" style={{ fontWeight: 700, fontSize: "11.5px", color: "var(--text-faint)", letterSpacing: "0.04em" }}>ANALYSE DE L'OPPORTUNITÉ</span>
          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55" }}>
            <SparklesIcon size={11} color="var(--blue)" /> {loading ? "Analyse..." : data ? "Régénérer" : "Analyser"}
          </button>
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
        {data ? (
          <>
            <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#0ea968" }}>🟢 {(data.positive_signals || []).length} signaux positifs</span>
              <span style={{ fontSize: "12px", color: "var(--amber)" }}>🟠 {(data.watch_points || []).length} points de vigilance</span>
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text)", lineHeight: 1.6, marginBottom: "6px" }}>{data.recommendation}</div>
            <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>Analysé le {formatShortDate(data.analyzed_at)}</div>
          </>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Génère une analyse pour voir ce que Closia recommande.</div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", marginBottom: "2px" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: "13px", color: accent ? "var(--blue)" : "var(--text)", fontWeight: accent ? 600 : 400 }}>{value || "—"}</div>
    </div>
  );
}

const HISTORIQUE_FILTER_BY_TYPE = {
  appel_abouti: "Appels", appel_manque: "Appels",
  rdv_physique: "RDV & Visio", appel_visio: "RDV & Visio",
  message_linkedin: "LinkedIn",
  note: "Notes",
  deal_gagne: "Deals", deal_perdu: "Deals",
  reassignation: "Équipe",
};

const HISTORIQUE_FILTERS = ["Tous", "Appels", "RDV & Visio", "LinkedIn", "Notes", "Deals", "IA", "Équipe"];

const TIMELINE_EMOJI = {
  Appels: "📞", "RDV & Visio": "📅", LinkedIn: "💬", Notes: "📝", Deals: "🏆", IA: "✉️", Équipe: "👥",
};

function timelineDayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function ActivityTimeline({ history }) {
  const [filter, setFilter] = useState("Tous");
  if (history.loading) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>;

  const items = [
    ...history.emails.map((x) => ({ ...x, kind: x.type === "devis" ? "Devis" : "Email", filterKey: "IA" })),
    ...history.scripts.map((x) => ({ ...x, kind: `Script — ${x.section}`, filterKey: "IA" })),
    ...history.analyses.map((x) => ({ ...x, kind: x.type === "opportunite" ? "Analyse Closia" : "Analyse", filterKey: "IA" })),
    ...history.activities.map((x) => ({ ...x, kind: ACTIVITY_LABEL[x.type] || x.type, content: x.note || "", filterKey: HISTORIQUE_FILTER_BY_TYPE[x.type] || "Notes" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const visible = filter === "Tous" ? items : items.filter((i) => i.filterKey === filter);

  return (
    <div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
        {HISTORIQUE_FILTERS.map((f) => (
          <button
            key={f}
            className="focusable"
            onClick={() => setFilter(f)}
            style={{ padding: "5px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 500, background: filter === f ? "var(--blue-dim)" : "var(--panel2)", color: filter === f ? "var(--blue)" : "var(--text-dim)", border: filter === f ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)" }}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Rien pour ce filtre.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "420px", overflowY: "auto" }}>
          {visible.map((item) => (
            <div key={`${item.kind}-${item.id}`} title={item.content || item.kind} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 4px", borderBottom: "0.5px solid var(--hairline)" }}>
              <div style={{ width: "62px", flexShrink: 0, fontSize: "11px", color: "var(--text-faint)", paddingTop: "1px" }}>{timelineDayLabel(item.created_at)}</div>
              <div style={{ fontSize: "13px", flexShrink: 0 }}>{TIMELINE_EMOJI[item.filterKey] || "•"}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "var(--text)" }}>
                <span style={{ fontWeight: 600 }}>{item.kind}</span>
                {item.content && <span style={{ color: "var(--text-dim)" }}> · {item.content.length > 70 ? `${item.content.slice(0, 70)}…` : item.content}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TasksTab({ prospect, session, settings, onChange }) {
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
    onChange?.();
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
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  async function sendViaEmail() {
    if (!content || sending) return;
    setSending(true);
    setSendError("");
    setSent(false);
    try {
      const statusRes = await fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const status = await statusRes.json();
      const provider = status.google ? "google" : status.microsoft ? "microsoft" : null;
      if (!provider) {
        setSendError("Aucune boîte mail connectée — connecte Google ou Outlook dans Intégrations pour envoyer directement.");
        return;
      }
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "send_email", provider, to: prospect.email, subject: `${prospect.company} — suivi`, body: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'envoi a échoué.");
      await save();
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch (e) {
      setSendError(e.message || "L'envoi a échoué.");
    } finally {
      setSending(false);
    }
  }

  function useTemplate() {
    setContent(appendSignature(EMAIL_TEMPLATES[templateIndex].build(prospect), settings));
    setShowModal(false);
  }

  async function generateWithAI() {
    setLoading(true);
    setError("");
    try {
      const tone = (settings?.ai_default_tone || "Professionnel").toLowerCase();
      const lengthGuide = { Court: "3-4 phrases maximum", Équilibré: "5 à 6 phrases maximum", Détaillé: "8 à 10 phrases" }[settings?.ai_detail_level] || "5 à 6 phrases maximum";
      const prompt = `Tu es un assistant commercial. Rédige un email de relance en français, ton ${tone}, ${lengthGuide}. Ne mets pas d'objet, uniquement le corps de l'email, termine par une formule de politesse simple (ex : "Bonne journée,"), sans nom ni signature — la signature sera ajoutée automatiquement après. Appuie-toi sur les points forts identifiés dans l'historique pour renforcer l'argumentaire, et adresse discrètement les points faibles ou objections potentielles. Ne répète pas ce qui a déjà été dit dans les échanges précédents.
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
      setError(e.message || "La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("emails_generes").insert({ user_id: session.user.id, prospect_id: prospect.id, type: "relance", content });
    history.reload();
  }

  return (
    <>
      <GeneratorBlock
        label="Générer un email de relance"
        loading={false}
        error={error}
        content={content}
        setContent={setContent}
        onGenerate={() => setShowModal(true)}
        onSave={save}
        onSend={prospect.email ? sendViaEmail : undefined}
        sending={sending}
        sendError={sent ? "" : sendError}
      />
      {sent && <div style={{ color: "#0ea968", fontSize: "12px", marginTop: "-4px" }}>Email envoyé à {prospect.email}.</div>}

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

function DevisGenerator({ prospect, history, session, settings }) {
  const [items, setItems] = useState([{ description: "", qty: 1, unitPrice: prospect.deal_value || 0 }]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const total = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  }
  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generateWithAI() {
    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const lines = validItems.map((it) => `- ${it.description} — quantité : ${it.qty} — prix unitaire : ${formatEuros(it.unitPrice)} — sous-total : ${formatEuros((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}`).join("\n");
      const prompt = `Tu es un assistant commercial. Rédige un devis professionnel en français, prêt à être envoyé par email, pour ce client. Structure : une phrase d'introduction personnalisée, le détail des lignes du devis reprises telles quelles (description, quantité, prix unitaire, sous-total), le total général, une mention de validité de l'offre (30 jours), et une formule de politesse simple pour conclure — sans nom ni signature, elle sera ajoutée automatiquement. Ne mets pas d'objet d'email.

Client : ${prospect.name}${prospect.job_title ? `, ${prospect.job_title}` : ""}
Entreprise : ${prospect.company}

Lignes du devis :
${lines}

Total général : ${formatEuros(total)}`;
      const text = await callAI(prompt, session.access_token);
      setContent(appendSignature(text, settings));
    } catch (e) {
      setError(e.message || "La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("emails_generes").insert({ user_id: session.user.id, prospect_id: prospect.id, type: "devis", content });
    history.reload();
  }

  return (
    <div>
      <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "8px" }}>LIGNES DU DEVIS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input type="number" min="1" placeholder="Qté" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} style={{ ...inputStyle, width: "60px" }} />
            <input type="number" min="0" placeholder="Prix unitaire (€)" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} style={{ ...inputStyle, width: "120px" }} />
            <button className="focusable" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px", padding: "0 4px", opacity: items.length === 1 ? 0.3 : 1 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <button className="focusable" onClick={addItem} style={{ fontSize: "12px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
          + Ajouter une ligne
        </button>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Total : {formatEuros(total)}</div>
      </div>

      <GeneratorBlock label="Générer le devis avec l'IA" loading={loading} error={error} content={content} setContent={setContent} onGenerate={generateWithAI} onSave={save} />
    </div>
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
      setError(e.message || "La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("scripts_appel").insert({ user_id: session.user.id, prospect_id: prospect.id, section, content });
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

function GeneratorBlock({ label, loading, error, content, setContent, onGenerate, onSave, onSend, sending, sendError }) {
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
      {sendError && <div style={{ color: "var(--red)", fontSize: "12px" }}>{sendError}</div>}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Le contenu généré apparaîtra ici, modifiable avant utilisation..."
        style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.6, padding: "12px", minHeight: "160px", resize: "vertical", fontFamily: "Inter, sans-serif" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ color: "var(--text-faint)", fontSize: "11px" }}>Généré par Claude — à relire avant envoi</div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="focusable" onClick={handleCopy} disabled={!content} style={{ background: "transparent", color: content ? "var(--text)" : "var(--text-faint)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
            {copied ? "Copié" : "Copier"}
          </button>
          <button className="focusable" onClick={handleSave} disabled={!content} style={{ background: "transparent", color: content ? "var(--text)" : "var(--text-faint)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
          {onSend && (
            <button className="focusable" onClick={onSend} disabled={!content || sending} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, opacity: !content || sending ? 0.6 : 1 }}>
              {sending ? "Envoi..." : "Envoyer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
