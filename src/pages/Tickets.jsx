import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  PageTitle, Avatar, ArrowLeftIcon, ClockIcon, AlertIcon, TicketIcon, SparklesIcon,
  formatRelative, inputStyle, selectStyle, callAI,
} from "../lib/ui.jsx";

// Un ticket suit une demande d'un client. Une tâche est une action à mener.
// Les deux se ressemblent de loin, mais on ne ferme pas un ticket parce qu'on
// a fait l'action : on le ferme quand le client n'attend plus rien.

const STATUTS = {
  nouveau: { label: "Nouveau", color: "#147ff5" },
  en_cours: { label: "En cours", color: "#8b5cf6" },
  attente_client: { label: "Attente client", color: "#d97706" },
  resolu: { label: "Résolu", color: "#16a34a" },
  ferme: { label: "Fermé", color: "#64748b" },
};

const PRIORITES = {
  basse: { label: "Basse", color: "#94a3b8" },
  normale: { label: "Normale", color: "#64748b" },
  haute: { label: "Haute", color: "#ea580c" },
  urgente: { label: "Urgente", color: "#dc2626" },
};

const TYPES = {
  demande: "Demande",
  probleme: "Problème",
  question: "Question",
  reclamation: "Réclamation",
};

// Un ticket ouvert attend encore quelque chose de nous ou du client.
const OUVERTS = ["nouveau", "en_cours", "attente_client"];

// Suggestions par défaut. Elles ne contraignent rien : le champ reste libre,
// et l'admin peut remplacer la liste depuis les paramètres, parce qu'un
// menuisier et un avocat ne reçoivent pas les mêmes demandes.
export const OBJETS_PAR_DEFAUT = {
  demande: [
    "Demande de devis",
    "Demande d'information",
    "Demande de rendez-vous",
    "Demande de documentation",
    "Modification de commande",
    "Résiliation du contrat",
  ],
  probleme: [
    "Produit défectueux",
    "Commande non reçue",
    "Commande endommagée",
    "Problème technique",
    "Erreur de facturation",
    "Impossible d'accéder au service",
  ],
  question: [
    "Question sur un produit",
    "Question sur une facture",
    "Question sur le contrat",
    "Question sur la livraison",
    "Aide à l'utilisation",
  ],
  reclamation: [
    "Retard de livraison",
    "Prestation non conforme",
    "Facturation contestée",
    "Qualité du service",
    "Demande de remboursement",
  ],
};

export function objetsProposes(team) {
  const perso = team?.team?.ticket_subjects;
  if (!perso || typeof perso !== "object") return OBJETS_PAR_DEFAUT;
  const fusion = {};
  for (const t of Object.keys(OBJETS_PAR_DEFAUT)) {
    fusion[t] = Array.isArray(perso[t]) ? perso[t] : OBJETS_PAR_DEFAUT[t];
  }
  return fusion;
}

const ROLES = { admin: "Responsable", sales: "Commercial", customer_success: "Customer Success" };

// Un ticket a un propriétaire nommé, et on doit voir à quel titre il le porte :
// un commercial qui suit une demande avant signature et un CSM qui suit un
// client après signature ne font pas le même travail.
function ChoixProprietaire({ valeur, membres, onChange, style, fusionne }) {
  const commerciaux = membres.filter((m) => m.role === "admin" || m.role === "sales");
  const csm = membres.filter((m) => m.role === "customer_success");
  const nom = (m) => [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email;
  // Équipe où le commercial suit aussi ses clients : séparer les deux
  // populations dans la liste n'aurait plus aucun sens.
  if (fusionne) {
    return (
      <select value={valeur || ""} onChange={(e) => onChange(e.target.value || null)} style={style}>
        <option value="">Personne</option>
        {membres.map((m) => <option key={m.user_id} value={m.user_id}>{nom(m)}</option>)}
      </select>
    );
  }
  return (
    <select value={valeur || ""} onChange={(e) => onChange(e.target.value || null)} style={style}>
      <option value="">Personne</option>
      {commerciaux.length > 0 && (
        <optgroup label="Commercial">
          {commerciaux.map((m) => <option key={m.user_id} value={m.user_id}>{nom(m)}</option>)}
        </optgroup>
      )}
      {csm.length > 0 && (
        <optgroup label="Customer Success">
          {csm.map((m) => <option key={m.user_id} value={m.user_id}>{nom(m)}</option>)}
        </optgroup>
      )}
    </select>
  );
}

function Pastille({ texte, couleur, fort }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "2px 8px", borderRadius: "999px", fontSize: "11px",
      fontWeight: 600, whiteSpace: "nowrap",
      background: fort ? couleur : `${couleur}1a`, color: fort ? "#fff" : couleur,
    }}>
      {texte}
    </span>
  );
}

