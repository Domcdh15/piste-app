import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEuros, buildSignatureBlock, GearIcon, PlugIcon, PageTitle } from "../lib/ui.jsx";

const TONES = ["Professionnel", "Chaleureux", "Direct"];
const DETAIL_LEVELS = ["Court", "Équilibré", "Détaillé"];
const INITIATIVE_LEVELS = [
  { value: "Discret", desc: "Closia recommande uniquement les actions importantes." },
  { value: "Équilibré", desc: "Closia signale les opportunités et problèmes importants." },
  { value: "Proactif", desc: "Closia cherche activement les actions à effectuer." },
];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function toCSV(prospects) {
  const headers = ["Civilité", "Nom", "Entreprise", "Poste", "Email", "Téléphone", "Étape", "Statut", "Priorité", "Montant"];
  const rows = prospects.map((p) => [
    p.civility && p.civility !== "-" ? p.civility : "", p.name || "", p.company || "", p.job_title || "",
    p.email || "", p.phone || "", p.stage || "", p.status || "", p.priority ?? "", p.deal_value ?? "",
  ]);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export default function Settings({ session, prospects, settings, reloadSettings, team, reloadTeam, setActiveTab }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [local, setLocal] = useState(null);
  const [mailConnected, setMailConnected] = useState({ google: false, microsoft: false });

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  useEffect(() => {
    fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((d) => setMailConnected({ google: !!d.google, microsoft: !!d.microsoft }))
      .catch(() => {});
  }, [session.access_token]);

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

  const isAdmin = !team || team.role === "admin";
  const workDays = local.work_days || WEEKDAYS.slice(0, 5);

  function toggleWorkDay(day) {
    const next = workDays.includes(day) ? workDays.filter((d) => d !== day) : WEEKDAYS.filter((d) => d === day || workDays.includes(d));
    set({ work_days: next });
  }

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "620px" }}>
      <PageTitle icon={GearIcon} color="var(--blue)" style={{ marginBottom: "20px" }}>Paramètres</PageTitle>

      <Section title="Mon profil">
        <Field label="Prénom">
          <input value={local.first_name || ""} onChange={(e) => set({ first_name: e.target.value })} style={inputSm} placeholder="Prénom" />
        </Field>
        <Field label="Nom">
          <input value={local.last_name || ""} onChange={(e) => set({ last_name: e.target.value })} style={inputSm} placeholder="Nom" />
        </Field>
        {team && (
          <Field label="Rôle" last>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{ROLE_LABELS[team.role] || team.role}</span>
          </Field>
        )}
        {team && !isAdmin && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "-4px", marginBottom: "14px" }}>Le rôle est défini par l'administrateur de votre espace.</div>}

        <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "4px", paddingTop: "14px" }}>
          <ProfileEmailField session={session} />
        </div>

        <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: "14px", paddingTop: "14px" }}>
          <ProfilePasswordField session={session} />
        </div>
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

      <Section title="Organisation quotidienne">
        <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Créneau des tâches sans horaire</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
          <input type="time" value={local.default_task_time || "09:00"} onChange={(e) => set({ default_task_time: e.target.value })} style={inputSm} />
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>→</span>
          <input type="time" value={local.default_task_time_end || "12:00"} onChange={(e) => set({ default_task_time_end: e.target.value })} style={inputSm} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>Lorsque vous créez une tâche sans heure précise, Closia la place au début de ce créneau dans l'Agenda.</div>

        <Toggle
          label="Reporter automatiquement les tâches non terminées"
          checked={local.auto_reschedule_missed_tasks !== false}
          onChange={(v) => set({ auto_reschedule_missed_tasks: v })}
        />
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>
          {local.auto_reschedule_missed_tasks !== false ? "Report : prochain jour travaillé, 8h." : "Les tâches non terminées restent en retard sans être reportées automatiquement."}
        </div>

        <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Jours travaillés</div>
        <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
          {WEEKDAYS.map((d) => {
            const on = workDays.includes(d);
            return (
              <button key={d} className="focusable" onClick={() => toggleWorkDay(d)} style={{ width: "36px", padding: "6px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, background: on ? "var(--blue-dim)" : "var(--panel2)", color: on ? "var(--blue)" : "var(--text-faint)", border: on ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)" }}>
                {d}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>
          Une tâche non terminée en fin de journée est reportée au prochain jour travaillé (pas au samedi si vous ne travaillez pas le week-end).
        </div>

        <Field label="Vue par défaut de l'Agenda" last>
          <select value={local.agenda_default_view || "Liste"} onChange={(e) => set({ agenda_default_view: e.target.value })} style={inputSm}>
            <option value="Liste">Liste</option>
            <option value="Jour">Jour</option>
            <option value="Semaine">Semaine</option>
          </select>
        </Field>
      </Section>

      <Section title="Assistant IA">
        <Field label="Ton par défaut des emails générés">
          <select value={local.ai_default_tone} onChange={(e) => set({ ai_default_tone: e.target.value })} style={inputSm}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Niveau de détail">
          <select value={local.ai_detail_level || "Équilibré"} onChange={(e) => set({ ai_detail_level: e.target.value })} style={inputSm}>
            {DETAIL_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <div style={{ fontSize: "13px", color: "var(--text)", marginTop: "14px", marginBottom: "8px" }}>Initiative de Closia</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {INITIATIVE_LEVELS.map((lvl) => (
            <button
              key={lvl.value}
              className="focusable"
              onClick={() => set({ ai_initiative: lvl.value })}
              style={{ textAlign: "left", padding: "8px 10px", borderRadius: "8px", background: (local.ai_initiative || "Équilibré") === lvl.value ? "var(--blue-dim)" : "var(--panel2)", border: (local.ai_initiative || "Équilibré") === lvl.value ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)" }}
            >
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: (local.ai_initiative || "Équilibré") === lvl.value ? "var(--blue)" : "var(--text)" }}>{lvl.value}</div>
              <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{lvl.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Le ton et le niveau de détail s'appliquent aux emails générés par l'IA. L'initiative détermine si Closia propose spontanément une tâche de suivi après une note.</div>
      </Section>

      <Section title="Signature email">
        <Field label="Nom complet">
          <input value={local.sig_name || ""} onChange={(e) => set({ sig_name: e.target.value })} style={inputSm} placeholder="ex : Camille Martin" />
        </Field>
        <Field label="Poste">
          <input value={local.sig_job_title || ""} onChange={(e) => set({ sig_job_title: e.target.value })} style={inputSm} placeholder="ex : Responsable commercial" />
        </Field>
        <Field label="Entreprise">
          <input value={local.sig_company || ""} onChange={(e) => set({ sig_company: e.target.value })} style={inputSm} placeholder="ex : Closia" />
        </Field>
        <Field label="Téléphone (facultatif)" last>
          <input value={local.sig_phone || ""} onChange={(e) => set({ sig_phone: e.target.value })} style={inputSm} placeholder="ex : 06 12 34 56 78" />
        </Field>
        {buildSignatureBlock(local) && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "0.5px solid var(--hairline)" }}>
            <div style={{ fontSize: "10px", color: "var(--text-faint)", marginBottom: "6px" }}>APERÇU</div>
            <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-line", lineHeight: 1.5 }}>{buildSignatureBlock(local)}</div>
          </div>
        )}
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Ajoutée automatiquement à la fin des emails générés par l'IA.</div>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <button className="focusable" onClick={save} disabled={saving} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Enregistrement..." : "Enregistrer les préférences"}
        </button>
        {saved && <span style={{ color: "var(--green, #16a34a)", fontSize: "12px" }}>Enregistré ✓</span>}
      </div>

      {isAdmin && (
        <Section title="Équipe">
          <TeamPanel session={session} team={team} reloadTeam={reloadTeam} />
        </Section>
      )}

      {isAdmin && (
        <Section title="Abonnement & facturation">
          <BillingPanel local={local} session={session} team={team} />
        </Section>
      )}

      <Section title="Intégrations">
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px" }}>Connectez vos outils commerciaux (agenda, CRM, email) à Closia.</div>
        <button className="focusable" onClick={() => setActiveTab?.("integrations")} style={{ display: "flex", alignItems: "center", gap: "8px", ...btnGhost }}>
          <PlugIcon size={13} color="var(--text-dim)" /> Gérer les intégrations
        </button>
      </Section>

      {(mailConnected.google || mailConnected.microsoft) && (
        <Section title="Mode absence">
          <Toggle
            label="Activer le mode absence"
            checked={!!local.vacation_mode_enabled}
            onChange={(v) => {
              set(
                v
                  ? { vacation_mode_enabled: true, vacation_last_checked_at: new Date().toISOString(), vacation_replied_senders: [] }
                  : { vacation_mode_enabled: false }
              );
            }}
          />
          {local.vacation_mode_enabled && (
            <>
              <div style={{ fontSize: "13px", color: "var(--text)", marginTop: "12px", marginBottom: "6px" }}>Message d'accusé de réception</div>
              <textarea
                value={local.vacation_message || ""}
                onChange={(e) => set({ vacation_message: e.target.value })}
                placeholder="ex : Je suis actuellement absent(e) et de retour le..."
                rows={3}
                style={{ ...inputSm, width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
                <Field label="Date de retour">
                  <input type="date" value={local.vacation_return_at ? local.vacation_return_at.slice(0, 10) : ""} onChange={(e) => set({ vacation_return_at: e.target.value ? new Date(e.target.value).toISOString() : null })} style={{ ...inputSm, width: "100%" }} />
                </Field>
                <Field label="Collègue à contacter (nom)">
                  <input value={local.vacation_redirect_name || ""} onChange={(e) => set({ vacation_redirect_name: e.target.value })} style={{ ...inputSm, width: "100%" }} placeholder="ex : Camille Martin" />
                </Field>
              </div>
              <Field label="Email du collègue" last>
                <input type="email" value={local.vacation_redirect_email || ""} onChange={(e) => set({ vacation_redirect_email: e.target.value })} style={{ ...inputSm, width: "100%" }} placeholder="ex : camille@entreprise.fr" />
              </Field>
              <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>
                Chaque nouvel expéditeur reçoit une réponse automatique une seule fois. La boîte est vérifiée une fois par jour — ce n'est pas instantané.
              </div>
            </>
          )}
        </Section>
      )}

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

export function Section({ title, children, last }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-lg, 16px)", boxShadow: "var(--shadow-sm, 0 1px 2px rgba(15,23,42,.06))", padding: "18px", marginBottom: last ? "20px" : "16px" }}>
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

const ROLE_LABELS = { admin: "Admin", sales: "Commercial", customer_success: "Customer Success" };

export function TeamPanel({ session, team, reloadTeam }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("sales");
  const [overageInfo, setOverageInfo] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState("");

  if (!team) return <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Chargement...</div>;

  const isAdmin = team.role === "admin";

  async function call(body) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue");
      await reloadTeam?.();
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(confirmOverage) {
    if (!inviteEmail.trim()) return;
    setInviteSuccess("");
    const data = await call({ action: "invite_member", email: inviteEmail.trim(), role: inviteRole, confirmOverage });
    if (!data) return;
    if (data.needsConfirmation) {
      setOverageInfo(data);
      return;
    }
    setOverageInfo(null);
    setInviteSuccess(`Invitation envoyée à ${data.invitedEmail} — un email lui a été envoyé pour créer son mot de passe.`);
    setInviteEmail("");
    setShowInvite(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>{(team.members || []).length} membre{(team.members || []).length > 1 ? "s" : ""}</span>
        {isAdmin && (
          <button className="focusable" onClick={() => { setShowInvite((s) => !s); setOverageInfo(null); }} style={{ ...btnGhost, padding: "6px 10px" }}>
            {showInvite ? "Annuler" : "+ Ajouter un membre"}
          </button>
        )}
      </div>

      {showInvite && (
        <div style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@entreprise.fr" style={{ ...inputSm, flex: 1, minWidth: "160px", width: "auto" }} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={inputSm}>
              <option value="sales">Commercial</option>
              <option value="customer_success">Customer Success</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {overageInfo ? (
            <div style={{ background: "var(--red-dim)", border: "0.5px solid var(--red)33", borderRadius: "6px", padding: "10px", marginBottom: "8px" }}>
              <div style={{ fontSize: "12.5px", color: "var(--red)", fontWeight: 600, marginBottom: "4px" }}>Vous avez atteint votre limite de places.</div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>
                Votre abonnement {overageInfo.tier} comprend {overageInfo.seatsIncluded} place{overageInfo.seatsIncluded > 1 ? "s" : ""}. Vous en utilisez {overageInfo.seatsUsed}/{overageInfo.seatsIncluded}.
                Ajouter ce membre : <strong>+{formatEuros(overageInfo.overagePrice)}/mois</strong>.
              </div>
              <button className="focusable" disabled={busy} onClick={() => submitInvite(true)} style={{ background: "var(--red)", color: "#fff", border: "none", borderRadius: "6px", padding: "7px 12px", fontSize: "12px", fontWeight: 600 }}>
                Ajouter et augmenter mon abonnement
              </button>
            </div>
          ) : (
            <button className="focusable" disabled={busy || !inviteEmail.trim()} onClick={() => submitInvite(false)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "6px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600, opacity: busy || !inviteEmail.trim() ? 0.6 : 1 }}>
              {busy ? "Envoi..." : "Envoyer l'invitation"}
            </button>
          )}
        </div>
      )}

      {inviteSuccess && <div style={{ color: "#527a61", fontSize: "12px", marginBottom: "10px" }}>{inviteSuccess}</div>}

      {(team.members || []).map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: "0.5px solid var(--hairline)" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>
              {m.first_name || m.last_name ? `${m.first_name || ""} ${m.last_name || ""}`.trim() : m.email}
              {m.user_id === session.user.id && <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> (vous)</span>}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{m.email}</div>
          </div>
          {isAdmin ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <select
                value={m.role}
                disabled={busy}
                onChange={(e) => call({ action: "change_role", userId: m.user_id, role: e.target.value })}
                style={inputSm}
              >
                <option value="admin">Admin</option>
                <option value="sales">Commercial</option>
                <option value="customer_success">Customer Success</option>
              </select>
              <button
                className="focusable"
                disabled={busy}
                onClick={() => {
                  if (confirm("Retirer ce membre de l'équipe ?")) call({ action: "remove", userId: m.user_id });
                }}
                style={{ ...btnGhost, padding: "6px 10px" }}
              >
                Retirer
              </button>
            </div>
          ) : (
            <span style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-dim)" }}>
              {ROLE_LABELS[m.role] || m.role}
            </span>
          )}
        </div>
      ))}

      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "10px" }}>{error}</div>}

      {isAdmin && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--hairline)" }}>
          <Toggle
            label="Plusieurs commerciaux dans l'équipe"
            checked={!!team.team?.has_multiple_sales}
            onChange={(v) => call({ action: "set_team_flags", has_multiple_sales: v })}
          />
          <Toggle
            label="Plusieurs Customer Success dans l'équipe"
            checked={!!team.team?.has_multiple_csm}
            onChange={(v) => call({ action: "set_team_flags", has_multiple_csm: v })}
            last
          />
          <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>
            Active les sélecteurs "Commercial responsable" / "CSM responsable" sur les fiches prospects.
          </div>
        </div>
      )}

    </div>
  );
}

