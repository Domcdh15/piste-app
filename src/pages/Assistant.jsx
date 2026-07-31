import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  callAI,
  parseJsonLoose,
  isOverdue,
  formatShortDate,
  Avatar,
  SparklesIcon,
  PhoneIcon,
  MailIcon,
  TargetIcon,
  appendSignature,
  PageTitle,
} from "../lib/ui.jsx";

const TONES = ["Professionnel", "Chaleureux", "Direct"];
const LENGTHS = ["Court", "Moyen", "Détaillé"];
const OBJECTIVES = ["Relancer", "Présenter l'offre", "Répondre à une objection", "Closer"];

async function fetchProspectContext(prospectId) {
  const [emails, scripts, analyses, activities] = await Promise.all([
    supabase.from("emails_generes").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1),
    supabase.from("scripts_appel").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1),
    supabase.from("analyses_ia").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1),
    supabase.from("activities").select("*").eq("prospect_id", prospectId).order("created_at", { ascending: false }),
  ]);
  const callsAbouti = (activities.data || []).filter((a) => a.type === "appel_abouti").length;
  const callsManque = (activities.data || []).filter((a) => a.type === "appel_manque").length;
  const parts = [`Appels précédents : ${callsAbouti} abouti(s), ${callsManque} manqué(s).`];
  if (emails.data?.[0]) parts.push(`Dernier email : "${emails.data[0].content.slice(0, 300)}"`);
  if (scripts.data?.[0]) parts.push(`Dernier script (${scripts.data[0].section}) : "${scripts.data[0].content.slice(0, 200)}"`);
  if (analyses.data?.[0]) parts.push(`Dernière analyse : ${analyses.data[0].content}`);
  return parts.join("\n");
}

export default function Assistant({ session, prospects, onOpenProspect, settings }) {
  const openProspects = prospects.filter((p) => p.stage !== "Gagné" && p.stage !== "Perdu");

  return (
    <div style={{ padding: "28px 32px 48px", maxWidth: "900px" }}>
      <PageTitle icon={SparklesIcon} color="#3b82f6" style={{ marginBottom: "4px" }}>Assistant IA</PageTitle>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "22px" }}>Pas juste discuter — agir sur ton pipeline.</div>

      <QuickCommands prospects={openProspects} onOpenProspect={onOpenProspect} session={session} />
      <InsightCards prospects={openProspects} onOpenProspect={onOpenProspect} />
      <EmailGeneratorPanel prospects={openProspects} session={session} settings={settings} />
      <CallPrepPanel prospects={openProspects} session={session} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "26px" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "10px" }}>{title}</div>
      {children}
    </div>
  );
}

function ProspectPicker({ prospects, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "8px 10px" }}
    >
      <option value="">Choisir un prospect...</option>
      {prospects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
    </select>
  );
}

function QuickCommands({ prospects, onOpenProspect }) {
  const [pending, setPending] = useState(null);
  const [selected, setSelected] = useState("");
  const [prioritizing, setPrioritizing] = useState(false);

  const COMMANDS = [
    { key: "call", label: "Préparer un appel", icon: <PhoneIcon size={14} color="var(--blue)" />, tab: "script" },
    { key: "email", label: "Générer une relance", icon: <MailIcon size={14} color="var(--blue)" />, tab: "email" },
    { key: "summary", label: "Résumer un échange", icon: <SparklesIcon size={14} color="var(--blue)" />, tab: "analyse" },
    { key: "priorities", label: "Prioriser les opportunités", icon: <TargetIcon size={14} color="var(--blue)" /> },
  ];

  function trigger(cmd) {
    if (cmd.key === "priorities") {
      setPrioritizing(true);
      document.getElementById("priorities-anchor")?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => setPrioritizing(false), 300);
      return;
    }
    setPending(cmd);
    setSelected("");
  }

  function confirm() {
    if (!selected) return;
    onOpenProspect?.(selected, pending.tab);
  }

  return (
    <Section title="Zone de commande rapide">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.key}
            className="focusable"
            onClick={() => trigger(cmd)}
            style={{ display: "flex", alignItems: "center", gap: "8px", background: pending?.key === cmd.key ? "var(--blue-dim)" : "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", fontWeight: 500, textAlign: "left" }}
          >
            {cmd.icon} {cmd.label}
          </button>
        ))}
      </div>

      {pending && (
        <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}>
          <ProspectPicker prospects={prospects} value={selected} onChange={setSelected} />
          <button className="focusable" onClick={confirm} disabled={!selected} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", opacity: selected ? 1 : 0.5 }}>
            Ouvrir
          </button>
        </div>
      )}

      <div id="priorities-anchor" />
    </Section>
  );
}

