import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  callAI,
  parseJsonLoose,
  isOverdue,
  formatShortDate,
  formatEuros,
  Avatar,
  SparklesIcon,
  PhoneIcon,
  MailIcon,
  VideoIcon,
  PinIcon,
  AlertIcon,
  CalendarIcon,
  appendSignature,
} from "../lib/ui.jsx";

const BG = "#F8FAFC";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const TEXT2 = "#64748B";
const ACCENT = "#2563EB";
const ACCENT_DIM = "#EFF6FF";
const BORDER = "#E2E8F0";
const AI = "#7C3AED";
const AI_DIM = "#F5F3FF";
const AI_BORDER = "#DDD6FE";
const RED = "#dc2626";
const RED_DIM = "#fef2f2";

const TASK_TYPE_META = {
  appel_telephone: { label: "Appel téléphonique", Icon: PhoneIcon },
  appel_visio: { label: "Appel visio", Icon: VideoIcon },
  rdv_physique: { label: "RDV physique", Icon: PinIcon },
  relance_email: { label: "Relance mail", Icon: MailIcon },
};

const ACTIVITY_LABEL = {
  appel_abouti: "Appel abouti",
  appel_manque: "Appel manqué",
  message_linkedin: "Message LinkedIn",
  deal_gagne: "Deal gagné",
  deal_perdu: "Deal perdu",
  note: "Note",
};

const TONES = ["Professionnel", "Direct", "Chaleureux"];

async function fetchProspectContext(prospectId) {
  const [emails, analyses, activities] = await Promise.all([
    supabase.from("emails_generes").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1),
    supabase.from("analyses_ia").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1),
    supabase.from("activities").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
  ]);
  const lastActivity = activities.data?.[0];
  const callsAbouti = (activities.data || []).filter((a) => a.type === "appel_abouti").length;
  const callsManque = (activities.data || []).filter((a) => a.type === "appel_manque").length;
  const parts = [`Appels précédents : ${callsAbouti} abouti(s), ${callsManque} manqué(s).`];
  if (lastActivity) parts.push(`Dernier échange : ${ACTIVITY_LABEL[lastActivity.type] || lastActivity.type} le ${formatShortDate(lastActivity.created_at)}${lastActivity.note ? ` — "${lastActivity.note}"` : ""}.`);
  if (emails.data?.[0]) parts.push(`Dernier email envoyé : "${emails.data[0].content.slice(0, 300)}"`);
  if (analyses.data?.[0]) parts.push(`Dernière analyse : ${analyses.data[0].content}`);
  return { text: parts.join("\n"), lastActivity };
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

export default function Assistant({ session, prospects, onOpenProspect, settings }) {
  const [view, setView] = useState({ type: "home" });
  const openProspects = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");

  function openFlow(type, prospectId) {
    setView({ type, prospectId: prospectId || null });
  }

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "28px 32px 60px" }}>
      <div style={{ maxWidth: "920px" }}>
        <Header />

        {view.type === "home" ? (
          <>
            <AnalyzedTodayBar prospects={openProspects} />
            <AttentionCards prospects={openProspects} onOpenProspect={onOpenProspect} onOpenFlow={openFlow} />
            <QuickActionCards onOpenFlow={openFlow} />
            <ChatPanel session={session} prospects={openProspects} onOpenProspect={onOpenProspect} />
          </>
        ) : view.type === "relance" ? (
          <RelanceFlow prospectId={view.prospectId} prospects={openProspects} session={session} settings={settings} onBack={() => setView({ type: "home" })} />
        ) : view.type === "analyse" ? (
          <AnalyseFlow prospectId={view.prospectId} prospects={openProspects} session={session} onBack={() => setView({ type: "home" })} />
        ) : view.type === "rdv" ? (
          <RdvFlow prospectId={view.prospectId} prospects={openProspects} session={session} onBack={() => setView({ type: "home" })} />
        ) : (
          <ResumeFlow prospectId={view.prospectId} prospects={openProspects} session={session} onBack={() => setView({ type: "home" })} />
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <SparklesIcon size={18} color={AI} />
          <span className="display" style={{ fontWeight: 700, fontSize: "20px", color: TEXT }}>Assistant IA</span>
        </div>
        <div style={{ fontSize: "13px", color: TEXT2, marginTop: "4px" }}>Votre copilote commercial pour analyser vos opportunités et passer à l'action.</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: TEXT2, justifyContent: "flex-end" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#16a34a" }} />
          Contexte synchronisé
        </div>
        <div style={{ fontSize: "11px", color: TEXT2, opacity: 0.8, marginTop: "2px" }}>Pipeline · Activité · Agenda</div>
      </div>
    </div>
  );
}

