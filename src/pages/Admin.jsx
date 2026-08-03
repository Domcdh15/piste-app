import { useEffect, useState } from "react";
import { formatEuros, formatDate, PageTitle, BriefcaseIcon, CheckIcon } from "../lib/ui.jsx";

const STATUS_OPTIONS = [
  { value: "trialing", label: "Essai", color: "var(--blue)", dim: "var(--blue-dim)" },
  { value: "active", label: "Actif", color: "#0ea968", dim: "#e2f7ec" },
  { value: "cancelled", label: "Résilié", color: "var(--text-faint)", dim: "var(--panel2)" },
];

const CONTACT_PREF_LABEL = { rdv: "RDV souhaité", email: "Rappel par email" };

export default function Admin({ session }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("leads");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error((await res.json()).error || "Chargement impossible");
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleContacted(lead) {
    setData((d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, contacted: !l.contacted } : l)) }));
    await fetch("/api/admin/update-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: lead.id, contacted: !lead.contacted }),
    });
  }

  async function updateUser(userId, patch) {
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)) }));
    await fetch("/api/admin/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId, ...patch }),
    });
  }

  return (
    <div style={{ padding: "28px 32px 48px", maxWidth: "1000px" }}>
      <PageTitle icon={BriefcaseIcon} color="#0369a1" style={{ marginBottom: "4px" }}>Back office</PageTitle>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "20px" }}>Gestion des leads et des comptes clients Closia.</div>

      <div style={{ display: "flex", gap: "4px", background: "var(--panel2)", borderRadius: "8px", padding: "3px", marginBottom: "20px", width: "fit-content" }}>
        {[["leads", `Leads${data ? ` (${data.leads.length})` : ""}`], ["users", `Clients${data ? ` (${data.users.length})` : ""}`]].map(([key, label]) => (
          <button key={key} className="focusable" onClick={() => setTab(key)} style={{ padding: "7px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: tab === key ? 600 : 500, background: tab === key ? "var(--bg)" : "transparent", color: tab === key ? "var(--blue)" : "var(--text-dim)", boxShadow: tab === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Chargement...</div>
      ) : error ? (
        <div style={{ color: "var(--red)", fontSize: "13px" }}>{error}</div>
      ) : tab === "leads" ? (
        <LeadsTable leads={data.leads} onToggleContacted={toggleContacted} />
      ) : (
        <UsersTable users={data.users} onUpdate={updateUser} />
      )}
    </div>
  );
}

function LeadsTable({ leads, onToggleContacted }) {
  if (leads.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: "13px" }}>Aucun lead pour l'instant.</div>;
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", overflow: "hidden" }}>
      {leads.map((l) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: "0.5px solid var(--hairline)", opacity: l.contacted ? 0.6 : 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>
              {l.first_name || l.name ? `${l.first_name || l.name} ${l.last_name || ""}`.trim() : l.email}
              {l.company && <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · {l.company}</span>}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              {l.email}
              {l.industry && ` · ${l.industry}`}
              {l.contact_preference && ` · ${CONTACT_PREF_LABEL[l.contact_preference] || l.contact_preference}`}
            </div>
            {l.message && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>{l.message}</div>}
          </div>
          <span className="mono" style={{ fontSize: "11px", color: "var(--text-faint)", flexShrink: 0 }}>{formatDate(l.created_at)}</span>
          <button
            className="focusable"
            onClick={() => onToggleContacted(l)}
            style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "5px 10px", borderRadius: "6px", flexShrink: 0, background: l.contacted ? "#e2f7ec" : "var(--panel2)", color: l.contacted ? "#0ea968" : "var(--text-dim)", border: "0.5px solid " + (l.contacted ? "#0ea96855" : "var(--hairline)") }}
          >
            {l.contacted ? <CheckIcon size={11} color="#0ea968" /> : null}
            {l.contacted ? "Recontacté" : "À recontacter"}
          </button>
        </div>
      ))}
    </div>
  );
}

function UsersTable({ users, onUpdate }) {
  if (users.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: "13px" }}>Aucun compte pour l'instant.</div>;
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", overflow: "hidden" }}>
      {users.map((u) => {
        const status = STATUS_OPTIONS.find((s) => s.value === u.subscription_status) || STATUS_OPTIONS[0];
        return (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: "0.5px solid var(--hairline)", opacity: u.banned ? 0.5 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>
                {u.first_name || u.last_name ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : u.email}
                {u.company_name && <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · {u.company_name}</span>}
                {u.banned && <span style={{ color: "var(--red)", fontWeight: 700, fontSize: "10px", marginLeft: "8px" }}>DÉSACTIVÉ</span>}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {u.email} · inscrit le {formatDate(u.created_at)}
                {u.plan_price != null && ` · ${formatEuros(u.plan_price)}/mois`}
                {u.trial_ends_at && u.subscription_status === "trialing" && ` · essai jusqu'au ${formatDate(u.trial_ends_at)}`}
              </div>
            </div>
            <select
              value={status.value}
              onChange={(e) => onUpdate(u.id, { subscription_status: e.target.value })}
              style={{ fontSize: "11px", fontWeight: 600, padding: "5px 8px", borderRadius: "6px", background: status.dim, color: status.color, border: `0.5px solid ${status.color}55`, flexShrink: 0 }}
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              className="focusable"
              onClick={() => onUpdate(u.id, { banned: !u.banned })}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "5px 10px", borderRadius: "6px", flexShrink: 0, background: u.banned ? "var(--blue-dim)" : "var(--red-dim)", color: u.banned ? "var(--blue)" : "var(--red)", border: "0.5px solid " + (u.banned ? "#2563eb55" : "var(--red)55") }}
            >
              {u.banned ? "Réactiver" : "Désactiver"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