function InsightCards({ prospects, onOpenProspect }) {
  const now = new Date();

  const atRisk = prospects.filter((p) => {
    const stale = !p.last_contact_at || (now - new Date(p.last_contact_at)) / 86400000 > 14;
    const overdue = p.next_contact_at && isOverdue(p.next_contact_at);
    return stale || overdue;
  }).slice(0, 5);

  const hot = prospects
    .filter((p) => p.priority >= 75 && (p.stage === "Proposition envoyée" || p.stage === "Négociation"))
    .slice(0, 5);

  const urgentFollowups = prospects
    .filter((p) => p.status === "relancer")
    .sort((a, b) => new Date(a.last_contact_at || 0) - new Date(b.last_contact_at || 0))
    .slice(0, 5);

  const toPrep = prospects
    .filter((p) => p.next_contact_at && !isOverdue(p.next_contact_at) && (new Date(p.next_contact_at) - now) / 86400000 <= 3)
    .sort((a, b) => new Date(a.next_contact_at) - new Date(b.next_contact_at))
    .slice(0, 5);

  const CARDS = [
    { title: "Opportunités à risque", accent: "var(--red)", items: atRisk, empty: "Rien à signaler." },
    { title: "Prospects chauds", accent: "#0ea968", items: hot, empty: "Aucun deal chaud identifié." },
    { title: "Relances urgentes", accent: "var(--amber)", items: urgentFollowups, empty: "Aucune relance en attente." },
    { title: "Rendez-vous à préparer", accent: "var(--blue)", items: toPrep, empty: "Rien de prévu sous 3 jours." },
  ];

  return (
    <Section title="Cartes IA">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
        {CARDS.map((card) => (
          <div key={card.title} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderTop: `2.5px solid ${card.accent}`, borderRadius: "10px", padding: "14px" }}>
            <div className="display" style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px" }}>{card.title}</div>
            {card.items.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: "12px" }}>{card.empty}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {card.items.map((p) => (
                  <button key={p.id} className="focusable" onClick={() => onOpenProspect?.(p.id)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: 0, textAlign: "left" }}>
                    <Avatar name={p.name} stage={p.stage} size={20} />
                    <span style={{ fontSize: "12px", color: "var(--blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name} <span style={{ color: "var(--text-faint)" }}>· {p.company}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function EmailGeneratorPanel({ prospects, session, settings }) {
  const [prospectId, setProspectId] = useState("");
  const [tone, setTone] = useState(settings?.ai_default_tone || TONES[0]);
  const [length, setLength] = useState(LENGTHS[0]);
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    const prospect = prospects.find((p) => p.id === prospectId);
    if (!prospect) return;
    setLoading(true);
    setError("");
    try {
      const context = await fetchProspectContext(prospect.id);
      const lengthGuide = { Court: "3-4 phrases", Moyen: "5-7 phrases", Détaillé: "8-10 phrases" }[length];
      const prompt = `Tu es un assistant commercial. Rédige un email en français, ton ${tone.toLowerCase()}, longueur ${lengthGuide}, avec pour objectif : ${objective.toLowerCase()}. Uniquement le corps de l'email, termine par une formule de politesse simple (ex : "Bonne journée,"), sans nom ni signature — la signature sera ajoutée automatiquement après.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}

Contexte des échanges précédents :
${context}`;
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
    <Section title="Générateur d'email">
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          <ProspectPicker prospects={prospects} value={prospectId} onChange={setProspectId} />
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={selectSm}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={length} onChange={(e) => setLength(e.target.value)} style={selectSm}>
            {LENGTHS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <select value={objective} onChange={(e) => setObjective(e.target.value)} style={selectSm}>
            {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <button className="focusable" onClick={generate} disabled={!prospectId || loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "9px", fontSize: "13px", opacity: !prospectId || loading ? 0.6 : 1, marginBottom: "10px" }}>
          <SparklesIcon size={13} color="var(--blue)" /> {loading ? "Génération..." : "Générer l'email"}
        </button>
        {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Le contenu généré apparaîtra ici, modifiable..."
          style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", lineHeight: 1.6, padding: "12px", minHeight: "140px", resize: "vertical", fontFamily: "Inter, sans-serif" }}
        />
        {content && (
          <button className="focusable" onClick={copy} style={{ marginTop: "8px", background: "transparent", color: "var(--text)", border: "0.5px solid var(--hairline)", borderRadius: "6px", padding: "6px 12px", fontSize: "12px" }}>
            {copied ? "Copié" : "Copier"}
          </button>
        )}
      </div>
    </Section>
  );
}

function CallPrepPanel({ prospects, session }) {
  const [prospectId, setProspectId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    const prospect = prospects.find((p) => p.id === prospectId);
    if (!prospect) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const context = await fetchProspectContext(prospect.id);
      const prompt = `Tu es un coach commercial. Prépare cet appel de vente. Réponds UNIQUEMENT en JSON valide, format : {"context": "résumé en 1-2 phrases de la situation", "objections": ["...", "..."], "questions": ["...", "..."], "next_objective": "..."}. Maximum 3 éléments par liste, en français.

Nom du contact : ${prospect.name}
Entreprise : ${prospect.company}
Étape du pipeline : ${prospect.stage}
Statut : ${prospect.status}

Contexte :
${context}`;
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
    <Section title="Préparation d'appel">
      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          <ProspectPicker prospects={prospects} value={prospectId} onChange={setProspectId} />
          <button className="focusable" onClick={generate} disabled={!prospectId || loading} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 14px", fontSize: "13px", opacity: !prospectId || loading ? 0.6 : 1 }}>
            <SparklesIcon size={13} color="var(--blue)" /> {loading ? "Préparation..." : "Préparer"}
          </button>
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PrepBlock label="Contexte">{result.context}</PrepBlock>
            <PrepBlock label="Objections probables" list={result.objections} />
            <PrepBlock label="Questions à poser" list={result.questions} />
            <PrepBlock label="Prochain objectif">{result.next_objective}</PrepBlock>
          </div>
        )}
      </div>
    </Section>
  );
}

function PrepBlock({ label, children, list }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "4px" }}>{label.toUpperCase()}</div>
      {list ? (
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--text)", lineHeight: 1.6 }}>
          {(list || []).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: "13px", color: "var(--text)" }}>{children}</div>
      )}
    </div>
  );
}

const selectSm = {
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "13px",
  padding: "8px 10px",
};
