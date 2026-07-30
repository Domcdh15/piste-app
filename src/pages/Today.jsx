import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CalendarIcon, PhoneIcon, MailIcon, TargetIcon, CheckIcon, SparklesIcon, getFirstName, callAI } from "../lib/ui.jsx";

function todayLabel() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

function formatEventTime(iso) {
  if (!iso || iso.length <= 10) return "Toute la journée";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const FALLBACK_TIP = "Commencez par vos relances en attente, puis enchaînez avec vos appels planifiés pour maximiser vos conversions.";

export default function Today({ prospects, setActiveTab, session }) {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [tip, setTip] = useState("");
  const [tipLoading, setTipLoading] = useState(true);
  const [nbTaches, setNbTaches] = useState(0);
  const [tachesLoading, setTachesLoading] = useState(true);

  const nbAppels = prospects.filter((p) => p.status === "appeler").length;
  const nbRelances = prospects.filter((p) => p.status === "relancer").length;
  const nbRetard = prospects.filter((p) => p.status === "retard").length;
  const nbOpportunites = prospects.filter((p) => p.priority >= 75).length;
  const firstName = getFirstName(session.user);

  useEffect(() => {
    async function loadEvents() {
      setEventsLoading(true);
      try {
        const res = await fetch("/api/calendar/today", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        setEvents(data.events || []);
      } catch (e) {
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    }
    loadEvents();
  }, [session.access_token]);

  useEffect(() => {
    async function loadTaches() {
      setTachesLoading(true);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("tasks")
        .select("id")
        .eq("done", false)
        .lte("due_at", endOfDay.toISOString());
      setNbTaches((data || []).length);
      setTachesLoading(false);
    }
    loadTaches();
  }, []);

  useEffect(() => {
    if (eventsLoading) return;
    async function generateTip() {
      setTipLoading(true);
      try {
        const urgents = prospects.filter((p) => p.status === "appeler" || p.status === "retard").slice(0, 5);
        const relances = prospects.filter((p) => p.status === "relancer").slice(0, 5);
        const prompt = `Tu es l'assistant commercial de Piste. En une seule phrase (25 mots maximum), en français, dis au commercial sur quoi se concentrer en priorité aujourd'hui : un appel important, une relance email, ou la préparation d'une visio. Base-toi sur ces données réelles, sois concret et cite un nom si utile.

Prospects à appeler ou en retard : ${urgents.map((p) => `${p.name} (${p.company}, ${p.status})`).join(", ") || "aucun"}
Prospects à relancer par email : ${relances.map((p) => `${p.name} (${p.company})`).join(", ") || "aucun"}
Rendez-vous à l'agenda aujourd'hui : ${events.map((e) => `${e.title} à ${formatEventTime(e.start)}`).join(", ") || "aucun"}

Réponds uniquement avec la phrase de conseil, sans guillemets ni préambule.`;
        const text = await callAI(prompt, session.access_token);
        setTip(text.trim());
      } catch (e) {
        setTip(FALLBACK_TIP);
      } finally {
        setTipLoading(false);
      }
    }
    generateTip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoading]);

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, #2f5bff, #1d3fc4)",
          color: "#fff",
          padding: "32px 32px 26px",
        }}
      >
        <div className="display" style={{ fontWeight: 700, fontSize: "32px", display: "flex", alignItems: "center", gap: "10px" }}>
          Bonjour{firstName ? ` ${firstName}` : ""} <span>👋</span>
        </div>
        <div style={{ opacity: 0.85, fontSize: "14px", marginTop: "6px", marginBottom: "18px" }}>{todayLabel()}</div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, opacity: 0.95, marginBottom: "10px" }}>
          📋 Missions du jour
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
          <Pill icon="📞" text={`${nbAppels} appel(s)`} />
          <Pill icon="🗓️" text={`${eventsLoading ? "…" : events.length} RDV`} />
          <Pill icon="🔁" text={`${nbRelances} relance(s)`} />
          <Pill icon="🎯" text={`${nbOpportunites} opportunité(s)`} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "13px", opacity: 0.95 }}>
          <SparklesIcon size={13} color="#fff" style={{ marginTop: "2px" }} />
          <span>{tipLoading ? "Analyse de ta journée en cours..." : tip || FALLBACK_TIP}</span>
        </div>
      </div>

      <div style={{ padding: "28px 32px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "14px" }}>
          <StatTile accent="var(--blue)" icon={<CalendarIcon size={15} color="var(--blue)" />} label="RDV Aujourd'hui" value={eventsLoading ? "…" : events.length} onClick={() => setActiveTab("settings")} />
          <StatTile accent="#7c3aed" icon={<PhoneIcon size={15} color="#7c3aed" />} label="Appels à faire" value={nbAppels} onClick={() => setActiveTab("pipeline")} />
          <StatTile accent="var(--amber)" icon={<MailIcon size={15} color="var(--amber)" />} label="Emails en attente" value={nbRelances} onClick={() => setActiveTab("pipeline")} />
          <StatTile accent="#0ea968" icon={<TargetIcon size={15} color="#0ea968" />} label="Opportunités prioritaires" value={nbOpportunites} onClick={() => setActiveTab("pipeline")} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginBottom: "22px" }}>
          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: "2.5px solid var(--blue)", borderRadius: "10px", padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: events.length > 0 ? "10px" : 0 }}>
              <CalendarIcon size={15} color="var(--blue)" />
              <span className="display" style={{ fontWeight: 600, fontSize: "14px" }}>Agenda du jour</span>
              <span className="mono" style={{ marginLeft: "auto", background: "var(--panel2)", color: "var(--blue)", borderRadius: "999px", fontSize: "12px", fontWeight: 700, padding: "2px 9px" }}>
                {eventsLoading ? "…" : events.length}
              </span>
            </div>
            {!eventsLoading && events.length === 0 && (
              <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>
                Aucun événement — <button className="focusable" onClick={() => setActiveTab("settings")} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", fontSize: "12px", cursor: "pointer" }}>connecte ton agenda</button>
              </div>
            )}
            {events.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {events.slice(0, 4).map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="mono" style={{ color: "var(--text-faint)" }}>{formatEventTime(e.start)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <StatTile accent="#7c3aed" icon={<CheckIcon size={15} color="#7c3aed" />} label="Mes tâches" value={tachesLoading ? "…" : nbTaches} onClick={() => setActiveTab("pipeline")} />
        </div>

        <button
          className="focusable"
          onClick={() => setActiveTab("pipeline")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "transparent",
            border: "none",
            padding: "10px 2px",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "18px" }}>📁</span>
          <span className="display" style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>Sales Pipeline</span>
          <span style={{ color: "var(--text-faint)", fontSize: "13px" }}>Vue d'ensemble de vos prospects</span>
        </button>
      </div>
    </div>
  );
}

function Pill({ icon, text }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(255,255,255,0.14)",
        border: "0.5px solid rgba(255,255,255,0.25)",
        borderRadius: "999px",
        padding: "6px 12px",
        fontSize: "13px",
        fontWeight: 500,
      }}
    >
      <span>{icon}</span>
      {text}
    </div>
  );
}

function StatTile({ accent, icon, label, value, onClick }) {
  return (
    <button
      className="focusable"
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        background: "var(--panel)",
        border: "0.5px solid var(--hairline)",
        borderTop: `2.5px solid ${accent}`,
        borderRadius: "10px",
        padding: "16px 18px",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon}
        <span className="display" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)" }}>{label}</span>
      </div>
      <span
        className="mono"
        style={{
          background: "var(--panel2)",
          color: accent,
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 700,
          padding: "2px 9px",
        }}
      >
        {value}
      </span>
    </button>
  );
}