function AnalyzedTodayBar({ prospects }) {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    async function load() {
      const [activities, emails, rdvTasks] = await Promise.all([
        supabase.from("activities").select("*", { count: "exact", head: true }),
        supabase.from("emails_generes").select("*", { count: "exact", head: true }),
        supabase.from("tasks").select("*", { count: "exact", head: true }).in("type", ["rdv_physique", "appel_visio"]),
      ]);
      setCounts({
        activites: (activities.count || 0) + (emails.count || 0),
        rdv: rdvTasks.count || 0,
      });
    }
    load();
  }, []);

  const now = new Date();
  const attention = prospects.filter((p) => {
    const stale = !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 > 7;
    const overdue = p.next_contact_at && isOverdue(p.next_contact_at);
    return stale || overdue;
  }).length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "22px", flexWrap: "wrap", background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "12px 18px", marginBottom: "24px" }}>
      <span style={{ fontSize: "12px", color: TEXT2, fontWeight: 600 }}>Closia a analysé aujourd'hui</span>
      <TodayStat value={prospects.length} label="opportunités" />
      <TodayStat value={counts ? counts.activites : "…"} label="activités" />
      <TodayStat value={counts ? counts.rdv : "…"} label="rendez-vous" />
      <TodayStat value={attention} label="deals nécessitent votre attention" accent={attention > 0} />
    </div>
  );
}

function TodayStat({ value, label, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
      <span className="mono" style={{ fontSize: "15px", fontWeight: 700, color: accent ? RED : TEXT }}>{value}</span>
      <span style={{ fontSize: "12px", color: TEXT2 }}>{label}</span>
    </div>
  );
}

