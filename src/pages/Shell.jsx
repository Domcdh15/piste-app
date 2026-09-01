import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar.jsx";
import Today from "./Today.jsx";
import Agenda from "./Agenda.jsx";
import Pipeline from "./Pipeline.jsx";
import Assistant from "./Assistant.jsx";
import Activities from "./Activities.jsx";
import Tickets from "./Tickets.jsx";
import Encadrement from "./Encadrement.jsx";
import { planTierFor } from "../../api/_lib/plans.js";
import { PageTitle, TicketIcon } from "../lib/ui.jsx";
import Settings from "./Settings.jsx";
import Integrations from "./Integrations.jsx";
import EquipePage from "./EquipePage.jsx";
import AssistantBubble from "../components/AssistantBubble.jsx";

// L'identité de facturation vit sur l'équipe : elle recouvre les valeurs
// personnelles pour que tous les devis d'une même entreprise concordent.
const COMPANY_FIELDS = [
  "company_name", "billing_address", "billing_postal_code", "billing_city",
  "siret", "vat_exempt", "vat_number", "vat_rate",
  "devis_validity_days", "devis_payment_terms",
];

// Titre affiché dans la barre du haut sur mobile : sans lui, on ne sait plus
// sur quelle page on se trouve une fois le tiroir refermé.
const TAB_LABELS = {
  today: "Aujourd'hui",
  planning: "Agenda",
  pipeline: "Opportunités",
  tickets: "Tickets",
  encadrement: "Encadrement",
  chauds: "Prospects chauds",
  "a-sauver": "Deals à sauver",
  assistant: "Assistant IA",
  activities: "Activités",
  settings: "Paramètres",
  integrations: "Intégrations",
  equipe: "Équipe",
};

const VALID_TABS = ["today", "planning", "pipeline", "tickets", "encadrement", "chauds", "a-sauver", "assistant", "activities", "settings", "integrations", "equipe"];

function tabFromHash() {
  const tab = window.location.hash.slice(1);
  return VALID_TABS.includes(tab) ? tab : "today";
}

