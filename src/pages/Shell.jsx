import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar.jsx";
import Today from "./Today.jsx";
import Pipeline from "./Pipeline.jsx";
import Opportunities from "./Opportunities.jsx";
import Tasks from "./Tasks.jsx";
import Assistant from "./Assistant.jsx";
import Activities from "./Activities.jsx";
import Settings from "./Settings.jsx";

export default function Shell({ session }) {
  const [activeTab, setActiveTab] = useState("today");
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jumpToProspectId, setJumpToProspectId] = useState(null);
  const [jumpToShowForm, setJumpToShowForm] = useState(false);
  const [jumpToTab, setJumpToTab] = useState("email");

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("priority", { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProspects();
  }, []);

  function openProspect(id, tab) {
    setJumpToProspectId(id);
    setJumpToTab(tab || "email");
    setActiveTab("pipeline");
  }

  function openNewProspectForm() {
    setJumpToShowForm(true);
    setActiveTab("pipeline");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userEmail={session.user.email} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {activeTab === "today" && <Today prospects={prospects} setActiveTab={setActiveTab} session={session} reload={loadProspects} onOpenProspect={openProspect} />}
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
          />
        )}
        {activeTab === "opportunities" && <Opportunities prospects={prospects} onOpenProspect={openProspect} onNewOpportunity={openNewProspectForm} />}
        {activeTab === "tasks" && <Tasks prospects={prospects} session={session} />}
        {activeTab === "assistant" && <Assistant session={session} />}
        {activeTab === "activities" && <Activities prospects={prospects} />}
        {activeTab === "settings" && <Settings session={session} />}
      </div>
    </div>
  );
}