function AttentionCards({ prospects, onOpenProspect, onOpenFlow }) {
  const now = new Date();

  const riskList = prospects
    .filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 7)
    .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
  const risk = riskList[0];

  const relanceList = prospects
    .filter((p) => p.stage === "Proposition envoyée" && (!p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 3))
    .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
  const relance = relanceList[0];

  const [rdvTask, setRdvTask] = useState(null);
  useEffect(() => {
    supabase
      .from("tasks")
      .select("*")
      .in("type", ["rdv_physique", "appel_visio"])
      .eq("done", false)
      .gte("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(1)
      .then(({ data }) => setRdvTask(data?.[0] || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rdvProspect = rdvTask ? prospects.find((p) => p.id === rdvTask.prospect_id) : null;

  const cards = [
    risk && {
      key: "risk",
      icon: "🔥",
      title: "Opportunité à risque",
      prospect: risk,
      lines: [
        `${formatEuros(risk.deal_value || 0)}`,
        `Aucune activité depuis ${daysSince(risk.last_contact_at) ?? "longtemps"} jour${daysSince(risk.last_contact_at) > 1 ? "s" : ""}.`,
      ],
      recommendation: "Closia recommande : relancer aujourd'hui.",
      actions: [
        { label: "Analyser", onClick: () => onOpenFlow("analyse", risk.id) },
        { label: "Relancer", onClick: () => onOpenFlow("relance", risk.id) },
      ],
    },
    relance && {
      key: "relance",
      icon: "✉️",
      title: "Relance à préparer",
      prospect: relance,
      lines: [
        `${formatEuros(relance.deal_value || 0)}`,
        `La proposition a été envoyée il y a ${daysSince(relance.last_contact_at) ?? "quelques"} jour${daysSince(relance.last_contact_at) > 1 ? "s" : ""}.`,
      ],
      recommendation: "Closia recommande : envoyer une relance courte.",
      actions: [{ label: "Générer", onClick: () => onOpenFlow("relance", relance.id) }],
    },
    rdvProspect && {
      key: "rdv",
      icon: "📅",
      title: "Rendez-vous à préparer",
      prospect: rdvProspect,
      lines: [
        `${formatEuros(rdvProspect.deal_value || 0)}`,
        formatShortDate(rdvTask.due_at),
      ],
      recommendation: "Closia a préparé le contexte pour ce rendez-vous.",
      actions: [{ label: "Préparer le RDV", onClick: () => onOpenFlow("rdv", rdvProspect.id) }],
    },
  ].filter(Boolean);

  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, letterSpacing: "0.04em", marginBottom: "12px" }}>CE QUI MÉRITE VOTRE ATTENTION</div>
      {cards.length === 0 ? (
        <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px", fontSize: "13px", color: TEXT2 }}>
          Rien ne nécessite votre attention immédiate — le pipeline est à jour.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: "12px" }}>
          {cards.map((c) => (
            <div key={c.key} style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: TEXT, marginBottom: "10px" }}>{c.icon} {c.title}</div>
              <button className="focusable" onClick={() => onOpenProspect?.(c.prospect.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Avatar name={c.prospect.name} stage={c.prospect.stage} size={18} />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: TEXT }}>{c.prospect.company}</span>
                </div>
              </button>
              {c.lines.map((l, i) => (
                <div key={i} style={{ fontSize: "12px", color: TEXT2, marginBottom: "2px" }}>{l}</div>
              ))}
              <div style={{ fontSize: "12px", color: ACCENT, marginTop: "8px", marginBottom: "12px" }}>{c.recommendation}</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "auto" }}>
                {c.actions.map((a) => (
                  <button key={a.label} className="focusable" onClick={a.onClick} style={{ flex: 1, background: ACCENT_DIM, color: ACCENT, border: "none", borderRadius: "6px", padding: "7px 10px", fontSize: "12px", fontWeight: 600 }}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_ACTIONS = [
  { type: "relance", emoji: "✨", title: "Générer une relance", sub: "Créez un email adapté au contexte du prospect." },
  { type: "rdv", emoji: "📅", title: "Préparer un rendez-vous", sub: "Résumé, enjeux, objections et questions à poser." },
  { type: "analyse", emoji: "🔎", title: "Analyser une opportunité", sub: "Identifiez les risques et la prochaine meilleure action." },
  { type: "resume", emoji: "📝", title: "Résumer les échanges", sub: "Transformez l'historique en synthèse exploitable." },
];

function QuickActionCards({ onOpenFlow }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, letterSpacing: "0.04em", marginBottom: "12px" }}>ACTIONS RAPIDES</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.type}
            className="focusable"
            onClick={() => onOpenFlow(a.type, null)}
            style={{ display: "flex", alignItems: "center", gap: "12px", background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px", textAlign: "left" }}
          >
            <span style={{ fontSize: "20px" }}>{a.emoji}</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT }}>{a.title}</div>
              <div style={{ fontSize: "11.5px", color: TEXT2, marginTop: "2px" }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Quels deals dois-je relancer aujourd'hui ?",
  "Quels prospects sont en train de refroidir ?",
  "Combien de rendez-vous cette semaine ?",
  "Quels sont mes 5 deals les plus à risque ?",
];

function ChatPanel({ session, prospects, onOpenProspect }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const now = new Date();
      const atRisk = prospects
        .filter((p) => !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 >= 5)
        .sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0))
        .slice(0, 8);
      const pipelineSummary = prospects
        .slice(0, 40)
        .map((p) => `- ${p.name} (${p.company}) · ${p.stage} · ${formatEuros(p.deal_value || 0)} · dernier contact ${p.last_contact_at ? `${daysSince(p.last_contact_at)}j` : "jamais"}${p.next_contact_at ? ` · prochain contact ${formatShortDate(p.next_contact_at)}` : ""}`)
        .join("\n");
      const prompt = `Tu es Closia, l'assistant commercial d'un CRM. Réponds en français, de façon concise et actionnable (pas plus de 6-8 lignes), à la question du commercial en t'appuyant UNIQUEMENT sur les données de pipeline ci-dessous. Si tu cites des prospects, utilise leur nom exact. Ne dis jamais que tu n'as pas accès aux données du CRM — elles sont ci-dessous.

Pipeline actuel (${prospects.length} opportunités ouvertes) :
${pipelineSummary}

Opportunités les plus à risque (sans contact depuis 5+ jours) :
${atRisk.map((p) => `- ${p.name} (${p.company}), ${formatEuros(p.deal_value || 0)}`).join("\n") || "Aucune."}

Question du commercial : "${question}"`;
      const text2 = await callAI(prompt, session.access_token);
      setMessages((prev) => [...prev, { role: "assistant", text: text2.trim() }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: "La réponse a échoué. Réessaie.", error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, letterSpacing: "0.04em", marginBottom: "4px" }}>PARLEZ À CLOSIA</div>
      <div style={{ fontSize: "12.5px", color: TEXT2, marginBottom: "12px" }}>Posez une question sur votre activité commerciale ou demandez une action.</div>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px", maxHeight: "360px", overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.role === "user" ? ACCENT : CARD,
                color: m.role === "user" ? "#fff" : m.error ? RED : TEXT,
                border: m.role === "user" ? "none" : `0.5px solid ${BORDER}`,
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "13px",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          ))}
          {loading && <div style={{ alignSelf: "flex-start", fontSize: "12px", color: TEXT2 }}>Closia réfléchit...</div>}
        </div>
      )}

      <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "14px" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder='Que voulez-vous savoir ou faire ? Ex : "Quels sont mes 5 deals les plus à risque ?"'
          style={{ width: "100%", boxSizing: "border-box", background: "none", border: "none", outline: "none", resize: "none", fontSize: "13.5px", color: TEXT, minHeight: "56px", fontFamily: "Inter, sans-serif" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="focusable" onClick={() => send()} disabled={!input.trim() || loading} style={{ display: "flex", alignItems: "center", gap: "6px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600, opacity: !input.trim() || loading ? 0.5 : 1 }}>
            <SparklesIcon size={12} color="#fff" /> Envoyer
          </button>
        </div>
      </div>

      <div style={{ marginTop: "12px" }}>
        <div style={{ fontSize: "11.5px", color: TEXT2, marginBottom: "8px" }}>Essayez par exemple</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} className="focusable" onClick={() => send(p)} style={{ background: ACCENT_DIM, color: ACCENT, border: "none", borderRadius: "999px", padding: "7px 12px", fontSize: "12px" }}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowShell({ title, onBack, children }) {
  return (
    <div>
      <button className="focusable" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 0", marginBottom: "16px", color: TEXT2, fontSize: "13px" }}>
        ← Retour
      </button>
      <div className="display" style={{ fontWeight: 700, fontSize: "17px", color: TEXT, marginBottom: "16px" }}>{title}</div>
      {children}
    </div>
  );
}

function FlowProspectPicker({ prospects, value, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "8px", color: TEXT, fontSize: "13px", padding: "9px 12px", width: "100%", boxSizing: "border-box", marginBottom: "16px" }}
    >
      <option value="">Choisir un prospect...</option>
      {prospects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
    </select>
  );
}

function ProspectSummaryCard({ prospect, extra }) {
  return (
    <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
      <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT }}>{prospect.company} <span style={{ color: TEXT2, fontWeight: 400 }}>· {prospect.name}</span></div>
      <div style={{ fontSize: "12.5px", color: TEXT2, marginTop: "2px" }}>
        {formatEuros(prospect.deal_value || 0)} · {prospect.stage}{extra ? ` · ${extra}` : ""}
      </div>
    </div>
  );
}

