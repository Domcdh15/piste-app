import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  STATUS_META,
  SCRIPT_SECTIONS,
  formatEuros,
  formatDate,
  formatShortDate,
  isOverdue,
  callAI,
  Avatar,
  SparklesIcon,
  CalendarIcon,
  inputStyle,
  selectStyle,
} from "../lib/ui.jsx";

export default function Pipeline({ prospects, loading, reload, session }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", stage: "Découverte", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("email");

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

  const selected = prospects.find((p) => p.id === selectedId);

  return (
    <div style={{ padding: "28px 32px 48px" }}>
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