export default function Shell({ session, team, reloadTeam }) {
  const [activeTab, setActiveTabState] = useState(tabFromHash);
  const [menuOpen, setMenuOpen] = useState(false);

  // Une fiche ouverte peut refuser qu'on la quitte — c'est la règle d'équipe
  // « aucun prospect sans prochaine action ». Sans ce point de passage, un clic
  // dans la barre latérale la contournait.
  const navGuardRef = useRef(null);
  const pendingTabRef = useRef(null);

  function applyTab(tab) {
    setActiveTabState(tab);
    if (VALID_TABS.includes(tab)) window.location.hash = tab;
  }

  function setActiveTab(tab) {
    if (navGuardRef.current && navGuardRef.current(tab)) {
      pendingTabRef.current = tab;
      return;
    }
    applyTab(tab);
  }

  // Appelé quand la fiche a obtenu ce qu'elle demandait : on reprend le
  // déplacement là où il avait été interrompu.
  function resumePendingTab() {
    const tab = pendingTabRef.current;
    pendingTabRef.current = null;
    if (tab) applyTab(tab);
  }

  useEffect(() => {
    function onHashChange() {
      setActiveTabState(tabFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jumpToProspectId, setJumpToProspectId] = useState(null);
  const [jumpToShowForm, setJumpToShowForm] = useState(false);
  const [jumpToShowImport, setJumpToShowImport] = useState(false);
  const [jumpToTab, setJumpToTab] = useState("email");
  const [settings, setSettings] = useState(null);
  const [returnTab, setReturnTab] = useState(null);

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("priority", { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  async function loadSettings() {
    const { data } = await supabase.from("user_settings").select("*").eq("user_id", session.user.id).maybeSingle();
    if (data) {
      setSettings(data);
      return;
    }
    const meta = session.user.user_metadata || {};
    const { data: created } = await supabase
      .from("user_settings")
      .insert({
        user_id: session.user.id,
        plan_price: 9,
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        subscription_status: "trialing",
        first_name: meta.first_name || null,
        last_name: meta.last_name || null,
        company_name: meta.company_name || null,
        industry: meta.industry || null,
        team_size: meta.team_size || null,
        existing_crm: meta.existing_crm || null,
        sig_name: meta.first_name && meta.last_name ? `${meta.first_name} ${meta.last_name}` : null,
        sig_company: meta.company_name || null,
      })
      .select()
      .single();
    setSettings(created || {});
  }

  async function rolloverOverdueTasks() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data: overdue } = await supabase.from("tasks").select("*").eq("done", false).eq("missed", false).lt("due_at", startOfToday.toISOString());
    if (!overdue || overdue.length === 0) return;

    const { data: userSettings } = await supabase.from("user_settings").select("work_days, auto_reschedule_missed_tasks, work_start, work_end, reschedule_mode, reschedule_time").eq("user_id", session.user.id).maybeSingle();
    if (userSettings?.auto_reschedule_missed_tasks === false) return;
    const workDays = userSettings?.work_days || ["Lun", "Mar", "Mer", "Jeu", "Ven"];
    const DAY_CODES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

    const nextWorkDay = new Date(startOfToday);
    nextWorkDay.setDate(nextWorkDay.getDate() + 1);
    while (!workDays.includes(DAY_CODES[nextWorkDay.getDay()])) {
      nextWorkDay.setDate(nextWorkDay.getDate() + 1);
    }
    // Reporter tout à 8h empilait la journée entière sur une seule ligne de
    // l'agenda. On garde l'heure d'origine : un appel manqué de 14h revient
    // à 14h, et les tâches se répartissent d'elles-mêmes.
    const hourOf = (value, fallback) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
      return m ? { h: Number(m[1]), m: Number(m[2]) } : fallback;
    };
    const dayStart = hourOf(userSettings?.work_start, { h: 8, m: 0 });
    const dayEnd = hourOf(userSettings?.work_end, { h: 19, m: 0 });
    // L'utilisateur choisit : garder l'heure de la tâche, ou tout ramener
    // à un même créneau pour traiter les reports en une fois.
    const fixedMode = userSettings?.reschedule_mode !== "same_time";
    const fixedAt = hourOf(userSettings?.reschedule_time, { h: 8, m: 0 });

    // Toutes les tâches oubliées au même horaire redonneraient la pile qu'on
    // vient de défaire. On les espace dans le créneau choisi, en resserrant
    // l'intervalle si elles ne tiennent pas avant la fin de journée.
    const slotStart = fixedAt.h * 60 + fixedAt.m;
    const slotEnd = dayEnd.h * 60 + dayEnd.m;
    const spacing = overdue.length > 1
      ? Math.max(5, Math.min(15, Math.floor((slotEnd - slotStart) / (overdue.length - 1)) || 5))
      : 0;

    let index = 0;
    for (const t of overdue) {
      await supabase.from("tasks").update({ missed: true, done: true }).eq("id", t.id);
      const note = t.note?.startsWith("Tâche oubliée : ") ? t.note : `Tâche oubliée : ${t.note}`;

      const previous = t.due_at ? new Date(t.due_at) : null;
      const target = new Date(nextWorkDay);
      if (fixedMode) {
        const at = Math.min(slotStart + index * spacing, Math.max(slotStart, slotEnd - 5));
        target.setHours(Math.floor(at / 60), at % 60, 0, 0);
      } else if (previous) {
        target.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
      } else {
        target.setHours(dayStart.h, dayStart.m, 0, 0);
      }
      index++;

      // Une tâche placée hors de la journée de travail est ramenée dedans.
      // Une heure fixe choisie explicitement est respectée telle quelle ;
      // seule une heure héritée est ramenée dans la journée de travail.
      if (!fixedMode) {
        const minutes = target.getHours() * 60 + target.getMinutes();
        const minMinutes = dayStart.h * 60 + dayStart.m;
        const maxMinutes = dayEnd.h * 60 + dayEnd.m;
        if (minutes < minMinutes) target.setHours(dayStart.h, dayStart.m, 0, 0);
        else if (minutes >= maxMinutes) target.setHours(dayEnd.h, Math.max(0, dayEnd.m - 30), 0, 0);
      }

      await supabase.from("tasks").insert({
        user_id: t.user_id,
        prospect_id: t.prospect_id,
        type: t.type,
        note,
        due_at: target.toISOString(),
        priority: t.priority,
      });
    }
  }

  useEffect(() => {
    rolloverOverdueTasks();
    loadProspects();
    loadSettings();
  }, []);

  function openProspect(id, tab) {
    setReturnTab(activeTab !== "pipeline" ? activeTab : null);
    setJumpToProspectId(id);
    setJumpToTab(tab || "email");
    setActiveTab("pipeline");
  }

  function backFromPipeline() {
    if (returnTab) {
      setActiveTab(returnTab);
      setReturnTab(null);
    }
  }

  const effectiveSettings = (() => {
    if (!settings || !team?.team) return settings;
    const merged = { ...settings };
    for (const f of COMPANY_FIELDS) {
      if (team.team[f] !== null && team.team[f] !== undefined) merged[f] = team.team[f];
    }
    return merged;
  })();

  const memberCount = team?.members?.length || 1;
  const isTeamBilling = !!team?.team && (memberCount > 1 || team.team.plan_price != null);
  const billingPrice = Number((isTeamBilling ? team.team?.plan_price : settings?.plan_price) || 0);
  const hasAssistantBubbleAccess = billingPrice > 39;

  // Les tickets sont réservés à Équipe et Business : c'est ce qui distingue ces
  // formules de Solo par une fonctionnalité réelle, pas par un quota.
  const planTier = planTierFor(billingPrice).name;
  // Sans équipe, il n'y a pas de tickets à lire ni de team_id à écrire : mieux
  // vaut ne pas montrer l'onglet que d'offrir un écran qui échoue à chaque geste.
  const hasTeam = !!team?.team?.id;
  const hasTicketsAccess = hasTeam && ["Équipe", "Business", "Sur mesure"].includes(planTier);

  // L'encadrement n'a de sens qu'à plusieurs : on l'ouvre à qui encadre
  // vraiment quelqu'un, admin compris, sur les formules qui autorisent une
  // équipe.
  const perimetreEncadre = team?.role === "admin" ? "both" : team?.manages || "none";
  const hasEncadrement = hasTicketsAccess && perimetreEncadre !== "none" && (team?.members?.length || 0) > 1;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div
        className={`sidebar-scrim${menuOpen ? " is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        prospects={prospects}
        hasTickets={hasTicketsAccess}
        hasEncadrement={hasEncadrement}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />
      <div className="app-main" style={{ flex: 1, minWidth: 0 }}>
        <div className="mobile-topbar">
          <button
            className="burger focusable"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
          <span className="display" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>
            {TAB_LABELS[activeTab] || "Closia"}
          </span>
        </div>
        {activeTab === "today" && <Today prospects={prospects} setActiveTab={setActiveTab} session={session} reload={loadProspects} onOpenProspect={openProspect} settings={effectiveSettings} />}
        {activeTab === "planning" && <Agenda prospects={prospects} session={session} onOpenProspect={openProspect} settings={effectiveSettings} />}
        {(activeTab === "pipeline" || activeTab === "chauds" || activeTab === "a-sauver") && (
          <Pipeline
            prospects={prospects}
            loading={loading}
            reload={loadProspects}
            session={session}
            initialSelectedId={jumpToProspectId}
            onConsumeInitialSelection={() => setJumpToProspectId(null)}
            initialShowForm={jumpToShowForm}
            onConsumeInitialShowForm={() => setJumpToShowForm(false)}
            initialShowImport={jumpToShowImport}
            onConsumeInitialShowImport={() => setJumpToShowImport(false)}
            initialTab={jumpToTab}
            settings={effectiveSettings}
            returnTab={returnTab}
            onBackToPrevious={backFromPipeline}
            team={team}
            presetFilter={activeTab === "chauds" ? "chauds" : activeTab === "a-sauver" ? "a-sauver" : null}
            navGuardRef={navGuardRef}
            onGuardResolved={resumePendingTab}
          />
        )}
        {activeTab === "encadrement" && hasEncadrement && <Encadrement session={session} team={team} onOpenProspect={openProspect} />}
        {activeTab === "tickets" && (hasTicketsAccess
          ? <Tickets session={session} prospects={prospects} team={team} onOpenProspect={openProspect} />
          : <TicketsVerrouilles planTier={planTier} setActiveTab={setActiveTab} />)}
        {activeTab === "assistant" && <Assistant session={session} prospects={prospects} onOpenProspect={openProspect} settings={effectiveSettings} />}
        {activeTab === "activities" && <Activities prospects={prospects} onOpenProspect={openProspect} session={session} team={team} settings={effectiveSettings} setActiveTab={setActiveTab} />}
        {activeTab === "settings" && <Settings session={session} prospects={prospects} settings={settings} reloadSettings={loadSettings} team={team} reloadTeam={reloadTeam} setActiveTab={setActiveTab} />}
        {activeTab === "integrations" && <Integrations session={session} team={team} reloadTeam={reloadTeam} onBack={() => setActiveTab("settings")} setActiveTab={setActiveTab} onOpenImport={() => { setJumpToShowImport(true); setActiveTab("pipeline"); }} />}
        {activeTab === "equipe" && <EquipePage session={session} team={team} reloadTeam={reloadTeam} />}
      </div>
      {hasAssistantBubbleAccess && <AssistantBubble session={session} />}
    </div>
  );
}

function TicketsVerrouilles({ planTier, setActiveTab }) {
  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "560px" }}>
      <PageTitle icon={TicketIcon} color="var(--blue)" style={{ marginBottom: "16px" }}>Tickets</PageTitle>
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-lg, 14px)", padding: "24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Disponible à partir de la formule Équipe</div>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Les tickets suivent les demandes de vos clients — devis, problèmes, réclamations — jusqu'à
          leur résolution, avec un responsable, un fil de discussion et des notes internes.
          Votre formule actuelle est {planTier}.
        </p>
        <button
          className="focusable"
          onClick={() => setActiveTab("settings")}
          style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          Voir les formules
        </button>
      </div>
    </div>
  );
}
