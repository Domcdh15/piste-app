import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
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
  ListIcon,
  UsersIcon,
  inputStyle,
  selectStyle,
} from "../lib/ui.jsx";

const TASK_TYPE_META = {
  appel_telephone: { label: "Appel téléphonique", color: "var(--amber)", Icon: PhoneIcon },
  appel_visio: { label: "Appel visio", color: "#7c3aed", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", color: "#527a61", Icon: PinIcon },
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

// Excel en français enregistre les CSV avec des points-virgules, pas des virgules :
// on déduit le séparateur de la ligne d'en-têtes plutôt que de supposer la virgule.
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  const [best, count] = counts.sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ",";
}

function parseCSV(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore, \n gère déjà la fin de ligne
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const CSV_FIELDS = [
  { key: "", label: "Ignorer" },
  { key: "name", label: "Nom complet" },
  { key: "first_name", label: "Prénom" },
  { key: "last_name", label: "Nom de famille" },
  { key: "company", label: "Entreprise" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "job_title", label: "Poste" },
  { key: "deal_value", label: "Montant (€)" },
];

// Couvre les intitulés des exports HubSpot, Salesforce et Pipedrive en plus du français.
const CSV_AUTO_MAP = {
  name: ["nom", "name", "contact", "full name", "nom complet", "person", "contact name"],
  first_name: ["prénom", "prenom", "first name", "firstname", "given name"],
  last_name: ["nom de famille", "last name", "lastname", "surname", "family name"],
  company: ["entreprise", "company", "société", "societe", "company name", "organization", "organisation", "account name", "associated company"],
  email: ["email", "e-mail", "mail", "email address", "adresse email", "work email"],
  phone: ["téléphone", "telephone", "phone", "tel", "phone number", "mobile", "mobile phone number", "numéro de téléphone"],
  job_title: ["poste", "fonction", "job", "job title", "titre", "title", "jobtitle"],
  deal_value: ["montant", "valeur", "deal", "amount", "value", "deal value", "deal amount", "opportunity amount", "montant du deal"],
};

function guessCsvField(header) {
  const h = header.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(CSV_AUTO_MAP)) {
    if (aliases.includes(h)) return key;
  }
  return "";
}

function ImportCsvModal({ session, onClose, onImported }) {
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState(null);

  // Un .xlsx est une archive compressée : il faut une bibliothèque pour l'ouvrir.
  // Elle est chargée à la demande, pour ne pas alourdir le démarrage de l'application
  // des utilisateurs qui n'importent jamais de fichier.
  async function readSpreadsheet(file) {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false, defval: "" });
    return rows.map((r) => r.map((c) => (c == null ? "" : String(c)))).filter((r) => r.some((v) => v.trim() !== ""));
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setReading(true);
    setResult(null);
    try {
      const isSpreadsheet = /\.(xlsx|xlsm|xls)$/i.test(file.name);
      const rows = isSpreadsheet ? await readSpreadsheet(file) : parseCSV(await file.text());

      if (rows.length < 2) {
        setResult({ error: "Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données." });
        return;
      }

      const headers = rows[0].map((h) => (h || "").trim());
      const width = Math.max(...rows.map((r) => r.length));
      const dataRows = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
      const initialMapping = {};
      headers.forEach((h, i) => {
        initialMapping[i] = guessCsvField(h);
      });
      setParsed({ headers, dataRows });
      setMapping(initialMapping);
    } catch (err) {
      setResult({ error: "Le fichier n'a pas pu être lu. Vérifie qu'il s'agit bien d'un CSV ou d'un fichier Excel." });
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);

    // Les exports HubSpot et Salesforce séparent prénom et nom : on les recombine ici.
    const records = parsed.dataRows
      .map((r) => {
        const rec = { user_id: session.user.id, stage: "À contacter", status: "attente", priority: 50 };
        let firstName = "";
        let lastName = "";
        Object.entries(mapping).forEach(([idx, field]) => {
          if (!field) return;
          const val = (r[idx] || "").trim();
          if (field === "deal_value") rec.deal_value = Number(val.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
          else if (field === "first_name") firstName = val;
          else if (field === "last_name") lastName = val;
          else rec[field] = val;
        });
        if (!rec.name) rec.name = [firstName, lastName].filter(Boolean).join(" ").trim();
        if (!rec.name) rec.name = rec.company || rec.email || "Sans nom";
        return rec;
      })
      .filter((r) => r.name || r.email || r.company);

    // Un import relancé par erreur ne doit pas dupliquer les fiches déjà présentes.
    // On interroge uniquement les emails du fichier (par lots, pour ne pas produire
    // une URL trop longue) plutôt que de charger tout le pipeline : une liste de plus
    // de 1000 prospects serait tronquée par la limite de lignes de Supabase.
    const emails = [...new Set(records.map((r) => (r.email || "").toLowerCase()).filter(Boolean))];
    const known = new Set();
    for (let i = 0; i < emails.length; i += 150) {
      const { data: existing } = await supabase.from("prospects").select("email").in("email", emails.slice(i, i + 150));
      (existing || []).forEach((p) => p.email && known.add(p.email.toLowerCase()));
    }

    let skipped = 0;
    const toInsert = records.filter((r) => {
      const e = (r.email || "").toLowerCase();
      if (e && known.has(e)) {
        skipped++;
        return false;
      }
      return true;
    });

    if (toInsert.length === 0) {
      setImporting(false);
      setResult({ ok: true, count: 0, skipped });
      return;
    }

    // Insertion par lots : un fichier de plusieurs milliers de lignes en une seule
    // requête dépasserait les limites de taille de la requête.
    let inserted = 0;
    let failed = false;
    for (let i = 0; i < toInsert.length; i += 250) {
      const { error } = await supabase.from("prospects").insert(toInsert.slice(i, i + 250));
      if (error) {
        failed = true;
        break;
      }
      inserted += toInsert.slice(i, i + 250).length;
    }

    setImporting(false);
    if (failed && inserted === 0) {
      setResult({ error: "L'import a échoué. Vérifie le fichier et réessaie." });
    } else if (failed) {
      setResult({ error: `Import interrompu après ${inserted} prospect${inserted > 1 ? "s" : ""}. Réimporte le fichier — les fiches déjà créées seront ignorées.` });
      onImported?.();
    } else {
      setResult({ ok: true, count: inserted, skipped });
      onImported?.();
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,23,31,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--panel)", borderRadius: "14px", padding: "28px", width: "580px", maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px" }}>Importer des prospects</div>
        <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginBottom: "16px" }}>
          Importe directement ton fichier Excel, ou un CSV exporté depuis ton CRM actuel.
        </div>

        {!parsed ? (
          <>
            <input type="file" accept=".csv,.xlsx,.xlsm,.xls" onChange={handleFile} disabled={reading} />
            {reading && <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "10px" }}>Lecture du fichier…</div>}
            {result?.error && <div style={{ fontSize: "12.5px", color: "var(--red)", marginTop: "10px" }}>{result.error}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>
              {parsed.dataRows.length} lignes détectées. Vérifie la correspondance des colonnes :
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {parsed.headers.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "12.5px", color: "var(--text)", fontWeight: 500 }}>{h || `Colonne ${i + 1}`}</div>
                  <select value={mapping[i] || ""} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))} style={selectStyle}>
                    {CSV_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {result?.ok ? (
              <div style={{ fontSize: "13px", color: "#527a61", marginBottom: "12px" }}>
                {result.count} prospect{result.count > 1 ? "s" : ""} importé{result.count > 1 ? "s" : ""} ✓
                {result.skipped > 0 && (
                  <span style={{ color: "var(--text-dim)" }}> · {result.skipped} déjà présent{result.skipped > 1 ? "s" : ""}, ignoré{result.skipped > 1 ? "s" : ""}</span>
                )}
              </div>
            ) : result?.error ? (
              <div style={{ fontSize: "13px", color: "var(--red)", marginBottom: "12px" }}>{result.error}</div>
            ) : null}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="focusable"
                onClick={handleImport}
                disabled={importing}
                style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", opacity: importing ? 0.6 : 1 }}
              >
                {importing ? "Import..." : `Importer ${parsed.dataRows.length} prospects`}
              </button>
              <button
                className="focusable"
                onClick={onClose}
                style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 16px", fontSize: "13px" }}
              >
                {result?.ok ? "Fermer" : "Annuler"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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

export default function Pipeline({ prospects, loading, reload, session, initialSelectedId, onConsumeInitialSelection, initialShowForm, onConsumeInitialShowForm, initialShowImport, onConsumeInitialShowImport, initialTab, settings, returnTab, onBackToPrevious, team, presetFilter }) {
  const [showForm, setShowForm] = useState(!!initialShowForm);
  const [form, setForm] = useState({ civility: "-", firstName: "", lastName: "", company: "", jobTitle: "", email: "", phone: "", stage: "À contacter", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  const [search, setSearch] = useState("");
  const [openTasks, setOpenTasks] = useState([]);
  const [quickFilter, setQuickFilter] = useState("toutes");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [panelId, setPanelId] = useState(null);
  const [showOptimize, setShowOptimize] = useState(false);
  const [showImport, setShowImport] = useState(!!initialShowImport);

  useEffect(() => {
    supabase.from("tasks").select("*").eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).then(({ data }) => setOpenTasks(data || []));
  }, []);

  useEffect(() => {
    if (initialSelectedId) onConsumeInitialSelection?.();
    if (initialShowForm) onConsumeInitialShowForm?.();
    if (initialShowImport) onConsumeInitialShowImport?.();
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
    if (quickFilter === "prioritaires") return (p.priority || 0) >= 75;
    if (quickFilter === "relancer") return isAtRisk(p);
    if (quickFilter === "clients") return p.stage === "Gagné";
    return true;
  });

  function toggleSort(field) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir(field === "priority" ? "desc" : "asc");
      return;
    }
    const firstDir = field === "priority" ? "desc" : "asc";
    if (sortDir === firstDir) setSortDir(firstDir === "asc" ? "desc" : "asc");
    else setSortField(null);
  }

  const sortComparator = buildSortComparator(sortField, sortDir, nextTaskByProspect);
  const stageGroups = groupByStage(quickFiltered, sortComparator);
  const priorityLabel =
    presetFilter === "chauds" ? "Prospects chauds" : presetFilter === "a-sauver" ? "Deals à sauver" : "Opportunités";

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

  const showOwners = team && (team.team?.has_multiple_sales || team.team?.has_multiple_csm);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <div style={{ padding: "32px 40px 0" }}>
        <div className="hero-card" style={{ padding: "26px 38px" }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span className="h2" style={{ color: "#fff" }}>{priorityLabel}</span>
                <span className="mono" style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)" }}>{openList.length}</span>
              </div>
              <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                <button className="focusable" onClick={() => setShowOptimize((s) => !s)} style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", color: "#fff", opacity: showOptimize ? 1 : 0.85, fontSize: "12.5px", fontWeight: 500, padding: 0 }}>
                  <SparklesIcon size={12} color="#fff" /> Optimiser
                </button>
                <button className="focusable" onClick={() => setShowImport(true)} style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.32)", borderRadius: "9px", color: "#fff", fontSize: "12.5px", fontWeight: 600, padding: "8px 14px" }}>
                  Importer
                </button>
                <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "#fff", border: "none", borderRadius: "9px", color: "var(--blue-deep)", fontSize: "12.5px", fontWeight: 700, padding: "8px 16px", boxShadow: "0 4px 14px rgba(10,20,50,0.18)" }}>
                  {showForm ? "Annuler" : "+ Opportunité"}
                </button>
              </div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12.5px", marginTop: "8px" }}>{formatEuros(totalValue)} de pipeline</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "22px 40px 64px", maxWidth: "980px" }}>
      {(atRiskCount > 0 || noActionCount > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", padding: "10px 2px", borderTop: "0.5px solid var(--hairline)", borderBottom: "0.5px solid var(--hairline)", marginBottom: "20px", fontSize: "12.5px" }}>
          <span style={{ color: "var(--red)" }}>{atRiskCount} deal{atRiskCount > 1 ? "s" : ""} à risque</span>
          {noActionCount > 0 && <span style={{ color: "var(--text-dim)" }}>{noActionCount} sans prochaine action</span>}
          <button className="focusable" onClick={() => setQuickFilter("relancer")} style={{ marginLeft: "auto", fontWeight: 500, color: "var(--blue)", background: "none", border: "none", padding: 0, fontSize: "12.5px" }}>
            Voir →
          </button>
        </div>
      )}

      {showOptimize && <OptimizePipelinePanel prospects={openList} session={session} onOpenProspect={setPanelId} onClose={() => setShowOptimize(false)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key}
              className="focusable"
              onClick={() => setQuickFilter(f.key)}
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-pill)",
                fontSize: "12.5px",
                fontWeight: 500,
                background: quickFilter === f.key ? "var(--blue-dim)" : "transparent",
                color: quickFilter === f.key ? "var(--blue)" : "var(--text-dim)",
                border: quickFilter === f.key ? "none" : "0.5px solid var(--hairline)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: "220px" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "11.5px", color: "var(--text-faint)", fontWeight: 500 }}>Trier par</span>
        <SortToggleButton label="Priorité" active={sortField === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
        <SortToggleButton label="Prochaine action" active={sortField === "nextAction"} dir={sortDir} onClick={() => toggleSort("nextAction")} />
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
        <form onSubmit={handleAddProspect} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600 }}>
            {saving ? "Enregistrement..." : "Enregistrer le prospect"}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: "var(--text-dim)", padding: "20px 2px", fontSize: "13px" }}>Chargement...</div>
      ) : prospects.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: "20px 2px", fontSize: "13px" }}>Rien à traiter pour le moment.<br /><span style={{ color: "var(--text-faint)" }}>Votre premier prospect apparaîtra ici.</span></div>
      ) : quickFiltered.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: "20px 2px", fontSize: "13px" }}>Aucun résultat pour cette recherche ou ce filtre.</div>
      ) : (
        <OpportunityList groups={stageGroups} nextTaskByProspect={nextTaskByProspect} onOpen={setPanelId} team={team} showOwners={showOwners} sortField={sortField} />
      )}
      </div>
      {showImport && <ImportCsvModal session={session} onClose={() => setShowImport(false)} onImported={reload} />}
    </div>
  );
}

