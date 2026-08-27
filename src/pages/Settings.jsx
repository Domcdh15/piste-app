import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEuros, buildSignatureBlock, PlugIcon } from "../lib/ui.jsx";

const TONES = ["Professionnel", "Chaleureux", "Direct"];
const DETAIL_LEVELS = ["Court", "Équilibré", "Détaillé"];
const INITIATIVE_LEVELS = [
  { value: "Discret", desc: "Closia recommande uniquement les actions importantes." },
  { value: "Équilibré", desc: "Closia signale les opportunités et problèmes importants." },
  { value: "Proactif", desc: "Closia cherche activement les actions à effectuer." },
];
// Rubriques dont les champs passent par `set` et ont donc besoin du bouton Enregistrer.
const SAVEABLE = ["profil", "notifications", "objectifs", "organisation", "ia"];

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
  const [active, setActive] = useState("profil");

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

  // L'invariant « aucun prospect sans prochaine action » est un outil de management :
  // il n'a de sens qu'à partir de la formule Équipe, où l'admin l'impose à toute l'équipe.
  const memberCount = team?.members?.length || 1;
  const teamPlanPrice = Number((memberCount > 1 && team?.team ? team.team?.plan_price : local?.plan_price) || 0);
  const hasTeamControls = teamPlanPrice >= 39;

  // Les rubriques réservées à l'administrateur disparaissent de la navigation
  // plutôt que de s'afficher vides.
  const navItems = [
    { key: "profil", label: "Mon profil", icon: "👤" },
    { key: "notifications", label: "Notifications", icon: "🔔" },
    { key: "objectifs", label: "Objectifs commerciaux", icon: "🎯" },
    { key: "organisation", label: "Organisation quotidienne", icon: "📅" },
    { key: "ia", label: "Assistant IA", icon: "✨" },
    isAdmin && { key: "equipe", label: "Équipe", icon: "👥" },
    { key: "entreprise", label: "Informations entreprise", icon: "🏢" },
    isAdmin && { key: "abonnement", label: "Abonnement", icon: "💳" },
    { key: "integrations", label: "Intégrations", icon: "🔗" },
    { key: "support", label: "Aide & support", icon: "❓" },
  ].filter(Boolean);

  const workDays = local.work_days || WEEKDAYS.slice(0, 5);

  function toggleWorkDay(day) {
    const next = workDays.includes(day) ? workDays.filter((d) => d !== day) : WEEKDAYS.filter((d) => d === day || workDays.includes(d));
    set({ work_days: next });
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <div style={{ padding: "32px 32px 0" }}>
        <div className="hero-card" style={{ padding: "26px 32px" }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="h2" style={{ color: "#fff" }}>Paramètres</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "13px", marginTop: "4px" }}>
              Gérez votre compte, votre équipe et vos préférences Closia.
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "22px 32px 60px", maxWidth: "1080px" }}>
        {/* Navigation compacte sur mobile, latérale sur desktop */}
        <div className="settings-mobile-nav" style={{ marginBottom: "16px" }}>
          <select value={active} onChange={(e) => setActive(e.target.value)} style={{ ...inputSm, width: "100%" }}>
            {navItems.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
          </select>
        </div>

        <div className="settings-grid">
          <nav className="settings-nav">
            {navItems.map((n) => (
              <button
                key={n.key}
                className="focusable"
                onClick={() => setActive(n.key)}
                style={{
                  display: "flex", alignItems: "center", gap: "9px", width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: "9px", border: "none", fontSize: "13px",
                  fontWeight: active === n.key ? 600 : 500,
                  background: active === n.key ? "var(--blue-dim)" : "transparent",
                  color: active === n.key ? "var(--blue)" : "var(--text-dim)",
                }}
              >
                <span style={{ width: "16px", textAlign: "center" }}>{n.icon}</span> {n.label}
              </button>
            ))}
          </nav>

          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0" }}>
            {active === "profil" && (
              <>
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
              </>
            )}

            {active === "notifications" && (
              <>
      <Section title="Notifications">
        <Toggle label="Alertes urgentes (relances en retard, deals à risque)" checked={local.notif_urgent_alerts} onChange={(v) => set({ notif_urgent_alerts: v })} />
        <Toggle label="Prospects chauds détectés par l'IA" checked={local.notif_hot_leads} onChange={(v) => set({ notif_hot_leads: v })} />
        <Toggle label="Récapitulatif quotidien par email" checked={local.notif_daily_recap} onChange={(v) => set({ notif_daily_recap: v })} last />
      </Section>
              </>
            )}

            {active === "objectifs" && (
              <>
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
                <ObjectivesProgress local={local} prospects={prospects} />
              </>
            )}

            {active === "organisation" && (
              <>
      <Section title="Organisation quotidienne">
        <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Créneau des tâches sans horaire</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
          <input type="time" value={local.default_task_time || "09:00"} onChange={(e) => set({ default_task_time: e.target.value })} style={inputSm} />
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>→</span>
          <input type="time" value={local.default_task_time_end || "12:00"} onChange={(e) => set({ default_task_time_end: e.target.value })} style={inputSm} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>Lorsque vous créez une tâche sans heure précise, Closia la place au début de ce créneau dans l'Agenda.</div>

        <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Journée de travail</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
          <input type="time" value={local.work_start || "08:00"} onChange={(e) => set({ work_start: e.target.value })} style={inputSm} />
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>→</span>
          <input type="time" value={local.work_end || "19:00"} onChange={(e) => set({ work_end: e.target.value })} style={inputSm} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>
          L'Agenda se concentre sur ce créneau et sur vos jours travaillés. Un rendez-vous placé en dehors
          reste visible : la grille s'étend pour l'inclure plutôt que de le masquer.
        </div>

        <Toggle
          label="Reporter automatiquement les tâches non terminées"
          checked={local.auto_reschedule_missed_tasks !== false}
          onChange={(v) => set({ auto_reschedule_missed_tasks: v })}
        />
        {local.auto_reschedule_missed_tasks !== false ? (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "8px" }}>
              Report au prochain jour travaillé. À quelle heure ?
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={local.reschedule_mode || "fixed"}
                onChange={(e) => set({ reschedule_mode: e.target.value })}
                style={{ ...inputSm, width: "auto" }}
              >
                <option value="fixed">À partir d'un horaire que je choisis</option>
                <option value="same_time">À son heure d'origine</option>
              </select>
              {local.reschedule_mode !== "same_time" && (
                <input type="time" value={local.reschedule_time || "08:00"} onChange={(e) => set({ reschedule_time: e.target.value })} style={inputSm} />
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "8px", lineHeight: 1.5 }}>
              {local.reschedule_mode !== "same_time"
                ? "Les tâches oubliées repartent à partir de cet horaire, espacées les unes des autres pour rester lisibles. Elles ne viennent pas se poser sur vos rendez-vous déjà pris."
                : "Un appel manqué de 14h revient à 14h. Au risque de tomber sur un rendez-vous entre-temps ajouté au même moment."}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "16px" }}>
            Les tâches non terminées restent en retard sans être reportées automatiquement.
          </div>
        )}

        <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>Jours travaillés</div>
        <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
          {WEEKDAYS.map((d) => {
            const on = workDays.includes(d);
            return (
              <button key={d} className="focusable" onClick={() => toggleWorkDay(d)} style={{ width: "36px", padding: "6px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, background: on ? "var(--blue-dim)" : "var(--panel2)", color: on ? "var(--blue)" : "var(--text-faint)", border: on ? "0.5px solid #147ff555" : "0.5px solid var(--hairline)" }}>
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
              </>
            )}

            {active === "ia" && (
              <>
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
              style={{ textAlign: "left", padding: "8px 10px", borderRadius: "8px", background: (local.ai_initiative || "Équilibré") === lvl.value ? "var(--blue-dim)" : "var(--panel2)", border: (local.ai_initiative || "Équilibré") === lvl.value ? "0.5px solid #147ff555" : "0.5px solid var(--hairline)" }}
            >
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: (local.ai_initiative || "Équilibré") === lvl.value ? "var(--blue)" : "var(--text)" }}>{lvl.value}</div>
              <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{lvl.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Le ton et le niveau de détail s'appliquent aux emails générés par l'IA. L'initiative détermine si Closia propose spontanément une tâche de suivi après une note.</div>
      </Section>

      {false && (
        <Section title="Signature email">
          <Toggle label="Activer la signature" checked={local.sig_enabled !== false} onChange={(v) => set({ sig_enabled: v })} />
          {local.sig_enabled !== false && (
            <>
              <GmailSignatureImport local={local} set={set} session={session} mailConnected={mailConnected} />
              <Field label="Nom complet">
                <input value={local.sig_name || ""} onChange={(e) => set({ sig_name: e.target.value })} style={inputSm} placeholder="ex : Camille Martin" />
              </Field>
              <Field label="Poste">
                <input value={local.sig_job_title || ""} onChange={(e) => set({ sig_job_title: e.target.value })} style={inputSm} placeholder="ex : Responsable commercial" />
              </Field>
              <Field label="Entreprise">
                <input value={local.sig_company || ""} onChange={(e) => set({ sig_company: e.target.value })} style={inputSm} placeholder="ex : Closia" />
              </Field>
              <Field label="Téléphone (facultatif)">
                <input value={local.sig_phone || ""} onChange={(e) => set({ sig_phone: e.target.value })} style={inputSm} placeholder="ex : 06 12 34 56 78" />
              </Field>
              <Field label="Signature personnalisée (facultatif)" last>
                <textarea
                  value={local.sig_custom_text || ""}
                  onChange={(e) => set({ sig_custom_text: e.target.value })}
                  style={{ ...inputSm, width: "320px", height: "80px", resize: "vertical", fontFamily: "inherit" }}
                  placeholder="Si rempli, remplace les champs ci-dessus."
                />
              </Field>
              {buildSignatureBlock(local) && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "0.5px solid var(--hairline)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-faint)", marginBottom: "6px" }}>APERÇU</div>
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-line", lineHeight: 1.5 }}>{buildSignatureBlock(local)}</div>
                </div>
              )}
              <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px" }}>Ajoutée automatiquement à la fin des emails générés par l'IA.</div>

              <SignatureMailSync local={local} session={session} mailConnected={mailConnected} />
            </>
          )}
        </Section>
      )}
              </>
            )}

            {active === "equipe" && (
              <>
      {isAdmin && (
        <Section title="Équipe">
          <TeamPanel session={session} team={team} reloadTeam={reloadTeam} hasTeamControls={hasTeamControls} mailConnected={mailConnected} />
        </Section>
      )}
              </>
            )}

            {active === "entreprise" && (
              <>
      <Section title="Informations légales de l'entreprise">
        <CompanyPanel session={session} team={team} reloadTeam={reloadTeam} local={local} />
      </Section>
              </>
            )}

            {active === "abonnement" && (
              <>
      {isAdmin && (
        <Section title="Abonnement & facturation">
          <BillingPanel local={local} session={session} team={team} reloadSettings={reloadSettings} reloadTeam={reloadTeam} />
        </Section>
      )}
              </>
            )}

            {active === "integrations" && (
              <>
      <Section title="Intégrations">
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px" }}>Connectez vos outils commerciaux (agenda, CRM, email) à Closia.</div>
        <button className="focusable" onClick={() => setActiveTab?.("integrations")} style={{ display: "flex", alignItems: "center", gap: "8px", ...btnGhost }}>
          <PlugIcon size={13} color="var(--text-dim)" /> Gérer les intégrations
        </button>
      </Section>
              </>
            )}

            {active === "support" && (
              <>
      <Section title="Support">
        <SupportPanel session={session} />
      </Section>
              </>
            )}

        {SAVEABLE.includes(active) && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <button className="focusable" onClick={save} disabled={saving} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved && <span style={{ color: "#16a34a", fontSize: "12.5px", fontWeight: 600 }}>Modifications enregistrées ✓</span>}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Progression réelle du mois en cours, calculée sur les deals gagnés.
