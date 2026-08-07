import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar.jsx";
import Today from "./Today.jsx";
import Planning from "./Planning.jsx";
import Pipeline from "./Pipeline.jsx";
import Assistant from "./Assistant.jsx";
import Activities from "./Activities.jsx";
import Settings from "./Settings.jsx";
import Integrations from "./Integrations.jsx";

export default function Shell({ session, team, reloadTeam }) {
  const [activeTab, setActiveTab] = useState("today");
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jumpToProspectId, setJumpToProspectId] = useState(null);
  const [jumpToShowForm, setJumpToShowForm] = useState(false);
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
        plan_price: 39,
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
    await supabase.from("tasks").update({ due_at: startOfToday.toISOString() }).eq("done", false).lt("due_at", startOfToday.toISOString());
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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {activeTab === "today" && <Today prospects={prospects} setActiveTab={setActiveTab} session={session} reload={loadProspects} onOpenProspect={openProspect} />}
        {activeTab === "planning" && <Planning prospects={prospects} session={session} onOpenProspect={openProspect} settings={settings} />}
        {activeTab === "pipeline" && (
          <Pipeline
            prospects={prospects}
            loading={loading}
            reload={loadProspects}
            session={session}
            initialSelectedId={jumpToProspectId}
            onConsumeInitialSelection={() => setJumpToProspectId(null)}
            initialShowForm={jumpToShowForm}
            onConsumeInitialShowForm={() => setJumpToShowForm(false)}
            initialTab={jumpToTab}
            settings={settings}
            returnTab={returnTab}
            onBackToPrevious={backFromPipeline}
            team={team}
          />
        )}
        {activeTab === "assistant" && <Assistant session={session} prospects={prospects} onOpenProspect={openProspect} settings={settings} />}
        {activeTab === "activities" && <Activities prospects={prospects} onOpenProspect={openProspect} session={session} team={team} />}
        {activeTab === "settings" && <Settings session={session} prospects={prospects} settings={settings} reloadSettings={loadSettings} team={team} reloadTeam={reloadTeam} />}
        {activeTab === "integrations" && <Integrations session={session} />}
      </div>
    </div>
  );
}