const STAGE_GROUP_ORDER = [...OPEN_STAGES, "Gagné", "Perdu"];
const STAGE_GROUP_LABEL = { "Gagné": "Clients" };

function groupByStage(list, comparator) {
  return STAGE_GROUP_ORDER.map((stage) => ({
    stage,
    label: (STAGE_GROUP_LABEL[stage] || stage).toUpperCase(),
    items: list.filter((p) => p.stage === stage).sort(comparator),
  })).filter((g) => g.items.length > 0);
}

const DEFAULT_SORT = (a, b) => (b.priority || 0) - (a.priority || 0) || (b.deal_value || 0) - (a.deal_value || 0);

function buildSortComparator(field, dir, nextTaskByProspect) {
  if (!field) return DEFAULT_SORT;
  const mult = dir === "asc" ? 1 : -1;
  if (field === "priority") {
    return (a, b) => mult * ((a.priority || 0) - (b.priority || 0)) || DEFAULT_SORT(a, b);
  }
  if (field === "nextAction") {
    return (a, b) => {
      const da = nextTaskByProspect[a.id]?.due_at ? new Date(nextTaskByProspect[a.id].due_at).getTime() : Infinity;
      const db = nextTaskByProspect[b.id]?.due_at ? new Date(nextTaskByProspect[b.id].due_at).getTime() : Infinity;
      return mult * (da - db) || DEFAULT_SORT(a, b);
    };
  }
  return DEFAULT_SORT;
}

const QUICK_FILTERS = [
  { key: "toutes", label: "Toutes" },
  { key: "prioritaires", label: "Prioritaires" },
  { key: "relancer", label: "À relancer" },
  { key: "clients", label: "Clients" },
];

function SortToggleButton({ label, active, dir, onClick }) {
  return (
    <button
      className="focusable"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        background: active ? "var(--blue-dim)" : "transparent",
        color: active ? "var(--blue)" : "var(--text-dim)",
        border: active ? "none" : "0.5px solid var(--hairline)",
        borderRadius: "var(--radius-pill)",
        padding: "4px 10px",
        fontSize: "12px",
        fontWeight: 500,
      }}
    >
      {label}
      <span style={{ fontSize: "9px", opacity: active ? 1 : 0.5 }}>{active && dir === "asc" ? "▲" : "▼"}</span>
    </button>
  );
}