function formatHeure(d) {
  return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Un ticket arrive rarement sans destinataire naturel : si le contact est déjà
// client, c'est le CSM qui le suit ; s'il est encore prospect, c'est le
// commercial. Quand personne n'est nommé, le ticket revient à l'admin — mieux
// vaut un responsable par défaut qu'un ticket que personne ne regarde.
const STAGE_CLIENT = "Gagné";

export function proprietaireParDefaut(client, membres = []) {
  const admin = membres.find((m) => m.role === "admin")?.user_id || null;
  if (!client) return admin;
  const estClient = client.stage === STAGE_CLIENT;
  const pressenti = estClient
    ? client.csm_owner_id || client.sales_owner_id
    : client.sales_owner_id || client.csm_owner_id;
  // Un propriétaire qui a quitté l'équipe ne doit pas récupérer le ticket.
  const present = pressenti && membres.some((m) => m.user_id === pressenti);
  return present ? pressenti : admin;
}

export function motifAttribution(client, membres = [], choisi) {
  if (!choisi) return null;
  const admin = membres.find((m) => m.role === "admin")?.user_id || null;
  if (client && client.stage === STAGE_CLIENT && choisi === client.csm_owner_id) return "Suivi par le CSM du client.";
  if (client && choisi === client.sales_owner_id) return "Suivi par le commercial du contact.";
  if (choisi === admin) return "Personne n'est encore rattaché à ce contact : l'admin en devient responsable.";
  return null;
}

export default function Tickets({ session, prospects = [], team, onOpenProspect }) {
  const [tickets, setTickets] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState("ouverts");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [creation, setCreation] = useState(false);

  const membres = team?.members || [];
  const monId = session?.user?.id;

  async function charger() {
    setChargement(true);
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setErreur(error.message);
    else { setErreur(null); setTickets(data || []); }
    setChargement(false);
  }

  useEffect(() => { charger(); }, []);

  const parProspect = useMemo(() => {
    const m = {};
    for (const p of prospects) m[p.id] = p;
    return m;
  }, [prospects]);

  const nomMembre = (userId) => {
    if (!userId) return null;
    const m = membres.find((x) => x.user_id === userId);
    if (!m) return null;
    const nom = [m.first_name, m.last_name].filter(Boolean).join(" ");
    return nom || m.email || null;
  };

  const roleMembre = (userId) => ROLES[membres.find((x) => x.user_id === userId)?.role] || null;

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filtre === "ouverts" && !OUVERTS.includes(t.status)) return false;
      if (filtre === "mes" && t.assigned_to !== monId) return false;
      if (filtre === "resolus" && !["resolu", "ferme"].includes(t.status)) return false;
      if (!q) return true;
      const client = parProspect[t.prospect_id];
      const champs = [t.subject, String(t.number), client?.name, client?.company];
      return champs.some((c) => c && String(c).toLowerCase().includes(q));
    });
  }, [tickets, filtre, recherche, monId, parProspect]);

  const compteurs = useMemo(() => ({
    ouverts: tickets.filter((t) => OUVERTS.includes(t.status)).length,
    mes: tickets.filter((t) => t.assigned_to === monId && OUVERTS.includes(t.status)).length,
    resolus: tickets.filter((t) => ["resolu", "ferme"].includes(t.status)).length,
    tous: tickets.length,
  }), [tickets, monId]);

  if (ouvert) {
    return (
      <DetailTicket
        ticket={ouvert}
        session={session}
        membres={membres}
        client={parProspect[ouvert.prospect_id] || null}
        nomMembre={nomMembre}
        onOpenProspect={onOpenProspect}
        roleMembre={roleMembre}
        fusionne={!!team?.team?.sales_is_csm}
        onRetour={() => setOuvert(null)}
        onMaj={(maj) => {
          setTickets((prev) => prev.map((t) => (t.id === maj.id ? maj : t)));
          setOuvert(maj);
        }}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "980px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <PageTitle icon={TicketIcon} color="var(--blue)">Tickets</PageTitle>
        <button
          className="focusable"
          onClick={() => setCreation(true)}
          style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "9px", padding: "9px 15px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          Nouveau ticket
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {[
          { cle: "ouverts", label: "Ouverts" },
          { cle: "mes", label: "Les miens" },
          { cle: "resolus", label: "Résolus" },
          { cle: "tous", label: "Tous" },
        ].map((f) => {
          const actif = filtre === f.cle;
          return (
            <button
              key={f.cle}
              className="focusable"
              onClick={() => setFiltre(f.cle)}
              style={{
                border: "0.5px solid var(--hairline)", borderRadius: "999px",
                padding: "6px 13px", fontSize: "12.5px", cursor: "pointer",
                fontWeight: actif ? 600 : 500,
                background: actif ? "var(--blue-dim)" : "var(--panel)",
                color: actif ? "var(--blue)" : "var(--text-dim)",
              }}
            >
              {f.label}
              {compteurs[f.cle] > 0 && <span style={{ marginLeft: "6px", opacity: 0.65 }}>{compteurs[f.cle]}</span>}
            </button>
          );
        })}
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          style={{ ...inputStyle, marginLeft: "auto", minWidth: "180px" }}
        />
      </div>

      {erreur && (
        <div style={{ background: "#dc26261a", color: "#dc2626", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", marginBottom: "14px" }}>
          Impossible de charger les tickets : {erreur}
        </div>
      )}

      {chargement ? (
        <div style={{ color: "var(--text-faint)", fontSize: "13px", padding: "30px 0" }}>Chargement…</div>
      ) : visibles.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-lg, 14px)", padding: "40px 26px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
            {tickets.length === 0 ? "Aucun ticket pour le moment" : "Aucun ticket ne correspond"}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-faint)", maxWidth: "380px", margin: "0 auto" }}>
            {tickets.length === 0
              ? "Les demandes de vos clients — devis, problèmes, réclamations — se suivent ici jusqu'à leur résolution."
              : "Essayez un autre filtre ou une autre recherche."}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-lg, 14px)", overflow: "hidden" }}>
          {visibles.map((t, i) => {
            const client = parProspect[t.prospect_id];
            const st = STATUTS[t.status] || STATUTS.nouveau;
            const pr = PRIORITES[t.priority] || PRIORITES.normale;
            const enRetard = t.due_at && OUVERTS.includes(t.status) && new Date(t.due_at) < new Date();
            const responsable = nomMembre(t.assigned_to);
            return (
              <button
                key={t.id}
                className="focusable"
                onClick={() => setOuvert(t)}
                style={{
                  display: "flex", alignItems: "center", gap: "12px", width: "100%",
                  padding: "13px 16px", background: "none", cursor: "pointer",
                  textAlign: "left", border: "none",
                  borderTop: i === 0 ? "none" : "0.5px solid var(--hairline)",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums", width: "38px", flexShrink: 0 }}>
                  #{t.number}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.subject}
                  </span>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--text-faint)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[client?.company || client?.name, TYPES[t.type], formatRelative(t.created_at)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {enRetard && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#dc2626", fontWeight: 600 }}>
                    <AlertIcon size={12} color="#dc2626" /> En retard
                  </span>
                )}
                {t.priority !== "normale" && <Pastille texte={pr.label} couleur={pr.color} />}
                <Pastille texte={st.label} couleur={st.color} />
                {responsable && <Avatar name={responsable} size={24} />}
              </button>
            );
          })}
        </div>
      )}

      {creation && (
        <ModaleCreation
          session={session}
          team={team}
          prospects={prospects}
          membres={membres}
          onFermer={() => setCreation(false)}
          onCree={(t) => { setCreation(false); setTickets((prev) => [t, ...prev]); setOuvert(t); }}
        />
      )}
    </div>
  );
}