const STANDARD_PRICE = 19;

const PLAN_TIERS = [
  { name: "Solo", maxPrice: 19, seats: 1, overagePrice: 12 },
  { name: "Équipe", maxPrice: 39, seats: 3, overagePrice: 12 },
  { name: "Business", maxPrice: 79, seats: 10, overagePrice: 10 },
  { name: "Sur mesure", maxPrice: Infinity, seats: 20, overagePrice: 8 },
];

function planTierFor(price) {
  return PLAN_TIERS.find((t) => price <= t.maxPrice) || PLAN_TIERS[PLAN_TIERS.length - 1];
}

function BillingPanel({ local, session, team }) {
  if (!local) return <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Chargement...</div>;

  const memberCount = team?.members?.length || 1;
  const isTeamBilling = memberCount > 1 && team?.team;
  const billingSource = isTeamBilling ? team.team : local;

  const status = billingSource.subscription_status || "trialing";
  const trialEndsAt = billingSource.trial_ends_at ? new Date(billingSource.trial_ends_at) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / 86400000)) : null;

  const accountCreatedAt = new Date(session.user.created_at);
  const price = isTeamBilling ? (billingSource.plan_price ?? null) : (billingSource.plan_price ?? STANDARD_PRICE);

  if (isTeamBilling && price === null) {
    return (
      <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
        Tarif d'équipe ({memberCount} membres) en cours de configuration — contacte le support Closia.
      </div>
    );
  }

  return (
    <div>
      {isTeamBilling && (
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "6px" }}>
          Tarif global pour l'équipe ({memberCount} membres)
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
        <span className="display" style={{ fontSize: "22px", fontWeight: 700 }}>{price === 0 ? "Gratuit" : formatEuros(price)}</span>
        {price > 0 && <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>/ mois</span>}
        {!isTeamBilling && price === 0 && (
          <span style={{ fontSize: "10px", fontWeight: 700, background: "#eaf1ec", color: "#527a61", borderRadius: "999px", padding: "3px 9px" }}>
            ABONNEMENT OFFERT
          </span>
        )}
        {!isTeamBilling && price > 0 && price < STANDARD_PRICE && (
          <span style={{ fontSize: "10px", fontWeight: 700, background: "var(--gold-dim)", color: "var(--gold-deep)", borderRadius: "999px", padding: "3px 9px" }}>
            TARIF PRÉFÉRENTIEL
          </span>
        )}
      </div>

      {status === "trialing" && (
        <div style={{ fontSize: "12px", color: daysLeft > 0 ? "var(--text-dim)" : "var(--red)", marginBottom: "16px" }}>
          {daysLeft > 0 ? `Essai gratuit — encore ${daysLeft} jour${daysLeft > 1 ? "s" : ""}` : "Essai gratuit terminé"}
        </div>
      )}
      {status === "active" && <div style={{ fontSize: "12px", color: "#527a61", marginBottom: "16px" }}>Abonnement actif</div>}
      {status === "cancelled" && <div style={{ fontSize: "12px", color: "var(--text-faint)", marginBottom: "16px" }}>Abonnement résilié</div>}

      {isTeamBilling && (
        <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>VOTRE ABONNEMENT</div>
          {(() => {
            const tier = planTierFor(price);
            const over = memberCount > tier.seats;
            return (
              <>
                <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "4px" }}>
                  {tier.name} · <span className="mono" style={{ fontWeight: 700, color: over ? "var(--red)" : "var(--text)" }}>{memberCount} / {tier.seats}</span> places utilisées
                </div>
                {over ? (
                  <div style={{ fontSize: "11.5px", color: "var(--red)" }}>Au-delà de votre quota — contacte le support pour ajuster votre abonnement (+{formatEuros(tier.overagePrice)}/mois par place supplémentaire).</div>
                ) : (
                  <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>+{formatEuros(tier.overagePrice)}/mois par place au-delà de {tier.seats}.</div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "14px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>MOYEN DE PAIEMENT</div>
        <ComingSoon text="Aucune carte enregistrée. La saisie d'un moyen de paiement sera bientôt disponible." />
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>HISTORIQUE DE FACTURATION</div>
        {status === "active" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 12px", background: "var(--panel2)", borderRadius: "8px" }}>
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 600 }}>Facture #INV-{accountCreatedAt.getFullYear()}-001</div>
              <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{accountCreatedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} · {formatEuros(price)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: "#527a61", background: "#eaf1ec", borderRadius: "999px", padding: "3px 9px" }}>PAYÉE</span>
              <span style={{ fontSize: "11px", color: "var(--text-faint)", whiteSpace: "nowrap" }}>PDF bientôt disponible</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Aucune facture pour l'instant.</div>
        )}
      </div>
    </div>
  );
}

function ProfileEmailField({ session }) {
  const [email, setEmail] = useState(session.user.email);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!email.trim() || email === session.user.email) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSaving(false);
    setMessage(error ? error.message : "Un email de confirmation a été envoyé à la nouvelle adresse — cliquez sur le lien pour valider le changement.");
  }

  return (
    <Field label="Email" last>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputSm, width: "200px" }} />
        {email !== session.user.email && (
          <button className="focusable" onClick={save} disabled={saving} style={{ ...btnGhost, padding: "6px 10px" }}>
            {saving ? "..." : "Valider"}
          </button>
        )}
      </div>
      {message && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "6px" }}>{message}</div>}
    </Field>
  );
}

function ProfilePasswordField({ session }) {
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (password.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Mot de passe mis à jour.");
      setPassword("");
      setShowForm(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Mot de passe</div>
      {!showForm ? (
        <button className="focusable" onClick={() => setShowForm(true)} style={btnGhost}>
          Modifier le mot de passe
        </button>
      ) : (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nouveau mot de passe" style={{ ...inputSm, width: "200px" }} />
          <button className="focusable" onClick={save} disabled={saving} style={{ ...btnGhost, padding: "6px 10px" }}>
            {saving ? "..." : "Enregistrer"}
          </button>
          <button className="focusable" onClick={() => { setShowForm(false); setPassword(""); setMessage(""); }} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px" }}>
            Annuler
          </button>
        </div>
      )}
      {message && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "6px" }}>{message}</div>}
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
