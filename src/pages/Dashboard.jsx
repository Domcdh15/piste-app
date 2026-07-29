import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const STATUS_META = {
  appeler: { label: "APPELER", color: "var(--amber)", dim: "var(--amber-dim)" },
  relancer: { label: "RELANCER", color: "var(--teal)", dim: "var(--teal-dim)" },
  attente: { label: "EN ATTENTE", color: "var(--text-faint)", dim: "transparent" },
  retard: { label: "EN RETARD", color: "var(--red)", dim: "var(--red-dim)" },
};

function formatEuros(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Dashboard({ session }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", stage: "Découverte", status: "attente", priority: 50, deal_value: "" });
  const [saving, setSaving] = useState(false);

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .order("priority", { ascending: false });
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

  const nbActions = prospects.filter((p) => p.status === "appeler" || p.status === "retard").length;
  const nbRetard = prospects.filter((p) => p.status === "retard").length;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: "22px", letterSpacing: "0.08em" }}>
            PISTE
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "2px" }}>
            {session.user.email}
          </div>
        </div>
        <button
          className="focusable"
          onClick={() => supabase.auth.signOut()}
          style={{ background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px" }}
        >
          Se déconnecter
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <StatCard label="Actions aujourd'hui" value={nbActions} color="var(--amber)" />
        <StatCard label="En retard" value={nbRetard} color={nbRetard > 0 ? "var(--red)" : "var(--text-dim)"} />
        <StatCard label="Prospects au total" value={prospects.length} color="var(--teal)" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
          FILE DE PRIORITÉ
        </div>
        <button
          className="focusable"
          onClick={() => setShowForm((s) => !s)}
          style={{ background: "var(--teal-dim)", color: "var(--teal)", border: "0.5px solid #2dd4bf55", borderRadius: "8px", padding: "7px 12px", fontSize: "13px" }}
        >
          {showForm ? "Annuler" : "+ Ajouter un prospect"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddProspect}
          style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "16px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}
        >
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
          <button type="submit" disabled={saving} className="focusable" style={{ gridColumn: "1 / -1", background: "var(--teal-dim)", color: "var(--teal)", border: "0.5px solid #2dd4bf55", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
            {saving ? "Enregistrement..." : "Enregistrer le prospect"}
          </button>
        </form>
      )}

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "10px" }}>
        {loading ? (
          <div style={{ color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>Chargement...</div>
        ) : prospects.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: "20px", fontSize: "13px" }}>
            Aucun prospect pour l'instant. Ajoute ton premier prospect ci-dessus.
          </div>
        ) : (
          prospects.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.attente;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", borderBottom: "0.5px solid var(--hairline)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="display" style={{ fontWeight: 500, fontSize: "14px" }}>{p.name}</div>
                  <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>{p.company} · {p.stage}</div>
                </div>
                <div className="mono" style={{ fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.dim, border: `0.5px solid ${meta.color}55`, borderRadius: "6px", padding: "4px 8px" }}>
                  {meta.label}
                </div>
                <div className="mono" style={{ fontSize: "13px", color: "var(--teal)", width: "90px", textAlign: "right" }}>
                  {formatEuros(p.deal_value)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ color: "var(--text-dim)", fontSize: "11px", letterSpacing: "0.05em", marginBottom: "6px" }}>{label.toUpperCase()}</div>
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