function ObjectivesProgress({ local, prospects }) {
  const targetRevenue = local.objective_monthly_revenue || null;
  const targetDeals = local.objective_monthly_deals || null;
  if (!targetRevenue && !targetDeals) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = (prospects || []).filter((p) => p.stage === "Gagné" && p.closed_at && new Date(p.closed_at) >= monthStart);
  const revenue = wonThisMonth.reduce((sum, p) => sum + (p.deal_value || 0), 0);

  const Bar = ({ label, current, target, format }) => {
    if (!target) return null;
    const pct = Math.min(100, Math.round((current / target) * 100));
    return (
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "5px" }}>
          <span style={{ color: "var(--text-dim)" }}>{label}</span>
          <span className="mono" style={{ color: "var(--text)" }}>{format(current)} / {format(target)}</span>
        </div>
        <div style={{ height: "8px", background: "var(--panel2)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue)", borderRadius: "4px" }} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>{pct} % de l'objectif du mois</div>
      </div>
    );
  };

  return (
    <Section title="Progression du mois">
      <Bar label="Chiffre d'affaires" current={revenue} target={targetRevenue} format={(v) => formatEuros(v)} />
      <Bar label="Deals gagnés" current={wonThisMonth.length} target={targetDeals} format={(v) => String(v)} />
      <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
        Calculé sur les opportunités passées en « Gagné » depuis le 1<sup>er</sup> du mois.
      </div>
    </Section>
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


// L'identité de facturation appartient à l'entreprise : l'admin la fixe une
// fois, l'équipe entière l'utilise sur ses devis sans pouvoir la modifier.
function CompanyPanel({ session, team, reloadTeam, local }) {
  const source = team?.team || local || {};
  const isAdmin = !team || team.role === "admin";
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft({
      company_name: source.company_name || "",
      billing_address: source.billing_address || "",
      billing_postal_code: source.billing_postal_code || "",
      billing_city: source.billing_city || "",
      siret: source.siret || "",
      vat_exempt: !!source.vat_exempt,
      vat_number: source.vat_number || "",
      vat_rate: source.vat_rate ?? 20,
      devis_validity_days: source.devis_validity_days ?? 30,
      devis_payment_terms: source.devis_payment_terms || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.team]);

  if (!draft) return <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Chargement…</div>;

  function edit(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "set_company", ...draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'enregistrement a échoué");
      setSaved(true);
      reloadTeam?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    const ROWS = [
      ["Raison sociale", draft.company_name],
      ["Adresse", [draft.billing_address, [draft.billing_postal_code, draft.billing_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
      ["SIRET", draft.siret],
      ["TVA", draft.vat_exempt ? "Franchise de TVA" : [draft.vat_number, draft.vat_rate != null ? `${draft.vat_rate} %` : null].filter(Boolean).join(" · ")],
      ["Validité des devis", draft.devis_validity_days ? `${draft.devis_validity_days} jours` : null],
      ["Conditions de paiement", draft.devis_payment_terms],
    ];
    return (
      <div>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px", lineHeight: 1.55 }}>
          Ces informations apparaissent sur les devis que vous envoyez. Elles engagent l'entreprise :
          seul l'administrateur de votre espace peut les modifier.
        </div>
        {ROWS.map(([label, value]) => (
          <div key={label} style={{ display: "flex", gap: "12px", padding: "9px 0", borderBottom: "0.5px solid var(--hairline)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-faint)", width: "170px", flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: "13px", color: value ? "var(--text)" : "var(--text-faint)" }}>{value || "Non renseigné"}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px", lineHeight: 1.55 }}>
        Ces informations apparaissent sur les devis de toute l'équipe. Sans elles, le document reste incomplet.
        Vos coéquipiers les voient sans pouvoir les modifier.
      </div>
      <Field label="Raison sociale">
        <input value={draft.company_name} onChange={(e) => edit({ company_name: e.target.value })} style={inputSm} placeholder="Nom de votre entreprise" />
      </Field>
      <Field label="Adresse">
        <input value={draft.billing_address} onChange={(e) => edit({ billing_address: e.target.value })} style={inputSm} placeholder="12 rue de la République" />
      </Field>
      <Field label="Code postal">
        <input value={draft.billing_postal_code} onChange={(e) => edit({ billing_postal_code: e.target.value })} style={inputSm} placeholder="69002" />
      </Field>
      <Field label="Ville">
        <input value={draft.billing_city} onChange={(e) => edit({ billing_city: e.target.value })} style={inputSm} placeholder="Lyon" />
      </Field>
      <Field label="SIRET">
        <input value={draft.siret} onChange={(e) => edit({ siret: e.target.value })} style={inputSm} placeholder="123 456 789 00012" />
      </Field>
      <Field label="Franchise de TVA">
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-dim)" }}>
          <input type="checkbox" checked={draft.vat_exempt} onChange={(e) => edit({ vat_exempt: e.target.checked })} />
          L'entreprise ne facture pas la TVA (micro-entreprise)
        </label>
      </Field>
      {!draft.vat_exempt && (
        <>
          <Field label="N° TVA intracom.">
            <input value={draft.vat_number} onChange={(e) => edit({ vat_number: e.target.value })} style={inputSm} placeholder="FR12345678901" />
          </Field>
          <Field label="Taux de TVA (%)">
            <input type="number" min="0" max="100" step="0.1" value={draft.vat_rate ?? 20} onChange={(e) => edit({ vat_rate: e.target.value === "" ? null : Number(e.target.value) })} style={inputSm} />
          </Field>
        </>
      )}
      <Field label="Validité des devis">
        <input type="number" min="1" value={draft.devis_validity_days ?? 30} onChange={(e) => edit({ devis_validity_days: e.target.value === "" ? null : Number(e.target.value) })} style={inputSm} placeholder="30" />
      </Field>
      <Field label="Conditions de paiement" last>
        <input value={draft.devis_payment_terms} onChange={(e) => edit({ devis_payment_terms: e.target.value })} style={inputSm} placeholder="Paiement à 30 jours à réception de facture" />
      </Field>

      {error && <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "10px" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
        <button className="btn-primary focusable" onClick={save} disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && <span style={{ fontSize: "12px", color: "var(--success)", fontWeight: 600 }}>Enregistré</span>}
      </div>
    </div>
  );
}

const ROLE_LABELS = { admin: "Admin", sales: "Commercial", customer_success: "Customer Success" };

const VISIBILITY_HINT = {
  own: "Chacun ne voit que son propre travail. À choisir si la comparaison entre commerciaux vous semble contre-productive.",
  team_aggregate: "Chacun situe son travail dans celui de l'équipe, sans savoir qui a fait quoi.",
  team_detail: "Chacun voit le classement nominatif. Motivant dans une équipe soudée, pesant ailleurs.",
};

export function TeamPanel({ session, team, reloadTeam, hasTeamControls, mailConnected }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("sales");
  const [overageInfo, setOverageInfo] = useState(null);
  // L'invitation produit un lien : on le garde sous la main tant que l'admin
  // ne l'a pas transmis, par copie ou depuis sa propre boîte.
  const [invited, setInvited] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mailState, setMailState] = useState("");

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
    setInvited(null);
    setMailState("");
    setCopied(false);
    const data = await call({ action: "invite_member", email: inviteEmail.trim(), role: inviteRole, confirmOverage });
    if (!data) return;
    if (data.needsConfirmation) {
      setOverageInfo(data);
      return;
    }
    setOverageInfo(null);
    setInvited({ email: data.invitedEmail, link: data.inviteLink });
    setInviteEmail("");
    setShowInvite(false);
  }

  const mailProvider = mailConnected?.google ? "google" : mailConnected?.microsoft ? "microsoft" : null;

  async function sendInviteByEmail() {
    if (!invited?.link || !mailProvider) return;
    setMailState("sending");
    const me = (team.members || []).find((m) => m.user_id === session.user.id);
    const signer = me && (me.first_name || me.last_name) ? `${me.first_name || ""} ${me.last_name || ""}`.trim() : "";
    const company = team.team?.company_name || team.team?.name || "notre équipe";
    const lines = [
      "Bonjour,",
      "",
      "Je vous invite à rejoindre notre espace Closia.",
      "",
      "Cliquez sur ce lien pour créer votre mot de passe et accéder à votre compte :",
      invited.link,
      "",
      "À bientôt,",
      signer,
    ];
    try {
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: "send_email",
          provider: mailProvider,
          to: invited.email,
          subject: `Rejoignez ${company} sur Closia`,
          body: lines.join("\n").trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'envoi a échoué");
      setMailState("sent");
    } catch (e) {
      setMailState(e.message || "L'envoi a échoué");
    }
  }

  async function copyInviteLink() {
    if (!invited?.link) return;
    try {
      await navigator.clipboard.writeText(invited.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMailState("La copie automatique a échoué — sélectionnez le lien à la main.");
    }
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
            <button className="focusable" disabled={busy || !inviteEmail.trim()} onClick={() => submitInvite(false)} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "6px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600, opacity: busy || !inviteEmail.trim() ? 0.6 : 1 }}>
              {busy ? "Création…" : "Créer l'invitation"}
            </button>
          )}
        </div>
      )}

      {invited && (
        <div style={{ background: "var(--blue-dim)", border: "0.5px solid #147ff555", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)", marginBottom: "3px" }}>
            Compte créé pour {invited.email}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-dim)", marginBottom: "10px", lineHeight: 1.5 }}>
            Transmettez-lui ce lien : il y créera son mot de passe, puis réglera son espace Closia.
          </div>

          <input
            readOnly
            value={invited.link || ""}
            onClick={(e) => e.target.select()}
            style={{ ...inputSm, width: "100%", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", marginBottom: "9px" }}
          />

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button className="focusable" onClick={copyInviteLink} style={{ background: "var(--panel)", color: "var(--blue)", border: "0.5px solid #147ff555", borderRadius: "6px", padding: "7px 12px", fontSize: "12px", fontWeight: 600 }}>
              {copied ? "Lien copié" : "Copier le lien"}
            </button>

            {mailProvider ? (
              <button className="focusable" disabled={mailState === "sending" || mailState === "sent"} onClick={sendInviteByEmail} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "6px", padding: "7px 12px", fontSize: "12px", fontWeight: 600, opacity: mailState === "sending" ? 0.6 : 1 }}>
                {mailState === "sending" ? "Envoi…" : mailState === "sent" ? "Envoyé" : `Envoyer depuis ${mailProvider === "google" ? "Gmail" : "Outlook"}`}
              </button>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                Connectez Gmail ou Outlook pour l'envoyer directement d'ici.
              </span>
            )}

            <button className="focusable" onClick={() => { setInvited(null); setMailState(""); }} style={{ background: "none", border: "none", padding: 0, fontSize: "11.5px", color: "var(--text-faint)", fontWeight: 500, marginLeft: "auto" }}>
              Terminé
            </button>
          </div>

          {mailState && mailState !== "sending" && mailState !== "sent" && (
            <div style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "8px" }}>{mailState}</div>
          )}
          {mailState === "sent" && (
            <div style={{ fontSize: "11.5px", color: "var(--success)", marginTop: "8px" }}>
              Invitation envoyée depuis votre boîte — elle arrivera à votre nom, pas à celui d'un robot.
            </div>
          )}
        </div>
      )}

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

      {isAdmin && hasTeamControls && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--hairline)" }}>
          <Toggle
            label="Aucun prospect sans prochaine action"
            checked={!!team.team?.require_next_action}
            onChange={(v) => call({ action: "set_team_flags", require_next_action: v })}
            last
          />
          <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "10px", lineHeight: 1.5 }}>
            S'applique à toute l'équipe. Une fiche en cours ne peut plus être quittée sans qu'une prochaine
            action soit planifiée — ou que le prospect soit explicitement clos. C'est la règle qui empêche
            un deal de s'endormir.
          </div>

          <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "0.5px solid var(--hairline)" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "3px" }}>
              Ce que les commerciaux voient des résultats de l'équipe
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-faint)", marginBottom: "9px", lineHeight: 1.5 }}>
              Ne concerne que les chiffres de la page Activité. Quel que soit le niveau, un commercial
              n'accède jamais aux fiches des prospects d'un collègue.
            </div>
            <select
              value={team.team?.sales_visibility || "team_aggregate"}
              onChange={(e) => call({ action: "set_team_flags", sales_visibility: e.target.value })}
              style={{ ...inputSm, width: "100%" }}
            >
              <option value="own">Leurs propres résultats uniquement</option>
              <option value="team_aggregate">Les totaux de l'équipe, sans détail par personne</option>
              <option value="team_detail">Le détail par commercial, nominatif</option>
            </select>
            <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "9px", lineHeight: 1.5 }}>
              {VISIBILITY_HINT[team.team?.sales_visibility || "team_aggregate"]}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const STANDARD_PRICE = 19;

