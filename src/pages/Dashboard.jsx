import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const STATUS_META = {
  appeler: { label: "APPELER", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  relancer: { label: "RELANCER", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
  attente: { label: "EN ATTENTE", color: "var(--text-faint)", dim: "transparent", Icon: ClockIcon },
  retard: { label: "EN RETARD", color: "var(--red)", dim: "var(--red-dim)", Icon: AlertIcon },
};

const STAGE_META = {
  "Découverte": { color: "#7c3aed", dim: "#f1e9fe" },
  "Qualification": { color: "#2563eb", dim: "#e8f0fe" },
  "Négociation": { color: "#e2492a", dim: "#fde9e3" },
};

const SCRIPT_SECTIONS = [
  "Introduction",
  "Questions de découverte",
  "Pitch personnalisé",
  "Gestion des objections",
  "Closing",
];

function formatEuros(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, stage, size = 34 }) {
  const meta = STAGE_META[stage] || { color: "var(--text-faint)", dim: "var(--panel2)" };
  return (
    <div
      className="mono"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: meta.dim,
        color: meta.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        border: `0.5px solid ${meta.color}40`,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function Icon({ children, size = 14, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {children}
    </svg>
  );
}

function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </Icon>
  );
}

function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </Icon>
  );
}

function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15.5" y2="14" />
    </Icon>
  );
}

function AlertIcon({ color = "currentColor", ...props }) {
  return (
    <Icon color={color} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.3" r="0.6" fill={color} stroke="none" />
    </Icon>
  );
}

function SparklesIcon({ size = 14, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }}>
      <path d="M12 3l1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7z" fill={color} />
      <path d="M19 13.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" fill={color} />
    </svg>
  );
}

function FlameIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-3.5-8.5-.2 2.3-1.8 3-1.8 5.2a1.7 1.7 0 0 1-3.4 0c0-1 .4-1.8.9-2.6C8.5 10.5 7 13 7 15a7 7 0 0 0 5 7z" />
    </Icon>
  );
}

function UsersIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.5 2.8-6.2 6-6.2s6 2.7 6 6.2" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.8 14.3c2.6.5 4.2 2.7 4.2 5.7" />
    </Icon>
  );
}

async function callAI(prompt) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur inconnue");
  return data.text;
}

export default function Dashboard({ session }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", stage: "Découverte", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("email");

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("priority", { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProspects();
  }, []);

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
      loadProspects();
    }
  }

  async function handleUpdateProspect(id, changes) {
    const { error } = await supabase.from("prospects").update(changes).eq("id", id);
    if (!error) loadProspects();
  }

  async function handleDeleteProspect(id) {
    const { error } = await supabase.from("prospects").delete().eq("id", id);
    if (!error) {
      setSelectedId(null);
      loadProspects();
    }
  }

  const nbActions = prospects.filter((p) => p.status === "appeler" || p.status === "retard").length;
  const nbRetard = prospects.filter((p) => p.status === "retard").length;
  const selected = prospects.find((p) => p.id === selectedId);

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "22px", letterSpacing: "0.08em" }}>PISTE</div>
          <div style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "2px" }}>{session.user.email}</div>
        </div>
        <button className="focusable" onClick={() => supabase.auth.signOut()} style={{ background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px" }}>
          Se déconnecter
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <StatCard label="Actions aujourd'hui" value={nbActions} color="var(--amber)" Icon={FlameIcon} />
        <StatCard label="En retard" value={nbRetard} color={nbRetard > 0 ? "var(--red)" : "var(--text-dim)"} Icon={AlertIcon} />
        <StatCard label="Prospects au total" value={prospects.length} color="var(--blue)" Icon={UsersIcon} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(0,1.4fr) minmax(0,1fr)" : "1fr", gap: "20px" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div className="display" style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.06em", color: "var(--text-dim)" }}>FILE DE PRIORITÉ</div>
            <button className="focusable" onClick={() => setShowForm((s) => !s)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "7px 12px", fontSize: "13px" }}>
              {showForm ? "Annuler" : "+ Ajouter un prospect"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAddProspect} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <input required placeholder="Nom du contact" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              <input required placeholder="Entreprise" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={inputStyle} />
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} style={inputStyle}>
                <option>Découverte</option>
                <option>Qualification</option>
                <option>Négociation</option>
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
            ) : (
              prospects.map((p) => {
                const meta = STATUS_META[p.status] || STATUS_META.attente;
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setTab("email"); }}
                    className="focusable"
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", width: "100%", textAlign: "left", background: isSelected ? "var(--panel2)" : "transparent", border: isSelected ? "0.5px solid var(--hairline-strong)" : "0.5px solid transparent", borderRadius: "8px" }}
                  >
                    <Avatar name={p.name} stage={p.stage} size={32} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="display" style={{ fontWeight: 500, fontSize: "14px" }}>{p.name}</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{p.company} · {p.stage}</div>
                    </div>
                    <div className="mono" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "6px", padding: "4px 8px" }}>
                      <meta.Icon size={11} color={meta.color} />
                      {meta.label}
                    </div>
                    <div className="mono" style={{ fontSize: "13px", color: "var(--blue)", width: "90px", textAlign: "right" }}>{formatEuros(p.deal_value)}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {selected && (
          <ProspectPanel
            prospect={selected}
            tab={tab}
            setTab={setTab}
            onUpdate={(changes) => handleUpdateProspect(selected.id, changes)}
            onDelete={() => handleDeleteProspect(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

function ProspectPanel({ prospect, tab, setTab, onUpdate, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Avatar name={prospect.name} stage={prospect.stage} size={42} />
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: "16px" }}>{prospect.name}</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
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
          <select value={prospect.stage} onChange={(e) => onUpdate({ stage: e.target.value })} style={{ ...selectStyle }}>
            <option>Découverte</option>
            <option>Qualification</option>
            <option>Négociation</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: "4px", marginBottom: "14px", background: "var(--panel2)", borderRadius: "8px", padding: "3px" }}>
        {[["email", "Email"], ["script", "Script"], ["analyse", "Analyse"], ["historique", "Historique"]].map(([key, label]) => (
          <button key={key} className="focusable" onClick={() => setTab(key)} style={{ flex: 1, padding: "7px 6px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, background: tab === key ? "var(--hairline)" : "transparent", color: tab === key ? "var(--text)" : "var(--text-dim)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "email" && <EmailGenerator prospect={prospect} />}
      {tab === "script" && <ScriptGenerator prospect={prospect} />}
      {tab === "analyse" && <AnalyseGenerator prospect={prospect} />}
      {tab === "historique" && <Historique prospect={prospect} />}
    </div>
  );
}

function Historique({ prospect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [emails, scripts, analyses] = await Promise.all([
        supabase.from("emails_generes").select("*").eq("prospect_id", prospect.id),
        supabase.from("scripts_appel").select("*").eq("prospect_id", prospect.id),
        supabase.from("analyses_ia").select("*").eq("prospect_id", prospect.id),
      ]);
      const all = [
        ...(emails.data || []).map((x) => ({ ...x, kind: "Email" })),
        ...(scripts.data || []).map((x) => ({ ...x, kind: `Script — ${x.section}` })),
        ...(analyses.data || []).map((x) => ({ ...x, kind: "Analyse" })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(all);
      setLoading(false);
    }
    load();
  }, [prospect.id]);

  if (loading) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>;
  if (items.length === 0) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Rien d'enregistré pour ce prospect pour l'instant.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span className="mono" style={{ fontSize: "11px", color: "var(--blue)" }}>{item.kind}</span>
            <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{formatDate(item.created_at)}</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{item.content}</div>
        </div>
      ))}
    </div>
  );
}

