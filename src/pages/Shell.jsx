import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar.jsx";
import Today from "./Today.jsx";
import Pipeline from "./Pipeline.jsx";
import Tasks from "./Tasks.jsx";
import Assistant from "./Assistant.jsx";
import Activities from "./Activities.jsx";
import Settings from "./Settings.jsx";

export default function Shell({ session }) {
  const [activeTab, setActiveTab] = useState("today");
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadProspects() {
    setLoading(true);
    const { data, error } = await supabase.from("prospects").select("*").order("priority", { ascending: false });
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProspects();
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userEmail={session.user.email} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {activeTab === "today" && <Today prospects={prospects} setActiveTab={setActiveTab} session={session} reload={loadProspects} />}
        {activeTab === "pipeline" && <Pipeline prospects={prospects} loading={loading} reload={loadProspects} session={session} />}
        {activeTab === "tasks" && <Tasks prospects={prospects} session={session} />}
        {activeTab === "assistant" && <Assistant session={session} />}
        {activeTab === "activities" && <Activities prospects={prospects} />}
        {activeTab === "settings" && <Settings session={session} />}
      </div>
    </div>
  );
}