// Doit rester synchronisé avec api/_lib/plans.js (dupliqué côté client, ce fichier
// n'est pas accessible dans le bundle serverless).
const PLAN_TIERS = [
  { name: "Solo", maxPrice: 19, seats: 1, overagePrice: 12, aiQuota: 300 },
  { name: "Équipe", maxPrice: 39, seats: 3, overagePrice: 12, aiQuota: 300 },
  { name: "Business", maxPrice: 79, seats: 10, overagePrice: 10, aiQuota: 1000 },
  { name: "Sur mesure", maxPrice: Infinity, seats: 20, overagePrice: 8, aiQuota: 3000 },
];

function planTierFor(price) {
  return PLAN_TIERS.find((t) => price <= t.maxPrice) || PLAN_TIERS[PLAN_TIERS.length - 1];
}

function BillingPanel({ local, session, team, reloadSettings, reloadTeam }) {
  const [specimenBusy, setSpecimenBusy] = useState(false);

  // Un exemple au format réel : c'est le seul moyen de voir ce que recevra un
  // client, et quelles informations légales manquent encore côté Closia.
  async function downloadSpecimen() {
    if (specimenBusy) return;
    setSpecimenBusy(true);
    try {
      const { buildInvoicePdf, invoiceFileName } = await import("../lib/invoicePdf.js");
      const start = new Date();
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      const number = `INV-${start.getFullYear()}-0001`;
      const { doc } = await buildInvoicePdf({
        number,
        issuedAt: start,
        periodStart: start,
        periodEnd: end,
        planName: planTierFor(tierPrice)?.name || "Solo",
        amountTTC: price || 19,
        vatRate: 20,
        specimen: true,
        customer: {
          company_name: team?.team?.company_name || local?.company_name || "Votre entreprise",
          contact_name: [local?.first_name, local?.last_name].filter(Boolean).join(" ") || null,
          billing_address: team?.team?.billing_address || local?.billing_address || null,
          billing_postal_code: team?.team?.billing_postal_code || local?.billing_postal_code || null,
          billing_city: team?.team?.billing_city || local?.billing_city || null,
          siret: team?.team?.siret || local?.siret || null,
          email: session?.user?.email || null,
        },
      });
      doc.save(invoiceFileName(number));
    } finally {
      setSpecimenBusy(false);
    }
  }

  if (!local) return <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Chargement...</div>;

  const memberCount = team?.members?.length || 1;
  const isTeamBilling = memberCount > 1 && team?.team;
  const billingSource = isTeamBilling ? team.team : local;

  const status = billingSource.subscription_status || "trialing";
  const trialEndsAt = billingSource.trial_ends_at ? new Date(billingSource.trial_ends_at) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / 86400000)) : null;

  const accountCreatedAt = new Date(session.user.created_at);
  const isComped = !isTeamBilling && !!local.is_comped;
  const tierPrice = isTeamBilling ? (billingSource.plan_price ?? null) : (billingSource.plan_price ?? STANDARD_PRICE);
  const price = isComped ? 0 : tierPrice;

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

      <ChangePlanSection
        currentTier={planTierFor(tierPrice)}
        isTeamBilling={isTeamBilling}
        session={session}
        reloadSettings={reloadSettings}
        reloadTeam={reloadTeam}
      />

      {isTeamBilling && (
        <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>VOTRE ABONNEMENT</div>
          {(() => {
            const tier = planTierFor(tierPrice);
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
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>USAGE IA CE MOIS</div>
        {(() => {
          const tier = planTierFor(tierPrice);
          const resetAt = local.ai_calls_reset_at ? new Date(local.ai_calls_reset_at) : null;
          const stillInPeriod = resetAt && resetAt > new Date();
          const used = stillInPeriod ? (local.ai_calls_used || 0) : 0;
          const pct = Math.min(100, Math.round((used / tier.aiQuota) * 100));
          return (
            <>
              <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "6px" }}>
                <span className="mono" style={{ fontWeight: 700 }}>{used} / {tier.aiQuota}</span> générations utilisées ({tier.name})
              </div>
              <div style={{ height: "4px", background: "var(--panel2)", borderRadius: "2px", overflow: "hidden", marginBottom: "6px" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 90 ? "var(--red)" : "var(--blue)", borderRadius: "2px" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                {stillInPeriod ? `Réinitialisation le ${resetAt.toLocaleDateString("fr-FR")}.` : "Aucune génération ce mois-ci."}
              </div>
            </>
          );
        })()}
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "14px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>MOYEN DE PAIEMENT</div>
        <ComingSoon text="Aucune carte enregistrée. La saisie d'un moyen de paiement sera bientôt disponible." />
      </div>

      <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px" }}>
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>HISTORIQUE DE FACTURATION</div>
        {/* Aucune facture n'est émise tant qu'aucun paiement n'est encaissé.
            L'ancienne ligne était fabriquée à l'affichage — numéro déduit de
            l'année, mention PAYÉE écrite en dur — sans transaction derrière. */}
        <div style={{ fontSize: "12px", color: "var(--text-faint)", lineHeight: 1.55 }}>
          Aucune facture pour l'instant. Vos factures apparaîtront ici, téléchargeables en PDF,
          dès le premier prélèvement.
        </div>
        <button
          className="focusable"
          onClick={downloadSpecimen}
          disabled={specimenBusy}
          style={{ marginTop: "10px", fontSize: "11.5px", fontWeight: 600, padding: "7px 12px", borderRadius: "7px", background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" }}
        >
          {specimenBusy ? "Génération…" : "Voir un exemple de facture"}
        </button>
      </div>
    </div>
  );
}

function ChangePlanSection({ currentTier, isTeamBilling, session, reloadSettings, reloadTeam }) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tierIndex = PLAN_TIERS.indexOf(currentTier);
  const nextTier = PLAN_TIERS[tierIndex + 1];
  const canUpgrade = nextTier && Number.isFinite(nextTier.maxPrice);

  async function confirmUpgrade() {
    setSaving(true);
    setError("");
    try {
      if (isTeamBilling) {
        const res = await fetch("/api/team", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: "change_plan", planPrice: nextTier.maxPrice }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "échec");
        reloadTeam?.();
      } else {
        const { error: err } = await supabase.from("user_settings").update({ plan_price: nextTier.maxPrice }).eq("user_id", session.user.id);
        if (err) throw err;
        reloadSettings?.();
      }
      setConfirming(false);
    } catch (e) {
      setError("Le changement d'abonnement a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ borderTop: "0.5px solid var(--hairline)", paddingTop: "14px", marginBottom: "14px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "10px" }}>CHANGER D'ABONNEMENT</div>
      {canUpgrade ? (
        confirming ? (
          <div>
            <div style={{ fontSize: "12.5px", color: "var(--text)", marginBottom: "10px" }}>
              Passer de {currentTier.name} à <strong>{nextTier.name}</strong> — {formatEuros(nextTier.maxPrice)}/mois. Le nouveau tarif sera appliqué sur votre prochaine facture.
            </div>
            {error && <div style={{ fontSize: "11.5px", color: "var(--red)", marginBottom: "8px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-primary focusable" onClick={confirmUpgrade} disabled={saving}>
                {saving ? "Confirmation..." : `Confirmer le passage à ${nextTier.name}`}
              </button>
              <button className="focusable" onClick={() => setConfirming(false)} disabled={saving} style={{ fontSize: "13px", padding: "0 16px", height: "40px", borderRadius: "8px", background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline-strong)" }}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary focusable" onClick={() => setConfirming(true)}>
            Passer à {nextTier.name} — {formatEuros(nextTier.maxPrice)}/mois
          </button>
        )
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>
          Vous êtes déjà sur notre tarif le plus élevé standard. Pour un besoin au-delà de {currentTier.seats} utilisateurs, contactez-nous pour un tarif sur mesure.
        </div>
      )}
    </div>
  );
}

function GmailSignatureImport({ local, set, session, mailConnected }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (!mailConnected?.google || local.sig_custom_text || dismissed) return null;

  async function fetchSignature() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "get_gmail_signature", provider: "google" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "échec");
      if (!data.signature) {
        setError("Aucune signature trouvée dans les paramètres de ton compte Gmail.");
      } else {
        setPreview(data.signature);
      }
    } catch (e) {
      setError(e.message && e.message !== "échec" ? e.message : "La récupération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  if (preview) {
    return (
      <div style={{ marginBottom: "14px", padding: "12px", borderRadius: "8px", background: "var(--panel2)", border: "0.5px solid var(--hairline)" }}>
        <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "8px" }}>SIGNATURE TROUVÉE DANS GMAIL</div>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", whiteSpace: "pre-line", lineHeight: 1.5, marginBottom: "10px" }}>{preview}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="focusable"
            onClick={() => { set({ sig_custom_text: preview }); setPreview(null); }}
            style={{ fontSize: "12px", fontWeight: 600, padding: "7px 12px", borderRadius: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555" }}
          >
            Utiliser cette signature
          </button>
          <button className="focusable" onClick={() => { setPreview(null); setDismissed(true); }} style={{ ...btnGhost, padding: "7px 12px", fontSize: "12px" }}>
            Ignorer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "14px", padding: "12px", borderRadius: "8px", background: "var(--panel2)", border: "0.5px solid var(--hairline)" }}>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>Tu as déjà une signature configurée dans Gmail ? Tu peux la reprendre directement ici.</div>
      <button className="focusable" onClick={fetchSignature} disabled={loading} style={{ ...btnGhost, padding: "7px 12px", fontSize: "12px", opacity: loading ? 0.6 : 1 }}>
        {loading ? "Recherche..." : "Importer ma signature Gmail"}
      </button>
      {error && <div style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "8px" }}>{error}</div>}
    </div>
  );
}

function SignatureMailSync({ local, session, mailConnected }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const signature = buildSignatureBlock(local);

  async function syncToGmail() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/calendar/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "set_gmail_signature", provider: "google", signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "échec");
      setResult({ ok: true });
    } catch (e) {
      setResult({ error: e.message && e.message !== "échec" ? e.message : "La synchronisation a échoué. Réessaie." });
    } finally {
      setSyncing(false);
    }
  }

  if (!mailConnected?.google && !mailConnected?.microsoft) return null;

  return (
    <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "0.5px solid var(--hairline)" }}>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "8px" }}>SYNCHRONISER AVEC VOTRE BOÎTE MAIL</div>
      {mailConnected.google ? (
        <>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "10px" }}>
            Applique cette signature directement dans Gmail — elle apparaîtra automatiquement quand tu réponds à un email, même en dehors de Closia.
          </div>
          <button className="focusable" onClick={syncToGmail} disabled={syncing || !signature} style={{ fontSize: "12px", fontWeight: 600, padding: "8px 14px", borderRadius: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", opacity: syncing || !signature ? 0.6 : 1 }}>
            {syncing ? "Synchronisation..." : "Appliquer à Gmail"}
          </button>
          {!signature && <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "8px" }}>Remplis au moins un champ de signature ci-dessus avant de synchroniser.</div>}
          {result?.ok && <div style={{ fontSize: "11.5px", color: "#527a61", marginTop: "8px" }}>Signature appliquée à ton compte Gmail ✓</div>}
          {result?.error && <div style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "8px" }}>{result.error}</div>}
        </>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>
          Microsoft ne permet pas d'appliquer une signature automatiquement dans Outlook via son API — cette signature reste utilisée dans les emails générés par Closia uniquement.
        </div>
      )}
    </div>
  );
}