function EmailGenerator({ prospect }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige un email de relance court (5 à 6 phrases maximum), professionnel mais chaleureux, en français. Ne mets pas d'objet, uniquement le corps de l'email, termine par "— [Ton prénom]".

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}`;
      const text = await callAI(prompt);
      setContent(text);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("emails_generes").insert({ prospect_id: prospect.id, type: "relance", content });
  }

  return (
    <GeneratorBlock label="Générer un email de relance" loading={loading} error={error} content={content} setContent={setContent} onGenerate={generate} onSave={save} />
  );
}

function ScriptGenerator({ prospect }) {
  const [section, setSection] = useState(SCRIPT_SECTIONS[0]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Rédige la section "${section}" d'un script d'appel de vente B2B, en français, sous forme de puces courtes et actionnables (pas de phrases longues), 3 à 5 puces maximum.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}`;
      const text = await callAI(prompt);
      setContent(text);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("scripts_appel").insert({ prospect_id: prospect.id, section, content });
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

function AnalyseGenerator({ prospect }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const prompt = `Tu es un assistant commercial. Analyse ce prospect et donne, en français, deux sections claires : "Points positifs" (ce qui va dans le bon sens) et "Points à améliorer" (ce qui freine la vente), chacune en 2 à 3 puces courtes.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}`;
      const text = await callAI(prompt);
      setContent(text);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    await supabase.from("analyses_ia").insert({ prospect_id: prospect.id, type: "points_forts_faibles", content });
  }

  return (
    <GeneratorBlock label="Analyser ce prospect" loading={loading} error={error} content={content} setContent={setContent} onGenerate={generate} onSave={save} />
  );
}

function GeneratorBlock({ label, loading, error, content, setContent, onGenerate, onSave }) {
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
        <button className="focusable" onClick={handleSave} disabled={!content} style={{ background: "transparent", color: content ? "var(--text)" : "var(--text-faint)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
          {saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, Icon }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-dim)", fontSize: "11px", letterSpacing: "0.05em", marginBottom: "6px" }}>
        {Icon && <Icon size={12} color="var(--text-dim)" />}
        {label.toUpperCase()}
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: "22px", color }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "13px",
  padding: "8px 10px",
};

const selectStyle = {
  width: "100%",
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "6px",
  color: "var(--text)",
  fontSize: "12px",
  padding: "6px 8px",
};