function OpportunityList({ groups, nextTaskByProspect, onOpen, team, showOwners, sortField }) {
  return (
    <div>
      {groups.map((g) => (
        <div key={g.stage} style={{ marginBottom: "26px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "0 4px 7px", borderBottom: "0.5px solid var(--hairline)", marginBottom: "1px" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-faint)" }}>{g.label}</span>
            <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)" }}>{g.items.length}</span>
          </div>
          {g.items.map((p) => (
            <OpportunityRow
              key={p.id}
              p={p}
              nextTask={nextTaskByProspect[p.id]}
              onClick={() => onOpen(p.id)}
              team={team}
              showOwners={showOwners}
              sortField={sortField}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function priorityColor(priority) {
  const v = priority || 50;
  if (v >= 100) return "var(--red)";
  if (v >= 75) return "var(--amber)";
  if (v >= 50) return "var(--blue)";
  return "var(--text-faint)";
}

function OpportunityRow({ p, nextTask, onClick, team, showOwners, sortField }) {
  const priorityInfo = PRIORITY_LEVELS.find((l) => l.value === (p.priority || 50)) || PRIORITY_LEVELS[1];
  const showNextAction = sortField === "nextAction";
  const info = showNextAction ? nextActionInfo(p, nextTask) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="focusable row-hover"
      style={{
        display: "grid",
        gridTemplateColumns: showOwners ? "14px minmax(0,1.3fr) minmax(0,1fr) 92px 150px 44px" : "14px minmax(0,1.3fr) minmax(0,1fr) 92px 150px",
        alignItems: "center",
        gap: "12px",
        padding: "9px 4px",
        borderBottom: "0.5px solid var(--hairline)",
        cursor: "pointer",
        opacity: p.stage === "Perdu" ? 0.5 : 1,
        borderRadius: "6px",
      }}
    >
      <span title={`Priorité : ${priorityInfo.label}`} style={{ width: "8px", height: "8px", borderRadius: "50%", background: priorityColor(p.priority), justifySelf: "center" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.company}</div>
        {showNextAction && info && (
          <div style={{ fontSize: "11px", color: info.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>{info.text}</div>
        )}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      <span className="mono" style={{ fontSize: "13px", color: "var(--text)", textAlign: "right" }}>{formatEuros(p.deal_value)}</span>
      <span style={{ fontSize: "12.5px", color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.stage === "Gagné" ? "Client" : p.stage}</span>
      {showOwners && <OwnerBadges team={team} prospect={p} />}
    </div>
  );
}

function nextActionInfo(p, nextTask) {
  if (nextTask) {
    const overdue = nextTask.due_at && isOverdue(nextTask.due_at);
    const dueToday = nextTask.due_at && new Date(nextTask.due_at).toDateString() === new Date().toDateString();
    const label = nextTask.due_at
      ? overdue ? `${nextTask.note} · en retard` : dueToday ? `${nextTask.note} aujourd'hui` : `${nextTask.note} · ${formatShortDate(nextTask.due_at)}`
      : nextTask.note;
    return { dot: overdue ? "🔴" : dueToday ? "🟢" : "🟠", color: overdue ? "var(--red)" : dueToday ? "#527a61" : "var(--amber)", text: label };
  }
  const days = p.last_contact_at ? Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000) : null;
  if (days === null) return { dot: "🔴", color: "var(--red)", text: "Aucune activité enregistrée" };
  if (days >= 10) return { dot: "🔴", color: "var(--red)", text: `Aucune activité depuis ${days} jours` };
  if (days >= 4) return { dot: "🟠", color: "var(--amber)", text: `Relancer depuis ${days} jours` };
  return { dot: "🟢", color: "#527a61", text: "À jour" };
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

function ProspectSidePanel({ prospect, nextTask, onClose, onOpenFull }) {
  const history = useProspectHistory(prospect.id);
  const action = nextActionInfo(prospect, nextTask);
  const recentActivities = history.activities.slice(0, 3);
  const recommendation = prospect.last_analysis?.recommendation || prospect.last_analysis?.next_action;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.55)", backdropFilter: "blur(4px)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: "400px", maxWidth: "92vw", background: "var(--panel)", borderLeft: "0.5px solid var(--hairline)", boxShadow: "var(--shadow-md)", zIndex: 41, overflowY: "auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div className="display" style={{ fontWeight: 600, fontSize: "16px" }}>{prospect.company}</div>
            <div style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "1px" }}>{prospect.name}</div>
          </div>
          <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "16px", padding: "2px" }}>✕</button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
          <span className="mono" style={{ fontSize: "17px", fontWeight: 600 }}>{formatEuros(prospect.deal_value)}</span>
          <span style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>{prospect.stage === "Gagné" ? "Client" : prospect.stage}</span>
        </div>

        <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "20px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginBottom: "6px" }}>PROCHAINE ACTION</div>
          <div style={{ fontSize: "13.5px", fontWeight: 500, color: action.color, marginBottom: nextTask ? "12px" : 0 }}>{action.text}</div>
          {nextTask && (
            <div style={{ display: "flex", gap: "16px" }}>
              {prospect.phone && (
                <a href={`tel:${prospect.phone}`} className="focusable" style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--blue)", textDecoration: "none" }}>
                  Appeler
                </a>
              )}
              <button className="focusable" onClick={onOpenFull} style={{ fontSize: "12.5px", background: "none", color: "var(--text-dim)", border: "none", padding: 0 }}>
                Modifier
              </button>
            </div>
          )}
        </div>

        {recommendation && (
          <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 700, color: "var(--violet)", letterSpacing: "0.05em", marginBottom: "6px" }}>
              <SparklesIcon size={11} color="var(--violet)" /> RECOMMANDATION
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--text)", lineHeight: 1.5 }}>{recommendation}</div>
          </div>
        )}

        <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em", marginBottom: "10px" }}>ACTIVITÉ</div>
          {recentActivities.length === 0 ? (
            <div style={{ fontSize: "12.5px", color: "var(--text-faint)", marginBottom: "20px" }}>Aucune activité enregistrée.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {recentActivities.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "var(--text-dim)" }}>
                  <span>{ACTIVITY_LABEL[a.type] || a.type}</span>
                  <span className="mono" style={{ color: "var(--text-faint)" }}>{formatShortDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn-primary focusable" onClick={onOpenFull} style={{ width: "100%" }}>
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
            <span style={{ fontSize: "12.5px", color: "#527a61" }}>🔥 {result.hot_count} fort potentiel</span>
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

function ProspectDetailPage({ prospect, session, settings, team, onBack, backLabel, onUpdate, onDelete, onLogActivity, initialTab, reload }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickAction, setQuickAction] = useState(null);
  const [showDevis, setShowDevis] = useState(false);
  const [tab, setTab] = useState(initialTab && initialTab !== "historique" ? initialTab : "email");
  const [dealValueInput, setDealValueInput] = useState(prospect.deal_value ?? 0);
  const [taskVersion, setTaskVersion] = useState(0);
  const toolsRef = useRef(null);
  const noteRef = useRef(null);

  useEffect(() => {
    setDealValueInput(prospect.deal_value ?? 0);
  }, [prospect.id, prospect.deal_value]);

  function goToTab(key) {
    setTab(key);
    toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToNote() {
    noteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const starred = (prospect.priority || 0) >= 75;
  function toggleStar() {
    onUpdate({ priority: starred ? 50 : 100 });
  }

  const showOwners = team && (team.team?.has_multiple_sales || team.team?.has_multiple_csm);

  return (
    <div style={{ padding: "28px 40px 64px", maxWidth: "1040px", margin: "0 auto" }}>
      <button className="focusable" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 0", marginBottom: "20px", color: "var(--text-dim)", fontSize: "13px" }}>
        <ArrowLeftIcon size={14} color="var(--text-dim)" /> {backLabel || "Retour au pipeline"}
      </button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div className="display" style={{ fontWeight: 600, fontSize: "23px", overflow: "hidden", textOverflow: "ellipsis" }}>{prospect.company}</div>
        <button
          className="star-toggle focusable"
          onClick={toggleStar}
          title={starred ? "Retirer la priorité" : "Marquer prioritaire"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: starred ? "var(--blue-dim)" : "var(--panel2)",
            border: `0.5px solid ${starred ? "#147ff555" : "var(--hairline)"}`,
            borderRadius: "999px",
            padding: "5px 12px 5px 10px",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "15px", lineHeight: 1, color: starred ? "var(--blue)" : "var(--text-faint)" }}>{starred ? "★" : "☆"}</span>
          <span style={{ fontSize: "12px", fontWeight: 600, color: starred ? "var(--blue)" : "var(--text-dim)" }}>{starred ? "Prioritaire" : "Marquer prioritaire"}</span>
        </button>
      </div>

      <div style={{ marginTop: "6px", fontSize: "15px", fontWeight: 500, color: "var(--text)" }}>
        {prospect.civility && prospect.civility !== "-" ? `${prospect.civility} ` : ""}{prospect.name}
      </div>
      {prospect.job_title && <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "1px" }}>{prospect.job_title}</div>}

      {(prospect.email || prospect.phone || prospect.linkedin_url) && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px", fontSize: "13px", color: "var(--blue)" }}>
          {[
            prospect.email && <a key="email" href={`mailto:${prospect.email}`} style={{ color: "var(--blue)", textDecoration: "none" }}>{prospect.email}</a>,
            prospect.phone && <a key="phone" href={`tel:${prospect.phone}`} style={{ color: "var(--blue)", textDecoration: "none" }}>{prospect.phone}</a>,
            prospect.linkedin_url && <a key="li" href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>LinkedIn</a>,
          ].filter(Boolean).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ color: "var(--text-faint)" }}> · </span>, el]), [])}
        </div>
      )}

      <ProspectOwnersReadout team={team} prospect={prospect} />

      {/* Quick actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap", marginTop: "18px" }}>
        {prospect.email ? (
          <button className="btn-primary focusable" onClick={() => setQuickAction("email")}>
            <MailIcon size={13} color="#fff" /> Email
          </button>
        ) : prospect.phone ? (
          <button className="btn-primary focusable" onClick={() => setQuickAction("call")}>
            <PhoneIcon size={13} color="#fff" /> Appeler
          </button>
        ) : null}
        {prospect.phone && prospect.email && (
          <button className="focusable" onClick={() => setQuickAction("call")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
            <PhoneIcon size={13} color="var(--text-dim)" /> Appeler
          </button>
        )}
        <button className="focusable" onClick={() => setQuickAction("note")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
          Ajouter une note
        </button>
        <button className="focusable" onClick={() => setQuickAction("task")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
          Ajouter une tâche
        </button>
        <button className="focusable" onClick={() => setQuickAction("contacted")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
          Marquer contacté
        </button>
        <button className="focusable" onClick={() => setQuickAction("edit")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px", fontWeight: 500 }}>
          Modifier
        </button>
      </div>

      {showDevis && <DevisGenerator prospect={prospect} history={history} session={session} settings={settings} onClose={() => setShowDevis(false)} />}

      {quickAction === "email" && <QuickEmailModal prospect={prospect} session={session} settings={settings} onClose={() => setQuickAction(null)} onDone={() => { reload?.(); history.reload(); }} />}
      {quickAction === "call" && <QuickCallModal prospect={prospect} session={session} onClose={() => setQuickAction(null)} onDone={() => { reload?.(); history.reload(); }} />}
      {quickAction === "note" && <QuickNoteModal prospect={prospect} session={session} settings={settings} onClose={() => setQuickAction(null)} onDone={() => { reload?.(); history.reload(); }} />}
      {quickAction === "task" && <QuickTaskModal prospect={prospect} session={session} settings={settings} onClose={() => setQuickAction(null)} onDone={() => { reload?.(); bumpTasks(); }} />}
      {quickAction === "contacted" && <QuickContactedModal prospect={prospect} session={session} onClose={() => setQuickAction(null)} onDone={() => { reload?.(); history.reload(); }} />}
      {quickAction === "edit" && (
        <Modal onClose={() => setQuickAction(null)}>
          <ModalTitle sub={`${prospect.name} · ${prospect.company}`}>Modifier la fiche</ModalTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
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
          </div>
          <EditProspectForm prospect={prospect} onSave={async (changes) => { await onUpdate(changes); setQuickAction(null); }} onCancel={() => setQuickAction(null)} />
        </Modal>
      )}

      <div style={{ borderTop: "0.5px solid var(--hairline)", margin: "22px 0" }} />

      {/* Commercial block */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "32px", flexWrap: "wrap" }}>
        <div>
          <div className="mono" style={{ fontSize: "28px", fontWeight: 600, color: "var(--text)" }}>{formatEuros(prospect.deal_value)}</div>
          <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "2px" }}>
            {prospect.stage === "Gagné" ? "Client" : prospect.stage}{starred ? " · ★ Prioritaire" : ""}
          </div>
          <div style={{ marginTop: "10px", maxWidth: "260px" }}>
            <PipelineStepper stage={prospect.stage} onChange={handleStageChange} />
          </div>
        </div>
        <NextActionCard prospect={prospect} refreshKey={taskVersion} onOpenTab={goToTab} />
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", margin: "22px 0" }} />

      {/* Main + secondary columns */}
      <div className="detail-grid">
        <div style={{ minWidth: 0 }}>
          <div ref={noteRef} style={{ scrollMarginTop: "20px" }}>
            <NoteAnalyzer prospect={prospect} history={history} session={session} onLogActivity={onLogActivity} onUpdate={onUpdate} settings={settings} onTaskCreated={bumpTasks} onOpenTab={goToTab} />
          </div>

          <OpportunityAI prospect={prospect} history={history} session={session} onUpdate={onUpdate} />

          <div style={{ color: "var(--text-faint)", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "14px" }}>ACTIVITÉ</div>
          <ActivityTimeline history={history} />

          <div style={{ borderTop: "0.5px solid var(--hairline)", margin: "26px 0 16px" }} />

          <div ref={toolsRef} style={{ color: "var(--text-faint)", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "10px", scrollMarginTop: "20px" }}>OUTILS</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
            {[["email", "Email"], ["echanges", "Échanges"], ["script", "Script"], ["taches", "Tâches"]].map(([key, label]) => (
              <button key={key} className="focusable" onClick={() => setTab(key)} style={{ background: "none", border: "none", padding: 0, fontSize: "13px", fontWeight: tab === key ? 600 : 400, color: tab === key ? "var(--blue)" : "var(--text-dim)" }}>
                {label}
              </button>
            ))}
            <button
              className="focusable"
              onClick={() => setShowDevis(true)}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "6px 14px", fontSize: "12.5px", fontWeight: 600 }}
            >
              Créer un devis
            </button>
          </div>

          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "18px" }}>
            {tab === "email" && <EmailGenerator prospect={prospect} history={history} session={session} settings={settings} />}
            {tab === "echanges" && <EmailThreadTab prospect={prospect} session={session} />}
            {tab === "script" && <ScriptGenerator prospect={prospect} history={history} session={session} />}
            {tab === "taches" && <TasksTab prospect={prospect} session={session} settings={settings} onChange={bumpTasks} />}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: "8px" }}>INFORMATIONS</div>
            <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Entreprise</div>
            <div style={{ fontSize: "13.5px", color: "var(--text)", marginBottom: "8px" }}>{prospect.company}</div>
            {prospect.job_title && (
              <>
                <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Poste</div>
                <div style={{ fontSize: "13.5px", color: "var(--text)" }}>{prospect.job_title}</div>
              </>
            )}
          </div>

          {(prospect.email || prospect.phone) && (
            <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "16px" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: "8px" }}>CONTACT</div>
              {prospect.email && (
                <>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Email</div>
                  <div style={{ fontSize: "13.5px", color: "var(--blue)", marginBottom: "8px", overflowWrap: "anywhere" }}>{prospect.email}</div>
                </>
              )}
              {prospect.phone && (
                <>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>Téléphone</div>
                  <div style={{ fontSize: "13.5px", color: "var(--text)" }}>{prospect.phone}</div>
                </>
              )}
            </div>
          )}

          {showOwners && (
            <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "16px" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: "8px" }}>ÉQUIPE</div>
              <ProspectOwnersPanel prospect={prospect} session={session} team={team} onAssigned={reload} />
            </div>
          )}

          <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "16px" }}>
            <div style={{ fontSize: "13px", color: "var(--text-faint)" }}>Dernier contact : {prospect.last_contact_at ? formatShortDate(prospect.last_contact_at) : "jamais"}</div>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button className="focusable" onClick={onDelete} style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--red)", background: "none", border: "none", padding: 0 }}>Confirmer la suppression</button>
                <button className="focusable" onClick={() => setConfirmDelete(false)} style={{ fontSize: "12.5px", color: "var(--text-dim)", background: "none", border: "none", padding: 0 }}>Annuler</button>
              </div>
            ) : (
              <button className="focusable" onClick={() => setConfirmDelete(true)} style={{ fontSize: "12.5px", color: "var(--text-faint)", background: "none", border: "none", padding: 0, marginTop: "10px" }}>
                Supprimer la fiche
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
        <span style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: "12px", fontWeight: 700, color: stage === "Gagné" ? "#527a61" : "var(--text-faint)", background: stage === "Gagné" ? "#eaf1ec" : "var(--panel2)", borderRadius: "999px", padding: "5px 12px" }}>
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
    await supabase.from("tasks").update({ done: true, completed_at: new Date().toISOString() }).eq("id", task.id);
    load();
  }

  if (loading) return null;

  const VERB = { appel_telephone: "Appeler", appel_visio: "Appel visio avec", rdv_physique: "RDV avec", relance_email: "Relancer" };

  return (
    <div style={{ textAlign: "right", minWidth: "200px" }}>
      <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: "6px" }}>PROCHAINE ACTION</div>
      {task ? (
        <>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
            {VERB[task.type] || TASK_TYPE_META[task.type]?.label} {prospect.name}
          </div>
          <div className="mono" style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px", marginBottom: "10px", textTransform: "capitalize" }}>
            {formatDayTime(task.due_at)}
          </div>
          {task.note && <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginBottom: "10px" }}>{task.note}</div>}
          <div style={{ display: "flex", gap: "14px", justifyContent: "flex-end" }}>
            <button className="focusable" onClick={() => onOpenTab?.("taches")} style={{ background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "13px" }}>
              Modifier
            </button>
            {prospect.phone && task.type !== "relance_email" ? (
              <a href={`tel:${prospect.phone}`} className="btn-primary focusable" style={{ height: "auto", padding: "8px 14px" }}>
                Appeler
              </a>
            ) : (
              <button className="btn-primary focusable" onClick={markDone} style={{ height: "auto", padding: "8px 14px" }}>
                Marquer fait
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "10px" }}>Aucune action planifiée.</div>
          <button className="btn-primary focusable" onClick={() => onOpenTab?.("taches")} style={{ height: "auto", padding: "8px 14px" }}>
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
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

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
  const namedMonth = t.match(/\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\b/);
  if (namedMonth) {
    const day = parseInt(namedMonth[1], 10);
    const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const monthIndex = MONTH_NAMES.findIndex((m) => stripAccents(m) === stripAccents(namedMonth[2]));
    if (day >= 1 && day <= 31 && monthIndex >= 0) {
      const d = new Date(now.getFullYear(), monthIndex, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }
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
      const todayStr = new Date().toISOString().slice(0, 10);
      const prompt = `Tu es un assistant commercial. Un commercial vient de noter comment s'est passé un échange (appel, RDV ou autre) avec ce prospect. Analyse cette note et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, exactement dans ce format :
{"summary": "résumé en 1-2 phrases de ce qu'il faut faire ensuite", "pain_points": ["...", "..."], "opportunities": ["...", "..."], "suggested_tasks": [{"type": "appel_telephone", "note": "description courte", "due_date": "AAAA-MM-JJ"}]}

Limite chaque tableau à 3 éléments maximum, en français. "type" doit être l'une de ces valeurs exactes : "appel_telephone", "appel_visio", "rdv_physique", "relance_email".
"due_date" est une date calendaire exacte au format AAAA-MM-JJ, jamais un simple nombre de jours. Nous sommes aujourd'hui le ${todayStr}. Si la note mentionne une date précise (ex : "le 7 septembre", "vendredi prochain"), calcule et utilise cette date exacte réelle — ne confonds jamais un jour du mois avec un nombre de jours à attendre. Si aucune date n'est mentionnée, choisis une date raisonnable dans les jours qui suivent.

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
      const time = settings?.default_task_time || "17:00";
      const parsedDate = t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? new Date(`${t.due_date}T${time}`) : null;
      const due = parsedDate && !isNaN(parsedDate) ? parsedDate : new Date();
      if (!parsedDate) due.setDate(due.getDate() + 3);
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
            style={{ display: "flex", alignItems: "center", gap: "5px", background: actionType === key ? "var(--blue-dim)" : "var(--panel2)", color: actionType === key ? "var(--blue)" : "var(--text-dim)", border: actionType === key ? "0.5px solid #147ff555" : "0.5px solid var(--hairline)", borderRadius: "999px", padding: "6px 11px", fontSize: "12px" }}
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
          style={{ flex: 1, background: saved ? "#eaf1ec" : "var(--panel2)", color: saved ? "#527a61" : "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "12.5px", opacity: busy ? 0.6 : 1 }}
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
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px", fontSize: "12.5px", opacity: !note.trim() || busy ? 0.6 : 1 }}
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
              <div style={{ fontSize: "11px", color: "#527a61", fontWeight: 700, marginBottom: "6px" }}>OPPORTUNITÉS</div>
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
              style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", opacity: creating || selected.length === 0 ? 0.6 : 1 }}
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
      style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(16px)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius-lg)", padding: "22px", maxWidth: "480px", width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-md)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "16px" }}>{children}</div>
      {sub && <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, busy, disabled }) {
  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
      <button
        className="focusable"
        onClick={onConfirm}
        disabled={busy || disabled}
        style={{ flex: 1, background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: busy || disabled ? 0.6 : 1 }}
      >
        {busy ? "Enregistrement…" : confirmLabel}
      </button>
      <button className="focusable" onClick={onCancel} style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 16px", fontSize: "13px" }}>
        Annuler
      </button>
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function QuickNoteModal({ prospect, session, settings, onClose, onDone }) {
  const [actionType, setActionType] = useState("appel_abouti");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!note.trim() || busy) return;
    setBusy(true);
    await supabase.from("activities").insert({ user_id: session.user.id, prospect_id: prospect.id, type: actionType, note: note.trim(), source: "manual" });
    await supabase.from("prospects").update({ last_contact_at: new Date().toISOString() }).eq("id", prospect.id);
    setBusy(false);
    onDone?.();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle sub={`${prospect.name} · ${prospect.company}`}>Ajouter une note</ModalTitle>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
        {ACTION_TYPES.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="focusable"
            onClick={() => setActionType(key)}
            style={{ display: "flex", alignItems: "center", gap: "5px", background: actionType === key ? "var(--blue-dim)" : "var(--panel2)", color: actionType === key ? "var(--blue)" : "var(--text-dim)", border: actionType === key ? "0.5px solid #147ff555" : "0.5px solid var(--hairline)", borderRadius: "999px", padding: "6px 11px", fontSize: "12px" }}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ce qui s'est dit, ce qu'il faut retenir…"
        style={{ width: "100%", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.5, padding: "10px 12px", minHeight: "110px", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
      />
      <ModalActions onCancel={onClose} onConfirm={submit} confirmLabel="Enregistrer la note" busy={busy} disabled={!note.trim()} />
    </Modal>
  );
}

function QuickTaskModal({ prospect, session, settings, onClose, onDone }) {
  const [type, setType] = useState("appel_telephone");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [dueTime, setDueTime] = useState(settings?.default_task_time || "17:00");
  const [priority, setPriority] = useState("50");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!note.trim() || busy) return;
    setBusy(true);
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type,
      note: note.trim(),
      due_at: dueDate ? new Date(`${dueDate}T${dueTime || "17:00"}`).toISOString() : null,
      priority: Number(priority),
    });
    setBusy(false);
    onDone?.();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle sub={`${prospect.name} · ${prospect.company}`}>Ajouter une tâche</ModalTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          {Object.entries(TASK_TYPE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <input autoFocus placeholder="Que faut-il faire ?" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        <div style={{ display: "flex", gap: "8px" }}>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
        </select>
      </div>
      <ModalActions onCancel={onClose} onConfirm={submit} confirmLabel="Créer la tâche" busy={busy} disabled={!note.trim()} />
    </Modal>
  );
}

function QuickContactedModal({ prospect, session, onClose, onDone }) {
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("appel_abouti");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const when = new Date(`${date}T12:00`).toISOString();
    await supabase.from("prospects").update({ last_contact_at: when }).eq("id", prospect.id);
    await supabase.from("activities").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type,
      note: note.trim() || null,
      source: "manual",
    });
    setBusy(false);
    onDone?.();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle sub="Met à jour la date du dernier échange et l'enregistre dans l'historique.">Marquer comme contacté</ModalTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          {ACTION_TYPES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        <input placeholder="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
      </div>
      <ModalActions onCancel={onClose} onConfirm={submit} confirmLabel="Enregistrer" busy={busy} />
    </Modal>
  );
}

function QuickCallModal({ prospect, session, onClose, onDone }) {
  const [outcome, setOutcome] = useState("appel_abouti");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function logCall() {
    if (busy) return;
    setBusy(true);
    await supabase.from("activities").insert({ user_id: session.user.id, prospect_id: prospect.id, type: outcome, note: note.trim() || null, source: "manual" });
    if (outcome !== "appel_manque") {
      await supabase.from("prospects").update({ last_contact_at: new Date().toISOString() }).eq("id", prospect.id);
    }
    setBusy(false);
    onDone?.();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle sub={`${prospect.name} · ${prospect.company}`}>Appeler</ModalTitle>
      <a
        href={`tel:${prospect.phone}`}
        className="focusable"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "10px", padding: "14px", fontSize: "16px", fontWeight: 700, textDecoration: "none", marginBottom: "16px" }}
      >
        <PhoneIcon size={16} color="var(--blue)" /> {prospect.phone}
      </a>
      <div style={{ fontSize: "12px", color: "var(--text-faint)", marginBottom: "10px" }}>Une fois l'appel terminé, enregistrez ce qu'il en ressort :</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          <option value="appel_abouti">Appel abouti</option>
          <option value="appel_manque">Appel manqué</option>
          <option value="note">Autre — note libre</option>
        </select>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ce qui s'est dit (facultatif)"
          style={{ width: "100%", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "10px 12px", minHeight: "80px", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
        />
      </div>
      <ModalActions onCancel={onClose} onConfirm={logCall} confirmLabel="Enregistrer l'appel" busy={busy} />
    </Modal>
  );
}

function QuickEmailModal({ prospect, session, settings, onClose, onDone }) {
  const [subject, setSubject] = useState(`${prospect.company || ""} — suivi`.trim());
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const statusRes = await fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const status = await statusRes.json();
      const provider = status.google ? "google" : status.microsoft ? "microsoft" : null;
      if (!provider) {
        // Sans boîte connectée, on ne bloque pas : on bascule sur le client mail du poste.
        window.location.href = `mailto:${prospect.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        onClose();
        return;
      }
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "send_email", provider, to: prospect.email, subject, body: appendSignature(body, settings) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'envoi a échoué.");

      await supabase.from("activities").insert({ user_id: session.user.id, prospect_id: prospect.id, type: "note", note: `Email envoyé : ${subject}`, source: "manual" });
      await supabase.from("prospects").update({ last_contact_at: new Date().toISOString() }).eq("id", prospect.id);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || "L'envoi a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle sub={`À : ${prospect.email}`}>Envoyer un email</ModalTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input placeholder="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Votre message…"
          style={{ width: "100%", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.5, padding: "10px 12px", minHeight: "150px", resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
        />
      </div>
      {error && <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</div>}
      <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "8px" }}>
        Votre signature est ajoutée automatiquement. Pour un email rédigé par l'IA, utilisez l'onglet Email plus bas.
      </div>
      <ModalActions onCancel={onClose} onConfirm={send} confirmLabel="Envoyer" busy={busy} disabled={!body.trim()} />
    </Modal>
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
  const [billingAddress, setBillingAddress] = useState(prospect.billing_address || "");
  const [billingPostalCode, setBillingPostalCode] = useState(prospect.billing_postal_code || "");
  const [billingCity, setBillingCity] = useState(prospect.billing_city || "");
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
      billing_address: billingAddress.trim(),
      billing_postal_code: billingPostalCode.trim(),
      billing_city: billingCity.trim(),
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
      <input placeholder="Adresse (pour les devis)" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
      <input placeholder="Code postal" value={billingPostalCode} onChange={(e) => setBillingPostalCode(e.target.value)} style={inputStyle} />
      <input placeholder="Ville" value={billingCity} onChange={(e) => setBillingCity(e.target.value)} style={inputStyle} />
      <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
        {PRIORITY_LEVELS.map((l) => <option key={l.value} value={l.value}>Priorité : {l.label}</option>)}
      </select>
      <input type="number" min="0" placeholder="Valeur du deal (€)" value={dealValue} onChange={(e) => setDealValue(e.target.value)} style={inputStyle} />
      <div style={{ display: "flex", gap: "8px", gridColumn: "1 / -1" }}>
        <button type="submit" disabled={saving} className="focusable" style={{ flex: 1, background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
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
          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555" }}>
            <SparklesIcon size={11} color="var(--blue)" /> {loading ? "Analyse..." : data ? "Régénérer" : "Analyser"}
          </button>
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
        {data ? (
          <>
            <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#527a61" }}>🟢 {(data.positive_signals || []).length} signaux positifs</span>
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

const TIMELINE_ICON = {
  appel_abouti: PhoneIcon, appel_manque: PhoneIcon,
  rdv_physique: PinIcon, appel_visio: VideoIcon,
  message_linkedin: LinkedinIcon,
  deal_gagne: TrophyIcon, deal_perdu: TrophyIcon,
  reassignation: UsersIcon,
  note: ListIcon,
};

function timelineDayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function ActivityTimeline({ history }) {
  const [filter, setFilter] = useState("Tous");
  if (history.loading) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>;

  const items = [
    ...history.emails.map((x) => ({ ...x, kind: x.type === "devis" ? "Devis envoyé" : "Email envoyé", filterKey: "IA", Icon: MailIcon })),
    ...history.scripts.map((x) => ({ ...x, kind: `Script préparé — ${x.section}`, filterKey: "IA", Icon: CalendarIcon })),
    ...history.analyses.map((x) => ({ ...x, kind: x.type === "opportunite" ? "Analyse Closia" : "Analyse", filterKey: "IA", Icon: SparklesIcon })),
    ...history.activities.map((x) => ({ ...x, kind: ACTIVITY_LABEL[x.type] || x.type, content: x.note || "", filterKey: HISTORIQUE_FILTER_BY_TYPE[x.type] || "Notes", Icon: TIMELINE_ICON[x.type] || ListIcon })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const visible = filter === "Tous" ? items : items.filter((i) => i.filterKey === filter);

  const groups = [];
  for (const item of visible) {
    const label = timelineDayLabel(item.created_at);
    let g = groups.find((g) => g.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "16px" }}>
        {HISTORIQUE_FILTERS.map((f) => (
          <button
            key={f}
            className="focusable"
            onClick={() => setFilter(f)}
            style={{ background: "none", border: "none", padding: 0, fontSize: "12px", fontWeight: filter === f ? 600 : 400, color: filter === f ? "var(--blue)" : "var(--text-faint)" }}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: "13px", lineHeight: 1.6 }}>
          Aucune activité pour le moment.<br />Les appels, emails, notes et tâches apparaîtront ici.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxHeight: "460px", overflowY: "auto", paddingRight: "4px" }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: "10px", textTransform: "uppercase" }}>{g.label}</div>
              <div>
                {g.items.map((item, i) => {
                  const Icon = item.Icon;
                  const time = new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={`${item.kind}-${item.id}`} style={{ display: "flex", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: "5px" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--hairline-strong)", flexShrink: 0 }} />
                        {i < g.items.length - 1 && <span style={{ width: "1px", flex: 1, background: "var(--hairline)", marginTop: "4px", minHeight: "18px" }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <span className="mono" style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{time}</span>
                          <Icon size={12} color="var(--text-faint)" />
                          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{item.kind}</span>
                        </div>
                        {item.content && (
                          <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "3px" }}>
                            {item.content.length > 140 ? `${item.content.slice(0, 140)}…` : item.content}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
    await supabase.from("tasks").update({ done: !task.done, completed_at: !task.done ? new Date().toISOString() : null }).eq("id", task.id);
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
        <button type="submit" disabled={saving || !note.trim()} className="focusable" style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "8px 14px", fontSize: "13px" }}>
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
                  <CheckIcon size={18} color={t.done ? "#527a61" : "var(--text-faint)"} />
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

// Récupère les échanges email réels avec ce contact. Rien n'est stocké côté Closia :
// les messages sont lus chez Gmail à la demande.
async function fetchEmailThread(email, token) {
  if (!email) return { messages: [] };
  const res = await fetch(`/api/calendar/status?action=thread&email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { messages: [], error: "La récupération des échanges a échoué." };
  return res.json();
}

function formatThreadDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// "Jean Dupont <jean@exemple.fr>" → "Jean Dupont" ; sinon on garde l'adresse brute.
function senderLabel(from) {
  const name = from.match(/^\s*"?([^"<]*?)"?\s*</)?.[1]?.trim();
  return name || from.replace(/[<>]/g, "").trim();
}

function EmailThreadTab({ prospect, session }) {
  const [state, setState] = useState({ loading: true, messages: [], error: "", notConnected: false });
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!prospect.email) {
      setState({ loading: false, messages: [], error: "", notConnected: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    fetchEmailThread(prospect.email, session.access_token).then((data) => {
      if (!cancelled) setState({ loading: false, messages: data.messages || [], error: data.error || "", notConnected: !!data.notConnected });
    });
    return () => {
      cancelled = true;
    };
  }, [prospect.email, session.access_token]);

  if (!prospect.email) {
    return <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Ajoute une adresse email à ce contact pour retrouver vos échanges.</div>;
  }
  if (state.loading) return <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Lecture des échanges…</div>;
  if (state.notConnected) {
    return <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>Connecte ta boîte Gmail ou Outlook dans Paramètres → Intégrations pour retrouver ici vos échanges avec ce contact.</div>;
  }
  if (state.error) return <div style={{ fontSize: "12.5px", color: "var(--red)" }}>{state.error}</div>;
  if (state.messages.length === 0) {
    return <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Aucun échange trouvé avec {prospect.email}.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>
        {state.messages.length} échange{state.messages.length > 1 ? "s" : ""} avec {prospect.email} · lus depuis votre boîte mail, non stockés par Closia
      </div>
      {state.messages.map((m) => {
        const open = expanded === m.id;
        return (
          <button
            key={m.id}
            className="focusable"
            onClick={() => setExpanded(open ? null : m.id)}
            style={{
              textAlign: "left",
              background: "var(--panel)",
              border: "0.5px solid var(--hairline)",
              borderRadius: "10px",
              padding: "11px 13px",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.subject || "(Sans objet)"}
              </span>
              <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)", flexShrink: 0 }}>{formatThreadDate(m.sentAt)}</span>
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "2px" }}>{senderLabel(m.from || "")}</div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-dim)",
                marginTop: "6px",
                lineHeight: 1.55,
                whiteSpace: open ? "pre-wrap" : "nowrap",
                overflow: open ? "visible" : "hidden",
                textOverflow: open ? "clip" : "ellipsis",
              }}
            >
              {open ? m.body || m.snippet : m.snippet}
            </div>
          </button>
        );
      })}
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
      // Les vrais emails échangés avec le contact donnent à l'IA le contexte que
      // les notes internes ne contiennent pas — ce qui a réellement été dit et répondu.
      const thread = await fetchEmailThread(prospect.email, session.access_token);
      const threadContext = (thread.messages || []).length
        ? `\n\nEmails réellement échangés avec ce contact (du plus récent au plus ancien) :\n${thread.messages
            .map((m) => `— ${formatThreadDate(m.sentAt)} · de ${senderLabel(m.from || "")} · objet "${m.subject || "(sans objet)"}"\n${(m.body || m.snippet || "").trim()}`)
            .join("\n\n")}`
        : "";

      const prompt = `Tu es un assistant commercial. Rédige un email de relance en français, ton ${tone}, ${lengthGuide}. Ne mets pas d'objet, uniquement le corps de l'email, termine par une formule de politesse simple (ex : "Bonne journée,"), sans nom ni signature — la signature sera ajoutée automatiquement après. Appuie-toi sur les points forts identifiés dans l'historique pour renforcer l'argumentaire, et adresse discrètement les points faibles ou objections potentielles. Ne répète pas ce qui a déjà été dit dans les échanges précédents, et reprends le fil de la conversation réelle si des emails sont fournis.
${keywords.trim() ? `\nÉléments à intégrer absolument, donnés par le commercial : ${keywords.trim()}\n` : ""}
Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Historique des échanges avec ce prospect :
${buildHistoryContext(history)}${threadContext}`;
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
      {sent && <div style={{ color: "#527a61", fontSize: "12px", marginTop: "-4px" }}>Email envoyé à {prospect.email}.</div>}

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
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: loading ? 0.6 : 1 }}
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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Un champ manquant est signalé plutôt que laissé vide : un devis incomplet
// n'a pas de valeur, autant que ça saute aux yeux avant l'envoi.
function devisField(value, placeholder) {
  const v = (value || "").toString().trim();
  return v ? escapeHtml(v) : `<span class="todo">${escapeHtml(placeholder)}</span>`;
}

function buildDevisNumber(settings) {
  const n = (settings?.devis_counter || 0) + 1;
  return `DEV-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
}

function openDevisDocument({ prospect, settings, items, total, number }) {
  const vatExempt = !!settings?.vat_exempt;
  const vatRate = vatExempt ? 0 : Number(settings?.vat_rate ?? 20);
  const vatAmount = total * (vatRate / 100);
  const validityDays = Number(settings?.devis_validity_days ?? 30);
  const today = new Date();
  const validUntil = new Date(today.getTime() + validityDays * 86400000);
  const fmt = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const euros = (n) => formatEuros(n);

  const sellerName = settings?.company_name || settings?.sig_company;
  const sellerContact = [settings?.first_name, settings?.last_name].filter(Boolean).join(" ") || settings?.sig_name;

  const rows = items
    .filter((it) => (it.description || "").trim() || Number(it.unitPrice) > 0)
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description || "—")}</td>
        <td class="num">${Number(it.qty) || 0}</td>
        <td class="num">${euros(Number(it.unitPrice) || 0)}</td>
        <td class="num strong">${euros((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>${escapeHtml(number)} — ${escapeHtml(prospect.company || prospect.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif; color: #14171f; margin: 0; padding: 48px; background: #f4f6fb; font-size: 13px; line-height: 1.55; }
  .sheet { background: #fff; max-width: 780px; margin: 0 auto; padding: 52px 56px; border-radius: 4px; box-shadow: 0 4px 24px rgba(20,23,31,.10); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; margin-bottom: 40px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .ref { color: #64708a; font-size: 12.5px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 36px; }
  .party { border: 0.5px solid #e4e8f0; border-radius: 8px; padding: 16px 18px; }
  .party h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #8490a3; margin: 0 0 8px; font-weight: 700; }
  .party .name { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
  .party div { color: #4a5468; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #8490a3; border-bottom: 1.5px solid #14171f; padding: 0 8px 8px; }
  td { padding: 11px 8px; border-bottom: 0.5px solid #e4e8f0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 600; }
  .totals { margin-left: auto; width: 290px; }
  .totals div { display: flex; justify-content: space-between; padding: 7px 8px; }
  .totals .grand { border-top: 1.5px solid #14171f; margin-top: 4px; font-weight: 700; font-size: 15.5px; }
  .terms { margin-top: 40px; padding-top: 20px; border-top: 0.5px solid #e4e8f0; color: #4a5468; font-size: 12px; }
  .terms h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #8490a3; margin: 0 0 8px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; }
  .sign-box { border: 0.5px dashed #b9c2d4; border-radius: 8px; padding: 14px 16px 44px; }
  .sign-box span { font-size: 10.5px; color: #8490a3; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
  .sign-box em { display: block; font-style: normal; font-size: 11px; color: #8490a3; margin-top: 3px; }
  .todo { background: #fff4d6; color: #92600a; border-radius: 4px; padding: 1px 6px; font-size: 11.5px; font-weight: 600; }
  .toolbar { max-width: 780px; margin: 0 auto 18px; display: flex; gap: 10px; }
  .toolbar button { font: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 8px; border: none; background: #246bfe; color: #fff; cursor: pointer; }
  .toolbar .ghost { background: #fff; color: #4a5468; border: 0.5px solid #d3d9e6; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; max-width: none; padding: 0; } .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    <button class="ghost" onclick="window.close()">Fermer</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>Devis</h1>
        <div class="ref">N° ${escapeHtml(number)} · Émis le ${fmt(today)}</div>
        <div class="ref">Valable jusqu'au ${fmt(validUntil)}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h2>Émetteur</h2>
        <div class="name">${devisField(sellerName, "Nom de votre entreprise à compléter")}</div>
        ${sellerContact ? `<div>${escapeHtml(sellerContact)}</div>` : ""}
        <div>${devisField(settings?.billing_address, "Adresse à compléter")}</div>
        <div>${escapeHtml([settings?.billing_postal_code, settings?.billing_city].filter(Boolean).join(" ")) || '<span class="todo">Code postal et ville à compléter</span>'}</div>
        <div>SIRET : ${devisField(settings?.siret, "à compléter")}</div>
        ${vatExempt ? "" : `<div>N° TVA : ${devisField(settings?.vat_number, "à compléter")}</div>`}
      </div>
      <div class="party">
        <h2>Client</h2>
        <div class="name">${devisField(prospect.company, "Entreprise non renseignée")}</div>
        <div>${escapeHtml(prospect.name || "")}</div>
        <div>${devisField(prospect.billing_address, "Adresse à compléter")}</div>
        <div>${escapeHtml([prospect.billing_postal_code, prospect.billing_city].filter(Boolean).join(" ")) || '<span class="todo">Code postal et ville à compléter</span>'}</div>
        ${prospect.email ? `<div>${escapeHtml(prospect.email)}</div>` : ""}
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="color:#8490a3">Aucune ligne renseignée</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div><span>Total HT</span><span>${euros(total)}</span></div>
      ${vatExempt
        ? '<div style="color:#4a5468"><span>TVA</span><span>Non applicable</span></div>'
        : `<div><span>TVA ${vatRate} %</span><span>${euros(vatAmount)}</span></div>`}
      <div class="grand"><span>Total ${vatExempt ? "" : "TTC"}</span><span>${euros(total + vatAmount)}</span></div>
    </div>

    <div class="terms">
      <h3>Conditions</h3>
      <div>Offre valable ${validityDays} jours à compter de la date d'émission.</div>
      ${settings?.devis_payment_terms ? `<div>${escapeHtml(settings.devis_payment_terms)}</div>` : ""}
      ${vatExempt ? "<div>TVA non applicable, article 293 B du Code général des impôts.</div>" : ""}
    </div>

    <div class="sign">
      <div class="sign-box"><span>L'émetteur</span><em>Date et signature</em></div>
      <div class="sign-box"><span>Le client</span><em>Bon pour accord — date et signature</em></div>
    </div>
  </div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

// Bloc repliable du formulaire de devis. Replié par défaut : on ouvre surtout le
// devis pour saisir des lignes, les coordonnées ne bougent qu'occasionnellement.
function DevisFieldset({ title, children, onSave, saved, saveLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "0.5px solid var(--hairline)", borderRadius: "10px", marginBottom: "10px", overflow: "hidden" }}>
      <button
        className="focusable"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--panel2)", border: "none", padding: "10px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-dim)" }}
      >
        {title}
        <span style={{ fontSize: "10px", color: "var(--text-faint)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>{children}</div>
          {onSave && (
            <button
              className="focusable"
              onClick={onSave}
              style={{ marginTop: "10px", background: "none", border: "none", padding: 0, color: saved ? "#527a61" : "var(--blue)", fontSize: "11.5px", fontWeight: 600 }}
            >
              {saved ? "Enregistré ✓" : saveLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DevisPreview({ prospect, settings, items, total }) {
  const vatExempt = !!settings?.vat_exempt;
  const vatRate = vatExempt ? 0 : Number(settings?.vat_rate ?? 20);
  const validityDays = Number(settings?.devis_validity_days ?? 30);
  const today = new Date();
  const validUntil = new Date(today.getTime() + validityDays * 86400000);
  const fmt = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const todo = (v, label) => (v ? <>{v}</> : <span style={{ background: "#fff4d6", color: "#92600a", borderRadius: "4px", padding: "0 5px", fontWeight: 600 }}>{label} à compléter</span>);
  const rows = items.filter((it) => (it.description || "").trim() || Number(it.unitPrice) > 0);

  const party = (title, children) => (
    <div style={{ border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "12px 14px" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: "6px" }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ background: "#fff", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "28px", boxShadow: "var(--shadow-sm)", fontSize: "12px", color: "var(--text)" }}>
      <div className="display" style={{ fontSize: "22px", fontWeight: 800, marginBottom: "3px" }}>Devis</div>
      <div style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>Émis le {fmt(today)} · valable jusqu'au {fmt(validUntil)}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "20px 0" }}>
        {party("Émetteur", (
          <>
            <div style={{ fontWeight: 700, marginBottom: "2px" }}>{todo(settings?.company_name, "Raison sociale")}</div>
            <div style={{ color: "var(--text-dim)" }}>{todo(settings?.billing_address, "Adresse")}</div>
            <div style={{ color: "var(--text-dim)" }}>{todo([settings?.billing_postal_code, settings?.billing_city].filter(Boolean).join(" "), "Ville")}</div>
            <div style={{ color: "var(--text-dim)" }}>SIRET : {todo(settings?.siret, "SIRET")}</div>
          </>
        ))}
        {party("Client", (
          <>
            <div style={{ fontWeight: 700, marginBottom: "2px" }}>{todo(prospect.company, "Entreprise")}</div>
            <div style={{ color: "var(--text-dim)" }}>{prospect.name}</div>
            <div style={{ color: "var(--text-dim)" }}>{todo(prospect.billing_address, "Adresse")}</div>
            <div style={{ color: "var(--text-dim)" }}>{todo([prospect.billing_postal_code, prospect.billing_city].filter(Boolean).join(" "), "Ville")}</div>
          </>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid var(--text)" }}>
            <th style={{ textAlign: "left", fontSize: "9px", letterSpacing: "0.05em", color: "var(--text-faint)", padding: "0 4px 6px" }}>DESCRIPTION</th>
            <th style={{ textAlign: "right", fontSize: "9px", color: "var(--text-faint)", padding: "0 4px 6px" }}>QTÉ</th>
            <th style={{ textAlign: "right", fontSize: "9px", color: "var(--text-faint)", padding: "0 4px 6px" }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: "12px 4px", color: "var(--text-faint)" }}>Aucune ligne renseignée</td></tr>
          ) : rows.map((it, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid var(--hairline)" }}>
              <td style={{ padding: "8px 4px" }}>{it.description || "—"}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--text-dim)" }}>{Number(it.qty) || 0}</td>
              <td className="mono" style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>{formatEuros((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: "220px", marginTop: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--text-dim)" }}><span>Total HT</span><span className="mono">{formatEuros(total)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "var(--text-dim)" }}>
          <span>{vatExempt ? "TVA" : `TVA ${vatRate} %`}</span>
          <span className="mono">{vatExempt ? "Non applicable" : formatEuros(total * (vatRate / 100))}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", borderTop: "1.5px solid var(--text)", fontWeight: 700, fontSize: "14px" }}>
          <span>Total {vatExempt ? "" : "TTC"}</span><span className="mono">{formatEuros(total * (1 + vatRate / 100))}</span>
        </div>
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "22px", paddingTop: "12px", fontSize: "11px", color: "var(--text-dim)" }}>
        <div>Offre valable {validityDays} jours à compter de la date d'émission.</div>
        {settings?.devis_payment_terms && <div>{settings.devis_payment_terms}</div>}
        {vatExempt && <div>TVA non applicable, article 293 B du Code général des impôts.</div>}
      </div>
    </div>
  );
}

function DevisGenerator({ prospect, history, session, settings, onClose }) {
  const [items, setItems] = useState([{ description: "", qty: 1, unitPrice: prospect.deal_value || 0 }]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [docError, setDocError] = useState("");
  const [busyDoc, setBusyDoc] = useState("");
  const [devisSent, setDevisSent] = useState(false);

  // Tout le devis est modifiable au moment de le faire : les coordonnées peuvent
  // avoir changé, l'adresse de facturation différer de celle de la fiche, la validité
  // être négociée. Les champs partent des valeurs enregistrées, puis vivent leur vie.
  const [seller, setSeller] = useState({
    company_name: settings?.company_name || settings?.sig_company || "",
    billing_address: settings?.billing_address || "",
    billing_postal_code: settings?.billing_postal_code || "",
    billing_city: settings?.billing_city || "",
    siret: settings?.siret || "",
    vat_number: settings?.vat_number || "",
  });
  const [client, setClient] = useState({
    company: prospect.company || "",
    name: prospect.name || "",
    email: prospect.email || "",
    billing_address: prospect.billing_address || "",
    billing_postal_code: prospect.billing_postal_code || "",
    billing_city: prospect.billing_city || "",
  });
  const [terms, setTerms] = useState({
    vat_exempt: !!settings?.vat_exempt,
    vat_rate: settings?.vat_rate ?? 20,
    devis_validity_days: settings?.devis_validity_days ?? 30,
    devis_payment_terms: settings?.devis_payment_terms || "",
  });
  const [savedSeller, setSavedSeller] = useState(false);
  const [savedClient, setSavedClient] = useState(false);

  // Ce que voient l'aperçu, le PDF et l'email : les réglages enregistrés recouverts
  // par les modifications faites sur ce devis précis.
  const effectiveSettings = { ...settings, ...seller, ...terms };
  const effectiveProspect = { ...prospect, ...client };

  async function saveSellerToSettings() {
    await supabase.from("user_settings").update({ ...seller, ...terms }).eq("user_id", session.user.id);
    setSavedSeller(true);
    setTimeout(() => setSavedSeller(false), 2000);
  }

  async function saveClientToProspect() {
    await supabase.from("prospects").update({
      company: client.company,
      email: client.email,
      billing_address: client.billing_address,
      billing_postal_code: client.billing_postal_code,
      billing_city: client.billing_city,
    }).eq("id", prospect.id);
    setSavedClient(true);
    setTimeout(() => setSavedClient(false), 2000);
  }

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

  async function openDocument() {
    setDocError("");
    // Le compteur est relu en base plutôt que pris dans les réglages chargés au
    // démarrage : deux devis créés dans la même session auraient sinon le même numéro.
    const { data: fresh } = await supabase.from("user_settings").select("devis_counter").eq("user_id", session.user.id).maybeSingle();
    const counter = fresh?.devis_counter ?? settings?.devis_counter ?? 0;
    const number = buildDevisNumber({ devis_counter: counter });

    const opened = openDevisDocument({ prospect: effectiveProspect, settings: effectiveSettings, items, total, number });
    if (!opened) {
      setDocError("Le navigateur a bloqué l'ouverture — autorise les fenêtres pop-up pour ce site, puis réessaie.");
      return;
    }
    // Le numéro n'est consommé qu'une fois le document réellement ouvert.
    await supabase.from("user_settings").update({ devis_counter: counter + 1 }).eq("user_id", session.user.id);
  }

  // Réserve le prochain numéro de devis et le consomme — partagé par le PDF et l'envoi.
  async function claimDevisNumber() {
    const { data: fresh } = await supabase.from("user_settings").select("devis_counter").eq("user_id", session.user.id).maybeSingle();
    const counter = fresh?.devis_counter ?? settings?.devis_counter ?? 0;
    await supabase.from("user_settings").update({ devis_counter: counter + 1 }).eq("user_id", session.user.id);
    return buildDevisNumber({ devis_counter: counter });
  }

  async function downloadPdf() {
    if (busyDoc) return;
    setBusyDoc("pdf");
    setDocError("");
    try {
      const number = await claimDevisNumber();
      const { buildDevisPdf, devisFileName } = await import("../lib/devisPdf.js");
      const { doc } = await buildDevisPdf({ prospect: effectiveProspect, settings: effectiveSettings, items, total, number });
      doc.save(devisFileName(effectiveProspect, number));
    } catch (e) {
      setDocError("La génération du PDF a échoué. Réessaie.");
    } finally {
      setBusyDoc("");
    }
  }

  async function sendDevisByEmail() {
    if (busyDoc || !effectiveProspect.email) return;
    setBusyDoc("mail");
    setDocError("");
    setDevisSent(false);
    try {
      const statusRes = await fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const status = await statusRes.json();
      const provider = status.google ? "google" : status.microsoft ? "microsoft" : null;
      if (!provider) {
        setDocError("Aucune boîte mail connectée — connecte Google ou Outlook dans Intégrations pour envoyer le devis.");
        return;
      }

      const number = await claimDevisNumber();
      const { buildDevisPdf, devisFileName } = await import("../lib/devisPdf.js");
      const { doc } = await buildDevisPdf({ prospect: effectiveProspect, settings: effectiveSettings, items, total, number });
      const base64 = doc.output("datauristring").split(",")[1];

      const message = content.trim() || `Bonjour,\n\nVous trouverez ci-joint le devis ${number}.\n\nJe reste à votre disposition pour toute question.\n\nBonne journée,`;

      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: "send_email",
          provider,
          to: effectiveProspect.email,
          subject: `Devis ${number} — ${prospect.company || ""}`.trim(),
          body: appendSignature(message, settings),
          attachment: { filename: devisFileName(effectiveProspect, number), contentType: "application/pdf", base64 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'envoi a échoué.");

      await supabase.from("activities").insert({
        user_id: session.user.id,
        prospect_id: prospect.id,
        type: "note",
        note: `Devis ${number} envoyé à ${effectiveProspect.email}`,
        source: "manual",
      });
      history.reload();
      setDevisSent(true);
      setTimeout(() => setDevisSent(false), 3000);
    } catch (e) {
      setDocError(e.message || "L'envoi a échoué.");
    } finally {
      setBusyDoc("");
    }
  }

  const vatExempt = !!terms.vat_exempt;
  const vatRate = vatExempt ? 0 : Number(terms.vat_rate ?? 20);
  const legalReady = seller.company_name && seller.billing_address && seller.billing_postal_code && seller.siret;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 120, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px 28px", borderBottom: "0.5px solid var(--hairline)", background: "var(--panel)", flexWrap: "wrap" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "16px" }}>Nouveau devis</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-dim)", marginTop: "2px" }}>{prospect.company} · {prospect.name}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="focusable" onClick={openDocument} style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600 }}>
            Aperçu
          </button>
          <button className="focusable" onClick={downloadPdf} disabled={busyDoc} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, opacity: busyDoc ? 0.6 : 1 }}>
            {busyDoc === "pdf" ? "Génération…" : "Télécharger le PDF"}
          </button>
          <button className="focusable" onClick={sendDevisByEmail} disabled={busyDoc || !effectiveProspect.email} title={effectiveProspect.email ? "" : "Renseigne une adresse email du client"} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", fontWeight: 600, opacity: busyDoc || !prospect.email ? 0.6 : 1 }}>
            {busyDoc === "mail" ? "Envoi…" : devisSent ? "Envoyé ✓" : "Envoyer par email"}
          </button>
          <button className="focusable" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "20px", lineHeight: 1, padding: "0 6px" }} title="Fermer">✕</button>
        </div>
      </div>

      {docError && <div style={{ fontSize: "12.5px", color: "var(--red)", padding: "10px 28px", background: "var(--red-dim)" }}>{docError}</div>}
      {!legalReady && (
        <div style={{ fontSize: "12.5px", color: "#92600a", background: "var(--amber-dim)", padding: "10px 28px" }}>
          Vos informations légales sont incomplètes — le devis sortira avec des mentions « à compléter ». Renseignez-les dans Paramètres → Mes informations légales.
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 60px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "24px", maxWidth: "1200px", margin: "0 auto", alignItems: "start" }}>
          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", padding: "20px" }}>
            <DevisFieldset
              title="Vos coordonnées"
              onSave={saveSellerToSettings}
              saved={savedSeller}
              saveLabel="Mémoriser pour mes prochains devis"
            >
              <input placeholder="Raison sociale" value={seller.company_name} onChange={(e) => setSeller({ ...seller, company_name: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
              <input placeholder="Adresse" value={seller.billing_address} onChange={(e) => setSeller({ ...seller, billing_address: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
              <input placeholder="Code postal" value={seller.billing_postal_code} onChange={(e) => setSeller({ ...seller, billing_postal_code: e.target.value })} style={inputStyle} />
              <input placeholder="Ville" value={seller.billing_city} onChange={(e) => setSeller({ ...seller, billing_city: e.target.value })} style={inputStyle} />
              <input placeholder="SIRET" value={seller.siret} onChange={(e) => setSeller({ ...seller, siret: e.target.value })} style={inputStyle} />
              <input placeholder="N° TVA" value={seller.vat_number} onChange={(e) => setSeller({ ...seller, vat_number: e.target.value })} style={inputStyle} />
            </DevisFieldset>

            <DevisFieldset
              title="Coordonnées du client"
              onSave={saveClientToProspect}
              saved={savedClient}
              saveLabel="Enregistrer sur la fiche du prospect"
            >
              <input placeholder="Entreprise" value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} style={inputStyle} />
              <input placeholder="Contact" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} style={inputStyle} />
              <input placeholder="Adresse de facturation" value={client.billing_address} onChange={(e) => setClient({ ...client, billing_address: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
              <input placeholder="Code postal" value={client.billing_postal_code} onChange={(e) => setClient({ ...client, billing_postal_code: e.target.value })} style={inputStyle} />
              <input placeholder="Ville" value={client.billing_city} onChange={(e) => setClient({ ...client, billing_city: e.target.value })} style={inputStyle} />
              <input placeholder="Email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            </DevisFieldset>

            <DevisFieldset title="Conditions">
              <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--text-dim)" }}>
                <input type="checkbox" checked={terms.vat_exempt} onChange={(e) => setTerms({ ...terms, vat_exempt: e.target.checked })} />
                TVA non applicable (micro-entreprise)
              </label>
              {!terms.vat_exempt && (
                <label style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                  Taux de TVA (%)
                  <input type="number" min="0" max="100" step="0.1" value={terms.vat_rate} onChange={(e) => setTerms({ ...terms, vat_rate: e.target.value === "" ? 0 : Number(e.target.value) })} style={{ ...inputStyle, width: "100%", marginTop: "3px" }} />
                </label>
              )}
              <label style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                Validité (jours)
                <input type="number" min="1" value={terms.devis_validity_days} onChange={(e) => setTerms({ ...terms, devis_validity_days: e.target.value === "" ? 30 : Number(e.target.value) })} style={{ ...inputStyle, width: "100%", marginTop: "3px" }} />
              </label>
              <input placeholder="Conditions de paiement" value={terms.devis_payment_terms} onChange={(e) => setTerms({ ...terms, devis_payment_terms: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            </DevisFieldset>

            <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "10px" }}>LIGNES DU DEVIS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  <input type="number" min="1" placeholder="Qté" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} style={{ ...inputStyle, width: "62px" }} />
                  <input type="number" min="0" placeholder="Prix €" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} style={{ ...inputStyle, width: "104px" }} />
                  <button className="focusable" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px", padding: "0 4px", opacity: items.length === 1 ? 0.3 : 1 }}>✕</button>
                </div>
              ))}
            </div>
            <button className="focusable" onClick={addItem} style={{ fontSize: "12px", padding: "7px 12px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}>
              + Ajouter une ligne
            </button>

            <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "18px", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "7px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-dim)" }}>
                <span>Total HT</span><span className="mono">{formatEuros(total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-dim)" }}>
                <span>{vatExempt ? "TVA" : `TVA ${vatRate} %`}</span>
                <span className="mono">{vatExempt ? "Non applicable" : formatEuros(total * (vatRate / 100))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, borderTop: "0.5px solid var(--hairline)", paddingTop: "8px" }}>
                <span>Total {vatExempt ? "" : "TTC"}</span>
                <span className="mono">{formatEuros(total * (1 + vatRate / 100))}</span>
              </div>
            </div>

            <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "18px", paddingTop: "16px" }}>
              <GeneratorBlock label="Générer l'email d'accompagnement avec l'IA" loading={loading} error={error} content={content} setContent={setContent} onGenerate={generateWithAI} onSave={save} />
            </div>
          </div>

          <div>
            <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "10px" }}>APERÇU DU DOCUMENT</div>
            <DevisPreview prospect={effectiveProspect} settings={effectiveSettings} items={items} total={total} />
          </div>
        </div>
      </div>
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
      <button className="focusable" onClick={onGenerate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "10px", fontSize: "13px", opacity: loading ? 0.7 : 1 }}>
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
