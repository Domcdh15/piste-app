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

export default function Shell({ session }) {
  const [activeTab, setActiveTab] = useState("today");
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jumpToProspectId, setJumpToProspectId] = useState(null);
  const [jumpToShowForm, setJumpToShowForm] = useState(false);
  const [jumpToTab, setJumpToTab] = useState("email");
  const [settings, setSettings] = useState(null);

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("priority", { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  async function loadSettings() {
    const { data } = await supabase.from("user_settings").select("*").eq("user_id", session.user.id).maybeSingle();
    setSettings(data || {});
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
    setJumpToProspectId(id);
    setJumpToTab(tab || "email");
    setActiveTab("pipeline");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userEmail={session.user.email} />
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
          />
        )}
        {activeTab === "assistant" && <Assistant session={session} prospects={prospects} onOpenProspect={openProspect} settings={settings} />}
        {activeTab === "activities" && <Activities prospects={prospects} onOpenProspect={openProspect} session={session} />}
        {activeTab === "settings" && <Settings session={session} prospects={prospects} settings={settings} reloadSettings={loadSettings} />}
        {activeTab === "integrations" && <Integrations session={session} />}
      </div>
    </div>
  );
}
