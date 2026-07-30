import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEuros } from "../lib/ui.jsx";

const TONES = ["Professionnel", "Chaleureux", "Direct"];

function toCSV(prospects) {
  const headers = ["Civilité", "Nom", "Entreprise", "Poste", "Email", "Téléphone", "Étape", "Statut", "Priorité", "Montant"];
  const rows = prospects.map((p) => [
    p.civility && p.civility !== "-" ? p.civility : "", p.name || "", p.company || "", p.job_title || "",
    p.email || "", p.phone || "", p.stage || "", p.status || "", p.priority ?? "", p.deal_value ?? "",
  ]);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export default function Settings({ session, prospects, settings, reloadSettings }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [local, setLocal] = useState(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  function set(patch) {
    setLocal((l) => ({ ...l, ...patch }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, ...local });
    setSaving(false);
    setSaved(true);
    reloadSettings?.();
    setTimeout(() => setSaved(false), 2000);
  }

  function exportCSV() {
    const csv = toCSV(prospects || []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piste-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!local) return <div style={{ padding: "28px 32px" }}>Chargement...</div>;

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "620px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "20px" }}>⚙️ Paramètres</div>

      <Section title="Profil">
        <div style={{ fontSize: "14px", marginBottom: "2px" }}>{session.user.email}</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12px", marginBottom: "12px" }}>Connecté via Supabase</div>
        <button
          className="focusable"
          onClick={async () => {
            await supabase.auth.resetPasswordForEmail(session.user.email);
            alert("Un email de réinitialisation du mot de passe vous a été envoyé.");
          }}
          style={btnGhost}
        >
          Changer le mot de passe
        </button>
      </Section>

      <Section title="Notifications">
        <Toggle label="Alertes urgentes (relances en retard, deals à risque)" checked={local.notif_urgent_alerts} onChange={(v) => set({ notif_urgent_alerts: v })} />
        <Toggle label="Prospects chauds détectés par l'IA" checked={local.notif_hot_leads} onChange={(v) => set({ notif_hot_leads: v })} />
        <Toggle label="Récapitulatif quotidien par email" checked={local.notif_daily_recap} onChange={(v) => set({ notif_daily_recap: v })} last />
      </Section>

      <Section title="Objectifs commerciaux">
        <Field label="Objectif de CA mensuel (€)">
          <input type="number" value={local.objective_monthly_revenue ?? ""} onChange={(e) => set({ objective_monthly_revenue: e.target.value ? Number(e.target.value) : null })} style={inputSm} placeholder="ex : 20000" />
        </Field>
        <Field label="Objectif de deals gagnés / mois" last>
          <input type="number" value={local.objective_monthly_deals ?? ""} onChange={(e) => set({ objective_monthly_deals: e.target.value ? Number(e.target.value) : null })} style={inputSm} placeholder="ex : 5" />
        </Field>
        {local.objective_monthly_revenue ? (
          <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Soit {formatEuros(local.objective_monthly_revenue)} de CA visé ce mois-ci.</div>
        ) : null}
      </Section>

      <Section title="Assistant IA">
        <Field label="Ton par défaut des emails générés">
          <select value={local.ai_default_tone} onChange={(e) => set({ ai_default_tone: e.target.value })} style={inputSm}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Signature utilisée en fin de mail" last>
          <input value={local.ai_signature} onChange={(e) => set({ ai_signature: e.target.value })} style={inputSm} placeholder="ex : Camille Martin" />
        </Field>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Ces préférences s'appliquent aux prochains emails générés par l'IA (Assistant &amp; fiches prospect).</div>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <button className="focusable" onClick={save} disabled={saving} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Enregistrement..." : "Enregistrer les préférences"}
        </button>
        {saved && <span style={{ color: "var(--green, #16a34a)", fontSize: "12px" }}>Enregistré ✓</span>}
      </div>

      <Section title="Équipe">
        <ComingSoon text="Invitez des coéquipiers et partagez votre pipeline. Nécessite un espace multi-utilisateur, pas encore disponible sur Piste." />
      </Section>

      <Section title="Permissions">
        <ComingSoon text="Gestion fine des rôles (admin, commercial, lecture seule) — arrivera avec l'espace multi-utilisateur." />
      </Section>

      <Section title="Facturation">
        <ComingSoon text="Gestion de l'abonnement et des moyens de paiement. Voir aussi l'intégration Stripe dans Intégrations." />
      </Section>

      <Section title="Données et export" last>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px" }}>Exportez l'ensemble de vos prospects et clients au format CSV.</div>
        <button className="focusable" onClick={exportCSV} style={btnGhost}>
          Exporter mes prospects (CSV)
        </button>
      </Section>

      <button
        className="focusable"
        onClick={() => supabase.auth.signOut()}
        style={{ background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55", borderRadius: "8px", padding: "9px 14px", fontSize: "13px" }}
      >
        Se déconnecter
      </button>
    </div>
  );
}

function Section({ title, children, last }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", marginBottom: last ? "20px" : "16px" }}>
      <div style={{ color: "var(--text-faint)", fontSize: "10px", fontWeight: 700, marginBottom: "12px", letterSpacing: "0.03em" }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Field({ label, children, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: last ? 0 : "10px" }}>
      <div style={{ fontSize: "13px", color: "var(--text)" }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: last ? 0 : "10px" }}>
      <div style={{ fontSize: "13px", color: "var(--text)" }}>{label}</div>
      <button
        className="focusable"
        onClick={() => onChange(!checked)}
        style={{ width: "38px", height: "22px", borderRadius: "11px", background: checked ? "var(--blue)" : "var(--hairline)", position: "relative", flexShrink: 0, border: "none" }}
      >
        <span style={{ position: "absolute", top: "2px", left: checked ? "18px" : "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
      </button>
    </div>
  );
}

function ComingSoon({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{text}</div>
      <span style={{ fontSize: "11px", padding: "5px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>Bientôt disponible</span>
    </div>
  );
}

const btnGhost = { background: "var(--panel2)", color: "var(--text)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 14px", fontSize: "13px" };
const inputSm = { background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "6px", color: "var(--text)", fontSize: "13px", padding: "6px 10px", width: "140px" };