function Champ({ label, children, aide }) {
  return (
    <div style={{ marginBottom: "13px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "5px" }}>{label}</label>
      {children}
      {aide && <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "4px" }}>{aide}</div>}
    </div>
  );
}

function ModaleCreation({ session, team, prospects, membres, onFermer, onCree }) {
  const [type, setType] = useState("demande");
  const [objet, setObjet] = useState("");
  const [prospectId, setProspectId] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [assigne, setAssigne] = useState(() => proprietaireParDefaut(null, membres) || "");
  // Choisir soi-même un responsable doit tenir : la règle ne se réapplique
  // qu'aussi longtemps que personne n'a touché le champ.
  const [assigneManuel, setAssigneManuel] = useState(false);
  const [echeance, setEcheance] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const propositions = objetsProposes(team)[type] || [];
  const teamId = team?.team?.id;

  const clientChoisi = prospects.find((p) => p.id === prospectId) || null;

  useEffect(() => {
    if (assigneManuel) return;
    setAssigne(proprietaireParDefaut(clientChoisi, membres) || "");
  }, [prospectId, assigneManuel, membres, clientChoisi]);

  const clients = useMemo(
    () => [...prospects].sort((a, b) => (a.company || a.name || "").localeCompare(b.company || b.name || "")),
    [prospects]
  );

  async function creer() {
    if (!objet.trim()) { setErreur("L'objet est obligatoire."); return; }
    if (!teamId) { setErreur("Équipe introuvable, rechargez la page."); return; }
    setEnvoi(true);
    setErreur(null);

    const client = clientChoisi;
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        team_id: teamId,
        prospect_id: prospectId || null,
        company_id: client?.company_id || null,
        subject: objet.trim(),
        type,
        priority: priorite,
        assigned_to: assigne || null,
        created_by: session?.user?.id || null,
        due_at: echeance ? new Date(echeance).toISOString() : null,
      })
      .select()
      .single();

    if (error) { setErreur(error.message); setEnvoi(false); return; }

    // La demande initiale est un message comme les autres : elle doit
    // apparaître dans le fil, pas dans un champ à part.
    if (message.trim()) {
      await supabase.from("ticket_messages").insert({
        ticket_id: data.id,
        sender_type: "client",
        sender_email: client?.email || null,
        body: message.trim(),
      });
    }

    setEnvoi(false);
    onCree(data);
  }

  return (
    <div
      onClick={onFermer}
      style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--panel)", border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius-lg, 14px)", padding: "22px", maxWidth: "480px", width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-md)" }}
      >
        <div className="display" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "16px" }}>Nouveau ticket</div>

        <Champ label="Type">
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {Object.entries(TYPES).map(([cle, label]) => {
              const actif = type === cle;
              return (
                <button
                  key={cle}
                  className="focusable"
                  onClick={() => setType(cle)}
                  style={{
                    border: "0.5px solid var(--hairline)", borderRadius: "999px",
                    padding: "6px 12px", fontSize: "12.5px", cursor: "pointer",
                    fontWeight: actif ? 600 : 500,
                    background: actif ? "var(--blue-dim)" : "var(--panel2)",
                    color: actif ? "var(--blue)" : "var(--text-dim)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Champ>

        <Champ label="Objet de la demande" aide="Choisissez une proposition ou écrivez la vôtre.">
          <input
            list="objets-tickets"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            placeholder="Ex. : Demande de devis"
            style={{ ...inputStyle, width: "100%" }}
          />
          <datalist id="objets-tickets">
            {propositions.map((o) => <option key={o} value={o} />)}
          </datalist>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "7px" }}>
            {propositions.slice(0, 6).map((o) => (
              <button
                key={o}
                className="focusable"
                onClick={() => setObjet(o)}
                style={{ border: "0.5px solid var(--hairline)", borderRadius: "7px", padding: "4px 9px", fontSize: "11.5px", background: "var(--panel2)", color: "var(--text-dim)", cursor: "pointer" }}
              >
                {o}
              </button>
            ))}
          </div>
        </Champ>

        <Champ label="Client concerné">
          <select value={prospectId} onChange={(e) => setProspectId(e.target.value)} style={{ ...selectStyle, fontSize: "13px", padding: "8px 10px" }}>
            <option value="">Aucun pour l'instant</option>
            {clients.map((p) => (
              <option key={p.id} value={p.id}>{p.company ? `${p.company} — ${p.name}` : p.name}</option>
            ))}
          </select>
        </Champ>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <Champ label="Priorité">
            <select value={priorite} onChange={(e) => setPriorite(e.target.value)} style={{ ...selectStyle, fontSize: "13px", padding: "8px 10px" }}>
              {Object.entries(PRIORITES).map(([cle, p]) => <option key={cle} value={cle}>{p.label}</option>)}
            </select>
          </Champ>
          <Champ label="Échéance">
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </Champ>
        </div>

        <Champ label="Propriétaire du ticket" aide={assigneManuel ? null : motifAttribution(clientChoisi, membres, assigne)}>
          <ChoixProprietaire
            valeur={assigne}
            membres={membres}
            fusionne={!!team?.team?.sales_is_csm}
            onChange={(v) => { setAssigneManuel(true); setAssigne(v || ""); }}
            style={{ ...selectStyle, fontSize: "13px", padding: "8px 10px" }}
          />
        </Champ>

        <Champ label="Demande du client" aide="Facultatif — ce texte ouvre le fil de discussion.">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Ce que le client vous a demandé, dans ses mots."
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </Champ>

        {erreur && <div style={{ color: "#dc2626", fontSize: "12.5px", marginBottom: "10px" }}>{erreur}</div>}

        <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
          <button
            className="focusable"
            onClick={creer}
            disabled={envoi || !objet.trim()}
            style={{ flex: 1, background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: envoi || !objet.trim() ? 0.6 : 1 }}
          >
            {envoi ? "Création…" : "Créer le ticket"}
          </button>
          <button
            className="focusable"
            onClick={onFermer}
            style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", cursor: "pointer" }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailTicket({ ticket, session, membres, client, nomMembre, roleMembre, fusionne, onOpenProspect, onRetour, onMaj }) {
  const [messages, setMessages] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [brouillon, setBrouillon] = useState("");
  const [interne, setInterne] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [travailIA, setTravailIA] = useState(null);
  const [resume, setResume] = useState(null);
  const [quotaEpuise, setQuotaEpuise] = useState(null);
  const finFil = useRef(null);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (annule) return;
        if (error) setErreur(error.message);
        else setMessages(data || []);
        setChargement(false);
      });
    return () => { annule = true; };
  }, [ticket.id]);

  useEffect(() => { finFil.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  async function modifier(champs) {
    const { data, error } = await supabase
      .from("tickets")
      .update(champs)
      .eq("id", ticket.id)
      .select()
      .single();
    if (error) setErreur(error.message);
    else { setErreur(null); onMaj(data); }
  }

  // Résolu et fermé portent une date : sans elle, impossible de mesurer un
  // délai de traitement plus tard.
  function changerStatut(statut) {
    const maintenant = new Date().toISOString();
    modifier({
      status: statut,
      resolved_at: statut === "resolu" ? maintenant : ["ferme"].includes(statut) ? ticket.resolved_at : null,
      closed_at: statut === "ferme" ? maintenant : null,
    });
  }

  async function envoyer() {
    const corps = brouillon.trim();
    if (!corps) return;
    setEnvoi(true);
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_type: "agent",
        sender_id: session?.user?.id || null,
        sender_email: session?.user?.email || null,
        body: corps,
        is_internal: interne,
      })
      .select()
      .single();
    setEnvoi(false);
    if (error) { setErreur(error.message); return; }
    setErreur(null);
    setMessages((prev) => [...prev, data]);
    setBrouillon("");
    // Répondre à un ticket neuf, c'est le prendre en charge.
    if (!interne && ticket.status === "nouveau") changerStatut("en_cours");
  }

  // Le fil tel qu'il sera donné à l'IA. Les notes internes en font partie :
  // elles portent souvent le contexte qui manque au client.
  function filTexte() {
    return messages
      .map((m) => `${m.sender_type === "client" ? "Client" : m.is_internal ? "Note interne" : "Nous"} : ${m.body}`)
      .join("\n\n");
  }

  // L'IA ne se déclenche jamais seule : c'est l'utilisateur qui appuie, et
  // chaque génération est décomptée de son quota.
  async function lancerIA(quoi) {
    if (messages.length === 0) return;
    setTravailIA(quoi);
    setErreur(null);
    setQuotaEpuise(null);
    const entete = `Ticket « ${ticket.subject} » (${TYPES[ticket.type]}) du client ${client?.company || client?.name || "inconnu"}.`;
    const consigne = quoi === "reponse"
      ? `${entete}\n\nÉchange à ce jour :\n${filTexte()}\n\nRédige la prochaine réponse au client, en français, polie et concrète. `
        + `Va droit au fait, n'invente aucun engagement de date ni de montant qui ne figure pas ci-dessus, `
        + `et termine par une prochaine étape claire. Donne uniquement le texte de la réponse, sans objet ni signature.`
      : `${entete}\n\nÉchange à ce jour :\n${filTexte()}\n\nRésume ce fil en cinq lignes maximum : ce que demande le client, `
        + `ce qui a déjà été répondu, ce qui reste à faire. Pas de formule de politesse, pas de titre.`;
    try {
      const texte = await callAI(consigne, session?.access_token);
      if (quoi === "reponse") setBrouillon(texte.trim());
      else setResume(texte.trim());
    } catch (e) {
      if (e.quotaExhausted) setQuotaEpuise(e.message);
      else setErreur(e.message);
    } finally {
      setTravailIA(null);
    }
  }

  const st = STATUTS[ticket.status] || STATUTS.nouveau;
  const enRetard = ticket.due_at && OUVERTS.includes(ticket.status) && new Date(ticket.due_at) < new Date();

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "880px" }}>
      <button
        className="focusable"
        onClick={onRetour}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", padding: "4px 0", marginBottom: "14px" }}
      >
        <ArrowLeftIcon size={14} color="var(--text-dim)" /> Tous les tickets
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "6px" }}>
        <span style={{ fontSize: "13px", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums", marginTop: "5px" }}>#{ticket.number}</span>
        <div className="display" style={{ fontSize: "21px", fontWeight: 800, letterSpacing: "-0.01em", flex: 1, minWidth: "200px" }}>{ticket.subject}</div>
        <Pastille texte={st.label} couleur={st.color} fort />
      </div>

      <div style={{ fontSize: "12.5px", color: "var(--text-faint)", marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span>{TYPES[ticket.type]}</span>
        <span>·</span>
        <span>Ouvert {formatRelative(ticket.created_at)?.toLowerCase()}</span>
        {client && (
          <>
            <span>·</span>
            <button
              className="focusable"
              onClick={() => onOpenProspect?.(client.id)}
              style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "12.5px", cursor: "pointer", padding: 0 }}
            >
              {client.company || client.name}
            </button>
          </>
        )}
        {enRetard && (
          <>
            <span>·</span>
            <span style={{ color: "#dc2626", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <ClockIcon size={12} color="#dc2626" /> Échéance dépassée
            </span>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}>
        <Champ label="Statut">
          <select value={ticket.status} onChange={(e) => changerStatut(e.target.value)} style={selectStyle}>
            {Object.entries(STATUTS).map(([cle, s]) => <option key={cle} value={cle}>{s.label}</option>)}
          </select>
        </Champ>
        <Champ label="Priorité">
          <select value={ticket.priority} onChange={(e) => modifier({ priority: e.target.value })} style={selectStyle}>
            {Object.entries(PRIORITES).map(([cle, p]) => <option key={cle} value={cle}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Propriétaire" aide={roleMembre?.(ticket.assigned_to)}>
          <ChoixProprietaire
            valeur={ticket.assigned_to}
            membres={membres}
            fusionne={fusionne}
            onChange={(v) => modifier({ assigned_to: v })}
            style={selectStyle}
          />
        </Champ>
        <Champ label="Échéance">
          <input
            type="date"
            value={ticket.due_at ? new Date(ticket.due_at).toISOString().slice(0, 10) : ""}
            onChange={(e) => modifier({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            style={selectStyle}
          />
        </Champ>
      </div>

      {erreur && (
        <div style={{ background: "#dc26261a", color: "#dc2626", borderRadius: "10px", padding: "10px 13px", fontSize: "12.5px", marginBottom: "14px" }}>{erreur}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
        {chargement ? (
          <div style={{ color: "var(--text-faint)", fontSize: "13px" }}>Chargement du fil…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: "13px", padding: "16px 0" }}>Aucun échange pour l'instant.</div>
        ) : (
          messages.map((m) => {
            const auteur = m.sender_type === "agent"
              ? (nomMembre(m.sender_id) || m.sender_email || "Vous")
              : (client?.name || m.sender_email || "Le client");
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: m.sender_type === "agent" ? "flex-end" : "flex-start",
                  maxWidth: "78%",
                  background: m.is_internal ? "#d977061a" : m.sender_type === "agent" ? "var(--blue-dim)" : "var(--panel)",
                  border: `0.5px solid ${m.is_internal ? "#d9770633" : "var(--hairline)"}`,
                  borderRadius: "12px",
                  padding: "11px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
                  <Avatar name={auteur} size={20} />
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>{auteur}</span>
                  {m.is_internal && <Pastille texte="Note interne" couleur="#d97706" />}
                  <span style={{ fontSize: "11px", color: "var(--text-faint)", marginLeft: "auto" }}>{formatHeure(m.created_at)}</span>
                </div>
                <div style={{ fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            );
          })
        )}
        <div ref={finFil} />
      </div>

      {resume && (
        <div style={{ background: "var(--blue-dim)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "13px 15px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px" }}>
            <SparklesIcon size={13} color="var(--blue)" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--blue)" }}>Résumé du fil</span>
            <button
              className="focusable"
              onClick={() => setResume(null)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-faint)", fontSize: "12px", cursor: "pointer" }}
            >
              Masquer
            </button>
          </div>
          <div style={{ fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{resume}</div>
        </div>
      )}

      {quotaEpuise && (
        <RelanceQuota session={session} message={quotaEpuise} onFermer={() => setQuotaEpuise(null)} />
      )}

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginBottom: "10px" }}>
          {[
            { cle: "reponse", label: "Rédiger une réponse" },
            { cle: "resume", label: "Résumer le fil" },
          ].map((a) => (
            <button
              key={a.cle}
              className="focusable"
              onClick={() => lancerIA(a.cle)}
              disabled={!!travailIA || messages.length === 0}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                border: "0.5px solid var(--hairline)", borderRadius: "8px",
                padding: "6px 11px", fontSize: "12.5px", fontWeight: 600,
                background: "var(--panel2)", color: "var(--blue)",
                cursor: travailIA || messages.length === 0 ? "default" : "pointer",
                opacity: travailIA || messages.length === 0 ? 0.55 : 1,
              }}
            >
              <SparklesIcon size={12} color="var(--blue)" />
              {travailIA === a.cle ? "Génération…" : a.label}
            </button>
          ))}
          <span style={{ fontSize: "11.5px", color: "var(--text-faint)", alignSelf: "center" }}>
            Décompté de votre quota IA
          </span>
        </div>
        <textarea
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          rows={3}
          placeholder={interne ? "Note visible par votre équipe seulement…" : "Votre réponse au client…"}
          style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: "10px" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-dim)", cursor: "pointer" }}>
            <input type="checkbox" checked={interne} onChange={(e) => setInterne(e.target.checked)} />
            Note interne
          </label>
          <button
            className="focusable"
            onClick={envoyer}
            disabled={envoi || !brouillon.trim()}
            style={{ marginLeft: "auto", background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: envoi || !brouillon.trim() ? 0.6 : 1 }}
          >
            {envoi ? "Envoi…" : interne ? "Ajouter la note" : "Répondre"}
          </button>
        </div>
        <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "8px" }}>
          La réponse est enregistrée dans le fil du ticket. L'envoi par email arrivera avec la boîte support.
        </div>
      </div>
    </div>
  );
}

// Quota épuisé : c'est le signe de quelqu'un qui se sert de l'outil, pas d'une
// faute à sanctionner. On lui vend la capacité dont il a besoin plutôt que de
// le renvoyer vers une formule supérieure pour un seul mois chargé.
function RelanceQuota({ session, message, onFermer }) {
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function demander() {
    setEnvoi(true);
    setErreur(null);
    const texte = "Demande de recharge IA : 500 générations supplémentaires pour ce mois.";
    const { error } = await supabase.from("support_requests").insert({
      user_id: session.user.id,
      user_email: session.user.email,
      message: texte,
      messages: [{ from: "client", body: texte, at: new Date().toISOString() }],
    });
    setEnvoi(false);
    if (error) setErreur("L'envoi a échoué. Réessayez.");
    else setEnvoye(true);
  }

  return (
    <div style={{ background: "#d977061a", border: "0.5px solid #d9770633", borderRadius: "12px", padding: "13px 15px", marginBottom: "12px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "5px" }}>Quota d'IA épuisé</div>
      <div style={{ fontSize: "12.5px", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "11px" }}>{message}</div>
      {envoye ? (
        <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
          Demande envoyée. Votre recharge sera activée sous peu, et vous pourrez reprendre là où vous en étiez.
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="focusable"
            onClick={demander}
            disabled={envoi}
            style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
          >
            {envoi ? "Envoi…" : "Demander 500 générations"}
          </button>
          <button
            className="focusable"
            onClick={onFermer}
            style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "12.5px", cursor: "pointer" }}
          >
            Plus tard
          </button>
          {erreur && <span style={{ fontSize: "12px", color: "#dc2626" }}>{erreur}</span>}
        </div>
      )}
    </div>
  );
}