function SupportPanel({ session }) {
  const [ticket, setTicket] = useState(undefined);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("support_requests")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTicket(data || null));
  }, [session.user.id]);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setError("");
    const entry = { from: "client", body: message.trim(), at: new Date().toISOString() };

    if (ticket) {
      const messages = [...(ticket.messages || []), entry];
      const { error: err } = await supabase.from("support_requests").update({ messages, status: "open" }).eq("id", ticket.id);
      setSending(false);
      if (err) return setError("L'envoi a échoué. Réessaie.");
      setTicket({ ...ticket, messages, status: "open" });
      setMessage("");
    } else {
      const { data, error: err } = await supabase
        .from("support_requests")
        .insert({ user_id: session.user.id, user_email: session.user.email, message: message.trim(), messages: [entry] })
        .select()
        .single();
      setSending(false);
      if (err) return setError("L'envoi a échoué. Réessaie.");
      setTicket(data);
      setMessage("");
    }
  }

  return (
    <>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px" }}>
        Une question, un bug, besoin d'aide ? Écris ici, l'équipe Closia te répond directement.
      </div>

      {ticket?.messages?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px", maxWidth: "420px" }}>
          {ticket.messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.from === "admin" ? "flex-start" : "flex-end",
                background: m.from === "admin" ? "var(--panel2)" : "var(--blue-dim)",
                color: m.from === "admin" ? "var(--text)" : "var(--blue)",
                border: `0.5px solid ${m.from === "admin" ? "var(--hairline)" : "#147ff555"}`,
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "12.5px",
                maxWidth: "85%",
              }}
            >
              <div style={{ fontSize: "10px", fontWeight: 700, opacity: 0.6, marginBottom: "3px" }}>{m.from === "admin" ? "Équipe Closia" : "Toi"}</div>
              {m.body}
            </div>
          ))}
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={ticket ? "Ajouter un message..." : "Décris ta question ou le problème rencontré..."}
        style={{ ...inputSm, width: "100%", maxWidth: "420px", height: "70px", resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ marginTop: "10px" }}>
        <button
          className="focusable"
          onClick={send}
          disabled={sending || !message.trim()}
          style={{ fontSize: "12px", fontWeight: 600, padding: "8px 14px", borderRadius: "8px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #147ff555", opacity: sending || !message.trim() ? 0.6 : 1 }}
        >
          {sending ? "Envoi..." : "Envoyer au support"}
        </button>
      </div>
      {error && <div style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "8px" }}>{error}</div>}
    </>
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