function RelanceFlow({ prospectId, prospects, session, settings, onBack }) {
  const [selectedId, setSelectedId] = useState(prospectId || "");
  const [tone, setTone] = useState(TONES[0]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [context, setContext] = useState(null);
  const prospect = prospects.find((p) => p.id === selectedId);

  useEffect(() => {
    setContent("");
    setContext(null);
    if (prospect) fetchProspectContext(prospect.id).then(setContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function generate() {
    if (!prospect) return;
    setLoading(true);
    setError("");
    try {
      const ctx = context || (await fetchProspectContext(prospect.id));
      const prompt = `Tu es un assistant commercial. Rédige un email de relance en français, ton ${tone.toLowerCase()}, court (5-6 phrases), pour obtenir une réponse. Uniquement le corps de l'email, termine par une formule de politesse simple, sans nom ni signature.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Montant : ${formatEuros(prospect.deal_value || 0)}

Contexte :
${ctx.text}`;
      const text = await callAI(prompt, session.access_token);
      setContent(appendSignature(text, settings));
    } catch (e) {
      setError(e.message || "La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <FlowShell title="Générer une relance" onBack={onBack}>
      {!prospectId && <FlowProspectPicker prospects={prospects} value={selectedId} onChange={setSelectedId} />}
      {prospect && (
        <>
          <ProspectSummaryCard prospect={prospect} extra={prospect.last_contact_at ? `dernier contact il y a ${daysSince(prospect.last_contact_at)}j` : "jamais contacté"} />

          {context && (
            <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, marginBottom: "6px" }}>CONTEXTE UTILISÉ PAR CLOSIA</div>
              <div style={{ fontSize: "12.5px", color: TEXT, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{context.text}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
            {TONES.map((t) => (
              <button key={t} className="focusable" onClick={() => setTone(t)} style={{ background: tone === t ? ACCENT : CARD, color: tone === t ? "#fff" : TEXT2, border: `0.5px solid ${tone === t ? ACCENT : BORDER}`, borderRadius: "999px", padding: "6px 12px", fontSize: "12px", fontWeight: 500 }}>
                {t}
              </button>
            ))}
          </div>

          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: AI_DIM, color: AI, border: `0.5px solid ${AI_BORDER}`, borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1, marginBottom: "12px" }}>
            <SparklesIcon size={13} color={AI} /> {loading ? "Génération..." : content ? "Régénérer" : "Générer avec l'IA"}
          </button>
          {error && <div style={{ color: RED, fontSize: "12px", marginBottom: "10px" }}>{error}</div>}

          {content && (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", color: TEXT, fontSize: "13px", lineHeight: 1.6, padding: "12px", minHeight: "160px", resize: "vertical", fontFamily: "Inter, sans-serif", marginBottom: "10px" }}
              />
              <button className="focusable" onClick={copy} style={{ background: ACCENT_DIM, color: ACCENT, border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600 }}>
                {copied ? "Copié ✓" : "Copier l'email"}
              </button>
            </>
          )}
        </>
      )}
    </FlowShell>
  );
}

function AnalyseFlow({ prospectId, prospects, session, onBack }) {
  const [selectedId, setSelectedId] = useState(prospectId || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [taskCreated, setTaskCreated] = useState(false);
  const prospect = prospects.find((p) => p.id === selectedId);

  useEffect(() => {
    setResult(null);
    setTaskCreated(false);
  }, [selectedId]);

  async function generate() {
    if (!prospect) return;
    setLoading(true);
    setError("");
    try {
      const ctx = await fetchProspectContext(prospect.id);
      const prompt = `Tu es un coach commercial. Analyse cette opportunité et réponds UNIQUEMENT en JSON valide, sans texte avant ni après, exactement dans ce format :
{"probability": 72, "positive_signals": ["...", "..."], "watch_points": ["...", "..."], "next_action": "phrase courte décrivant la prochaine action concrète, avec un délai", "next_action_why": "pourquoi cette action maintenant, en une phrase"}

"probability" est un entier 0-100 représentant la probabilité de closer ce deal. Maximum 4 éléments par liste, puces courtes, en français.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Montant : ${formatEuros(prospect.deal_value || 0)}
Dernier contact : ${prospect.last_contact_at ? `il y a ${daysSince(prospect.last_contact_at)} jours` : "jamais"}

Contexte :
${ctx.text}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
      await supabase.from("analyses_ia").insert({
        user_id: session.user.id,
        prospect_id: prospect.id,
        type: "opportunite",
        content: `Probabilité : ${parsed.probability}%\n\nProchaine action : ${parsed.next_action}\n\nSignaux positifs :\n${(parsed.positive_signals || []).map((s) => `+ ${s}`).join("\n")}\n\nPoints de vigilance :\n${(parsed.watch_points || []).map((s) => `- ${s}`).join("\n")}`,
      });
      await supabase.from("prospects").update({
        last_analysis: {
          recommendation: parsed.next_action,
          positive_signals: parsed.positive_signals,
          watch_points: parsed.watch_points,
          probability: parsed.probability,
          next_action: parsed.next_action,
          next_action_why: parsed.next_action_why,
          analyzed_at: new Date().toISOString(),
        },
      }).eq("id", prospect.id);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "L'analyse a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function planCall() {
    if (!prospect || taskCreated) return;
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(11, 0, 0, 0);
    await supabase.from("tasks").insert({
      user_id: session.user.id,
      prospect_id: prospect.id,
      type: "appel_telephone",
      note: result?.next_action || `Appeler ${prospect.name}`,
      due_at: due.toISOString(),
    });
    setTaskCreated(true);
  }

  const potentialLabel = result ? (result.probability >= 65 ? "🔥 Potentiel élevé" : result.probability >= 35 ? "🟠 Potentiel moyen" : "🔵 Potentiel faible") : null;

  return (
    <FlowShell title="Analyser une opportunité" onBack={onBack}>
      {!prospectId && <FlowProspectPicker prospects={prospects} value={selectedId} onChange={setSelectedId} />}
      {prospect && (
        <>
          <ProspectSummaryCard prospect={prospect} />

          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: AI_DIM, color: AI, border: `0.5px solid ${AI_BORDER}`, borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1, marginBottom: "16px" }}>
            <SparklesIcon size={13} color={AI} /> {loading ? "Analyse..." : result ? "Réanalyser" : "Analyser avec l'IA"}
          </button>
          {error && <div style={{ color: RED, fontSize: "12px", marginBottom: "10px" }}>{error}</div>}

          {result && (
            <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT, marginBottom: "14px" }}>{potentialLabel}</div>

              <div style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", marginBottom: "6px" }}>SIGNAUX POSITIFS</div>
              <ul style={{ margin: "0 0 14px", paddingLeft: "18px", fontSize: "13px", color: TEXT, lineHeight: 1.7 }}>
                {(result.positive_signals || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>

              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)", marginBottom: "6px" }}>POINTS DE VIGILANCE</div>
              <ul style={{ margin: "0 0 16px", paddingLeft: "18px", fontSize: "13px", color: TEXT, lineHeight: 1.7 }}>
                {(result.watch_points || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>

              <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, marginBottom: "4px" }}>PROBABILITÉ ESTIMÉE</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ flex: 1, height: "6px", background: ACCENT_DIM, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${result.probability}%`, height: "100%", background: ACCENT, borderRadius: "3px" }} />
                </div>
                <span className="mono" style={{ fontSize: "14px", fontWeight: 700, color: TEXT }}>{result.probability}%</span>
              </div>

              <div style={{ borderTop: `0.5px solid ${BORDER}`, paddingTop: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: TEXT2, marginBottom: "4px" }}>PROCHAINE MEILLEURE ACTION</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT, marginBottom: "6px" }}>{result.next_action}</div>
                <div style={{ fontSize: "12px", color: TEXT2, marginBottom: "12px" }}>Pourquoi ? {result.next_action_why}</div>
                <button className="focusable" onClick={planCall} disabled={taskCreated} style={{ background: taskCreated ? "#e2f7ec" : ACCENT_DIM, color: taskCreated ? "#0ea968" : ACCENT, border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "13px", fontWeight: 600 }}>
                  {taskCreated ? "Tâche créée ✓" : "Planifier l'appel"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </FlowShell>
  );
}

function RdvFlow({ prospectId, prospects, session, onBack }) {
  const [selectedId, setSelectedId] = useState(prospectId || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const prospect = prospects.find((p) => p.id === selectedId);

  useEffect(() => { setResult(null); }, [selectedId]);

  async function generate() {
    if (!prospect) return;
    setLoading(true);
    setError("");
    try {
      const ctx = await fetchProspectContext(prospect.id);
      const prompt = `Tu es un coach commercial. Prépare ce rendez-vous. Réponds UNIQUEMENT en JSON valide, format : {"context": "résumé en 1-2 phrases de la situation", "objections": ["...", "..."], "questions": ["...", "..."], "next_objective": "..."}. Maximum 4 éléments par liste, en français.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Montant : ${formatEuros(prospect.deal_value || 0)}

Contexte :
${ctx.text}`;
      const raw = await callAI(prompt, session.access_token);
      const parsed = parseJsonLoose(raw);
      if (!parsed) throw new Error("parse_failed");
      setResult(parsed);
    } catch (e) {
      setError(e.message && e.message !== "parse_failed" ? e.message : "La préparation a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FlowShell title="Préparer un rendez-vous" onBack={onBack}>
      {!prospectId && <FlowProspectPicker prospects={prospects} value={selectedId} onChange={setSelectedId} />}
      {prospect && (
        <>
          <ProspectSummaryCard prospect={prospect} />
          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: AI_DIM, color: AI, border: `0.5px solid ${AI_BORDER}`, borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1, marginBottom: "16px" }}>
            <SparklesIcon size={13} color={AI} /> {loading ? "Préparation..." : "Préparer avec l'IA"}
          </button>
          {error && <div style={{ color: RED, fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          {result && (
            <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <PrepBlock label="Contexte">{result.context}</PrepBlock>
              <PrepBlock label="Objections probables" list={result.objections} />
              <PrepBlock label="Questions à poser" list={result.questions} />
              <PrepBlock label="Prochain objectif">{result.next_objective}</PrepBlock>
            </div>
          )}
        </>
      )}
    </FlowShell>
  );
}

function ResumeFlow({ prospectId, prospects, session, onBack }) {
  const [selectedId, setSelectedId] = useState(prospectId || "");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const prospect = prospects.find((p) => p.id === selectedId);

  useEffect(() => { setSummary(""); }, [selectedId]);

  async function generate() {
    if (!prospect) return;
    setLoading(true);
    setError("");
    try {
      const ctx = await fetchProspectContext(prospect.id);
      const prompt = `Tu es un assistant commercial. Résume l'historique de la relation avec ce prospect en français, sous forme de synthèse exploitable (5-6 phrases) : où en est la relation, ce qui a été fait, ce qui reste à faire. Réponds uniquement avec la synthèse, sans préambule.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}

Historique :
${ctx.text}`;
      const text = await callAI(prompt, session.access_token);
      setSummary(text.trim());
    } catch (e) {
      setError(e.message || "Le résumé a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <FlowShell title="Résumer les échanges" onBack={onBack}>
      {!prospectId && <FlowProspectPicker prospects={prospects} value={selectedId} onChange={setSelectedId} />}
      {prospect && (
        <>
          <ProspectSummaryCard prospect={prospect} />
          <button className="focusable" onClick={generate} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: AI_DIM, color: AI, border: `0.5px solid ${AI_BORDER}`, borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, opacity: loading ? 0.6 : 1, marginBottom: "16px" }}>
            <SparklesIcon size={13} color={AI} /> {loading ? "Résumé..." : "Résumer avec l'IA"}
          </button>
          {error && <div style={{ color: RED, fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          {summary && (
            <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: "10px", padding: "16px" }}>
              <div style={{ fontSize: "13px", color: TEXT, lineHeight: 1.6, marginBottom: "12px" }}>{summary}</div>
              <button className="focusable" onClick={copy} style={{ background: ACCENT_DIM, color: ACCENT, border: "none", borderRadius: "8px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600 }}>
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
          )}
        </>
      )}
    </FlowShell>
  );
}

function PrepBlock({ label, children, list }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: TEXT2, fontWeight: 700, marginBottom: "4px" }}>{label.toUpperCase()}</div>
      {list ? (
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: TEXT, lineHeight: 1.6 }}>
          {(list || []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: "13px", color: TEXT }}>{children}</div>
      )}
    </div>
  );
}
