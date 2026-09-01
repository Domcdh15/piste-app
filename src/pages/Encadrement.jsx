import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  PageTitle, Avatar, UsersIcon, SparklesIcon, ArrowLeftIcon, BadgeAbsent,
  OPEN_STAGES, CLOSED_STAGES, formatEuros, formatDate, formatRelative, callAI, selectStyle,
} from "../lib/ui.jsx";

// ESPACE D'ENCADREMENT
//
// Un tableau de bord de plus n'aiderait personne. Ce que fait un manager, c'est
// un point avec quelqu'un : il a besoin de savoir où en est cette personne
// aujourd'hui, ce qui avance et ce qui coince, avant d'ouvrir la conversation.
// L'écran est donc organisé par personne, pas par indicateur.

// Au-delà de ce délai sans le moindre échange, une affaire ouverte s'endort.
const JOURS_SANS_CONTACT = 14;

function jours(depuis) {
  if (!depuis) return null;
  return Math.floor((Date.now() - new Date(depuis).getTime()) / 86400000);
}

function nomDe(m) {
  if (!m) return "—";
  return [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—";
}

// Ce que le manager encadre détermine qui il peut suivre. Les règles d'accès
// le garantissent déjà côté base ; on filtre ici pour ne pas afficher des
// cartes vides pour des gens dont il ne verra rien.
function equipeSuivie(membres, perimetre) {
  if (perimetre === "both") return membres.filter((m) => m.role !== "admin" || m.manages !== "none");
  if (perimetre === "sales") return membres.filter((m) => m.role === "sales");
  if (perimetre === "csm") return membres.filter((m) => m.role === "customer_success");
  return [];
}

// SANTÉ D'UN CLIENT
//
// Calculée à la volée, jamais stockée : un score figé en base vieillit mal et
// personne ne sait plus de quand il date. On rend aussi les raisons, parce
// qu'un nombre seul n'aide pas à préparer un point — ce qui aide, c'est de
// savoir quoi dire.
function santeClient(client, tickets, activites) {
  const siens = tickets.filter((t) => t.prospect_id === client.id);
  const ouverts = siens.filter((t) => ["nouveau", "en_cours", "attente_client"].includes(t.status));
  const reclamations = siens.filter((t) => t.type === "reclamation" && (jours(t.created_at) ?? 999) <= 90);
  const enRetard = ouverts.filter((t) => t.due_at && new Date(t.due_at) < new Date());
  const dernierEchange = activites
    .filter((a) => a.prospect_id === client.id)
    .reduce((max, a) => (!max || a.created_at > max ? a.created_at : max), null);
  const silence = jours(dernierEchange || client.closed_at || client.created_at) ?? 0;

  const raisons = [];
  let score = 100;
  if (ouverts.length > 1) { score -= 15 * (ouverts.length - 1); raisons.push(`${ouverts.length} tickets ouverts en même temps`); }
  if (reclamations.length > 0) { score -= 25 * reclamations.length; raisons.push(`${reclamations.length} réclamation${reclamations.length > 1 ? "s" : ""} sur 90 jours`); }
  if (enRetard.length > 0) { score -= 15; raisons.push(`${enRetard.length} ticket${enRetard.length > 1 ? "s" : ""} au-delà de son échéance`); }
  if (silence > 60) { score -= 20; raisons.push(`aucun échange depuis ${silence} jours`); }

  return { score: Math.max(0, Math.min(100, score)), raisons, ouverts: ouverts.length };
}

function Bloc({ titre, children, ton }) {
  const couleurs = {
    bien: { fond: "#16a34a12", bord: "#16a34a2e", texte: "#15803d" },
    alerte: { fond: "#d9770612", bord: "#d977062e", texte: "#b45309" },
    neutre: { fond: "var(--panel)", bord: "var(--hairline)", texte: "var(--text-dim)" },
  }[ton || "neutre"];
  return (
    <div style={{ background: couleurs.fond, border: `0.5px solid ${couleurs.bord}`, borderRadius: "12px", padding: "15px 17px" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: couleurs.texte, marginBottom: "10px", letterSpacing: "0.01em" }}>
        {titre}
      </div>
      {children}
    </div>
  );
}

function Ligne({ libelle, valeur, alerte }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "14px", padding: "4px 0" }}>
      <span style={{ fontSize: "12.5px", color: "var(--text-dim)", minWidth: 0 }}>{libelle}</span>
      <span style={{
        fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        color: alerte ? "#dc2626" : "var(--text)",
      }}>
        {valeur}
      </span>
    </div>
  );
}

// Tout ce qu'on sait d'une personne, calculé une fois pour la carte comme
// pour la fiche détaillée.
function bilanDe(userId, fiches, taches, activites, tickets) {
  const siennes = fiches.filter((p) => p.sales_owner_id === userId || p.csm_owner_id === userId);
  const ouvertes = siennes.filter((p) => OPEN_STAGES.includes(p.stage));
  const gagnees = siennes.filter((p) => p.stage === "Gagné");
  const perdues = siennes.filter((p) => p.stage === "Perdu");
  const closes = gagnees.length + perdues.length;

  const idsSiennes = new Set(siennes.map((p) => p.id));
  const sesTaches = taches.filter((t) => t.user_id === userId || idsSiennes.has(t.prospect_id));
  const aujourdhui = new Date().toDateString();
  const duJour = sesTaches.filter((t) => t.due_at && new Date(t.due_at).toDateString() === aujourdhui);
  const enRetard = sesTaches.filter((t) => !t.done && t.due_at && new Date(t.due_at) < new Date(new Date().setHours(0, 0, 0, 0)));

  const sesActivites = activites.filter((a) => a.user_id === userId || idsSiennes.has(a.prospect_id));
  const depuis30j = sesActivites.filter((a) => jours(a.created_at) <= 30);

  // Une affaire ouverte que plus personne ne touche est le premier signal
  // qu'un manager doit voir : elle ne se perd pas bruyamment, elle s'oublie.
  const endormies = ouvertes.filter((p) => {
    const dernier = sesActivites
      .filter((a) => a.prospect_id === p.id)
      .reduce((max, a) => (!max || a.created_at > max ? a.created_at : max), null);
    return (jours(dernier || p.created_at) ?? 0) > JOURS_SANS_CONTACT;
  });

  const jamaisContactes = ouvertes.filter((p) => p.stage === "À contacter" && (jours(p.created_at) ?? 0) > 7);

  const parEtape = {};
  for (const p of ouvertes) parEtape[p.stage] = (parEtape[p.stage] || 0) + 1;

  // Les clients suivis par cette personne, du plus fragile au plus solide.
  const clientsSuivis = siennes
    .filter((p) => p.stage === "Gagné")
    .map((p) => ({ client: p, ...santeClient(p, tickets, activites) }))
    .sort((a, b) => a.score - b.score);
  const fragiles = clientsSuivis.filter((c) => c.score < 60);

  return {
    siennes, ouvertes, gagnees, perdues, endormies, jamaisContactes, parEtape,
    clientsSuivis, fragiles,
    valeurPipeline: ouvertes.reduce((s, p) => s + Number(p.deal_value || 0), 0),
    valeurGagnee: gagnees.reduce((s, p) => s + Number(p.deal_value || 0), 0),
    tauxTransfo: closes ? Math.round((gagnees.length / closes) * 100) : null,
    tachesDuJour: duJour.length,
    tachesDuJourFaites: duJour.filter((t) => t.done).length,
    enRetard: enRetard.length,
    listeRetard: enRetard,
    activites30j: depuis30j.length,
    derniereActivite: sesActivites.reduce((max, a) => (!max || a.created_at > max ? a.created_at : max), null),
  };
}

export default function Encadrement({ session, team, onOpenProspect }) {
  const [fiches, setFiches] = useState([]);
  const [taches, setTaches] = useState([]);
  const [activites, setActivites] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [vue, setVue] = useState("equipe");

  const membres = team?.members || [];
  const perimetre = team?.role === "admin" ? "both" : team?.manages || "none";
  const suivis = useMemo(() => equipeSuivie(membres, perimetre), [membres, perimetre]);

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      const [p, t, a, k] = await Promise.all([
        supabase.from("prospects").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("tickets").select("*"),
      ]);
      if (annule) return;
      const souci = p.error || t.error || a.error || k.error;
      if (souci) setErreur(souci.message);
      else {
        setErreur(null);
        setFiches(p.data || []);
        setTaches(t.data || []);
        setActivites(a.data || []);
        setTickets(k.data || []);
      }
      setChargement(false);
    })();
    return () => { annule = true; };
  }, []);

  const bilans = useMemo(() => {
    const m = {};
    for (const p of suivis) m[p.user_id] = bilanDe(p.user_id, fiches, taches, activites, tickets);
    return m;
  }, [suivis, fiches, taches, activites, tickets]);

  if (perimetre === "none") {
    return (
      <div style={{ padding: "28px 32px 60px", maxWidth: "560px" }}>
        <PageTitle icon={UsersIcon} color="var(--blue)" style={{ marginBottom: "16px" }}>Encadrement</PageTitle>
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "14px", padding: "24px", fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6 }}>
          Cet espace est réservé aux personnes qui encadrent une équipe. Un administrateur peut vous
          confier les commerciaux, les Customer Success ou les deux depuis Paramètres → Équipe.
        </div>
      </div>
    );
  }

  if (choisi) {
    const membre = suivis.find((m) => m.user_id === choisi);
    return (
      <FichePersonne
        session={session}
        membre={membre}
        bilan={bilans[choisi]}
        onOpenProspect={onOpenProspect}
        onRetour={() => setChoisi(null)}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "1080px" }}>
      <PageTitle icon={UsersIcon} color="var(--blue)" style={{ marginBottom: "6px" }}>Encadrement</PageTitle>
      <div style={{ fontSize: "13px", color: "var(--text-faint)", marginBottom: "20px" }}>
        {perimetre === "both" ? "Commerciaux et Customer Success"
          : perimetre === "sales" ? "Vos commerciaux" : "Vos Customer Success"}
        {" · "}{suivis.length} personne{suivis.length > 1 ? "s" : ""}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
        {[{ cle: "equipe", label: "Mon équipe" }, { cle: "analyses", label: "Analyses" }].map((o) => (
          <button
            key={o.cle}
            className="focusable"
            onClick={() => setVue(o.cle)}
            style={{
              border: "0.5px solid var(--hairline)", borderRadius: "999px",
              padding: "6px 14px", fontSize: "12.5px", cursor: "pointer",
              fontWeight: vue === o.cle ? 600 : 500,
              background: vue === o.cle ? "var(--blue-dim)" : "var(--panel)",
              color: vue === o.cle ? "var(--blue)" : "var(--text-dim)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {erreur && (
        <div style={{ background: "#dc26261a", color: "#dc2626", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", marginBottom: "14px" }}>
          {erreur}
        </div>
      )}

      {chargement ? (
        <div style={{ color: "var(--text-faint)", fontSize: "13px", padding: "30px 0" }}>Chargement…</div>
      ) : vue === "analyses" ? (
        <Analyses fiches={fiches} taches={taches} activites={activites} membres={membres} onOpenProspect={onOpenProspect} />
      ) : suivis.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "14px", padding: "36px 26px", textAlign: "center", fontSize: "13px", color: "var(--text-faint)" }}>
          Personne à encadrer pour l'instant dans ce périmètre.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
          {suivis.map((m) => {
            const b = bilans[m.user_id];
            const resteAujourdhui = b.tachesDuJour - b.tachesDuJourFaites;
            return (
              <button
                key={m.user_id}
                className="focusable"
                onClick={() => setChoisi(m.user_id)}
                style={{
                  textAlign: "left", background: "var(--panel)", cursor: "pointer",
                  border: "0.5px solid var(--hairline)", borderRadius: "14px", padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "13px" }}>
                  <Avatar name={nomDe(m)} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{nomDe(m)}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      {m.role === "customer_success" ? "Customer Success" : "Commercial"}
                      {m.absent && <BadgeAbsent jusquAu={m.vacation_to} compact />}
                    </div>
                  </div>
                </div>
                <Ligne libelle="Sa journée" valeur={b.tachesDuJour === 0 ? "Rien de prévu" : `${b.tachesDuJourFaites}/${b.tachesDuJour} fait`} />
                <Ligne libelle="En retard" valeur={b.enRetard} alerte={b.enRetard > 0} />
                <Ligne libelle="Affaires endormies" valeur={b.endormies.length} alerte={b.endormies.length > 0} />
                <Ligne libelle="Pipeline" valeur={formatEuros(b.valeurPipeline)} />
                {b.clientsSuivis.length > 0 && (
                  <Ligne libelle="Clients fragiles" valeur={`${b.fragiles.length}/${b.clientsSuivis.length}`} alerte={b.fragiles.length > 0} />
                )}
                <Ligne libelle="Transformation" valeur={b.tauxTransfo === null ? "—" : `${b.tauxTransfo} %`} />
                <div style={{ marginTop: "11px", fontSize: "11.5px", color: resteAujourdhui > 0 ? "var(--blue)" : "var(--text-faint)" }}>
                  {resteAujourdhui > 0 ? `${resteAujourdhui} action${resteAujourdhui > 1 ? "s" : ""} restante${resteAujourdhui > 1 ? "s" : ""} aujourd'hui`
                    : b.derniereActivite ? `Dernière activité ${formatRelative(b.derniereActivite)?.toLowerCase()}`
                    : "Aucune activité enregistrée"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FichePersonne({ session, membre, bilan, onOpenProspect, onRetour }) {
  const [points, setPoints] = useState(null);
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [quotaEpuise, setQuotaEpuise] = useState(null);

  if (!membre || !bilan) return null;
  const b = bilan;

  // Préparer un point, ce n'est pas lire des chiffres à voix haute : c'est
  // arriver avec deux ou trois sujets précis. L'IA lit le bilan et les propose.
  async function preparerLePoint() {
    setTravail(true);
    setErreur(null);
    setQuotaEpuise(null);
    const etat = [
      `Personne encadrée : ${nomDe(membre)} (${membre.role === "customer_success" ? "Customer Success" : "Commercial"}).`,
      `Portefeuille : ${b.siennes.length} fiches, dont ${b.ouvertes.length} ouvertes pour ${Math.round(b.valeurPipeline)} € de pipeline.`,
      `Affaires gagnées : ${b.gagnees.length} pour ${Math.round(b.valeurGagnee)} €. Perdues : ${b.perdues.length}.`,
      b.tauxTransfo === null ? "Aucune affaire close, pas de taux de transformation." : `Taux de transformation : ${b.tauxTransfo} %.`,
      `Tâches en retard : ${b.enRetard}. Activités sur 30 jours : ${b.activites30j}.`,
      membre.absent
        ? `ATTENTION : cette personne est actuellement absente${membre.vacation_to ? ` jusqu'au ${membre.vacation_to}` : ""}. N'attribue pas à un manque d'implication ce qui s'explique par son absence.`
        : "",
      `Affaires sans échange depuis plus de ${JOURS_SANS_CONTACT} jours : ${b.endormies.length}` +
        (b.endormies.length ? ` (${b.endormies.slice(0, 5).map((p) => p.company).join(", ")}).` : "."),
      `Prospects jamais contactés après plus d'une semaine : ${b.jamaisContactes.length}.`,
      b.clientsSuivis.length === 0 ? "Ne suit aucun client signé."
        : `Clients suivis : ${b.clientsSuivis.length}, dont ${b.fragiles.length} fragiles`
          + (b.fragiles.length ? ` (${b.fragiles.slice(0, 4).map((c) => `${c.client.company} : ${c.raisons.join(", ")}`).join(" ; ")}).` : "."),
      `Répartition des affaires ouvertes par étape : ${Object.entries(b.parEtape).map(([e, n]) => `${e} ${n}`).join(", ") || "aucune"}.`,
    ].filter(Boolean).join("\n");

    try {
      const texte = await callAI(
        `Tu aides un manager commercial à préparer un point individuel. Voici l'état de la personne :\n\n${etat}\n\n`
        + `Propose trois sujets à aborder, pas plus. Pour chacun : une phrase qui dit le constat, une phrase qui dit quoi demander ou proposer. `
        + `Appuie-toi uniquement sur les chiffres ci-dessus, n'invente rien. Sois direct et bienveillant, jamais réprobateur. `
        + `Pas de titre, pas de formule d'introduction, une liste à trois puces.`,
        session?.access_token
      );
      setPoints(texte.trim());
    } catch (e) {
      if (e.quotaExhausted) setQuotaEpuise(e.message);
      else setErreur(e.message);
    } finally {
      setTravail(false);
    }
  }

  const resteAujourdhui = b.tachesDuJour - b.tachesDuJourFaites;

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "980px" }}>
      <button
        className="focusable"
        onClick={onRetour}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", padding: "4px 0", marginBottom: "16px" }}
      >
        <ArrowLeftIcon size={14} color="var(--text-dim)" /> Mon équipe
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "22px" }}>
        <Avatar name={nomDe(membre)} size={44} />
        <div>
          <div className="display" style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.01em" }}>{nomDe(membre)}</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>
            {membre.role === "customer_success" ? "Customer Success" : "Commercial"}
            {b.derniereActivite ? ` · dernière activité ${formatRelative(b.derniereActivite)?.toLowerCase()}` : " · aucune activité enregistrée"}
            {membre.absent && (
              <> · <BadgeAbsent jusquAu={membre.vacation_to} /></>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", marginBottom: "16px" }}>
        <Bloc titre="SA JOURNÉE">
          {b.tachesDuJour === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--text-faint)" }}>Rien de prévu aujourd'hui.</div>
          ) : (
            <Ligne libelle="Actions du jour" valeur={`${b.tachesDuJourFaites}/${b.tachesDuJour}`} />
          )}
          <Ligne libelle="Restant à faire" valeur={resteAujourdhui} alerte={resteAujourdhui > 2} />
          <Ligne libelle="En retard" valeur={b.enRetard} alerte={b.enRetard > 0} />
        </Bloc>

        <Bloc titre="CE QUI FONCTIONNE" ton="bien">
          <Ligne libelle="Affaires gagnées" valeur={b.gagnees.length} />
          <Ligne libelle="Chiffre signé" valeur={formatEuros(b.valeurGagnee)} />
          <Ligne libelle="Transformation" valeur={b.tauxTransfo === null ? "—" : `${b.tauxTransfo} %`} />
          <Ligne libelle="Activités sur 30 jours" valeur={b.activites30j} />
        </Bloc>

        <Bloc titre="CE QUI COINCE" ton="alerte">
          <Ligne libelle={`Sans échange depuis ${JOURS_SANS_CONTACT} j`} valeur={b.endormies.length} alerte={b.endormies.length > 0} />
          <Ligne libelle="Jamais contactés" valeur={b.jamaisContactes.length} alerte={b.jamaisContactes.length > 0} />
          <Ligne libelle="Relances en retard" valeur={b.enRetard} alerte={b.enRetard > 0} />
          <Ligne libelle="Affaires perdues" valeur={b.perdues.length} />
        </Bloc>
      </div>

      {b.endormies.length > 0 && (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "15px 17px", marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-dim)", marginBottom: "10px" }}>
            AFFAIRES QUI S'ENDORMENT
          </div>
          {b.endormies.slice(0, 6).map((p) => (
            <button
              key={p.id}
              className="focusable"
              onClick={() => onOpenProspect?.(p.id)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", background: "none", border: "none", borderTop: "0.5px solid var(--hairline)", padding: "9px 0", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "13px", fontWeight: 600 }}>{p.company}</span>
                <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-faint)" }}>
                  {p.stage} · {p.name}
                </span>
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {formatEuros(p.deal_value)}
              </span>
            </button>
          ))}
        </div>
      )}

      {b.fragiles.length > 0 && (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "15px 17px", marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-dim)", marginBottom: "4px" }}>
            CLIENTS À SURVEILLER
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginBottom: "8px" }}>
            Santé calculée à l'instant à partir des tickets et de la date du dernier échange.
          </div>
          {b.fragiles.slice(0, 6).map(({ client, score, raisons }) => (
            <button
              key={client.id}
              className="focusable"
              onClick={() => onOpenProspect?.(client.id)}
              style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", width: "100%", background: "none", border: "none", borderTop: "0.5px solid var(--hairline)", padding: "9px 0", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "13px", fontWeight: 600 }}>{client.company}</span>
                <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-faint)", lineHeight: 1.45 }}>
                  {raisons.join(" · ")}
                </span>
              </span>
              <span style={{
                fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                color: score < 40 ? "#dc2626" : "#b45309",
              }}>
                {score}/100
              </span>
            </button>
          ))}
        </div>
      )}

      {b.listeRetard.length > 0 && (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "15px 17px", marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-dim)", marginBottom: "10px" }}>
            RELANCES EN RETARD
          </div>
          {b.listeRetard.slice(0, 6).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "0.5px solid var(--hairline)", padding: "9px 0" }}>
              <span style={{ fontSize: "12.5px", color: "var(--text-dim)", minWidth: 0 }}>{t.note || "Action à mener"}</span>
              <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600, whiteSpace: "nowrap" }}>
                {formatDate(t.due_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "15px 17px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: points || erreur || quotaEpuise ? "12px" : 0 }}>
          <button
            className="focusable"
            onClick={preparerLePoint}
            disabled={travail}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              border: "0.5px solid var(--hairline)", borderRadius: "8px",
              padding: "7px 13px", fontSize: "12.5px", fontWeight: 600,
              background: "var(--panel2)", color: "var(--blue)", cursor: travail ? "default" : "pointer",
              opacity: travail ? 0.6 : 1,
            }}
          >
            <SparklesIcon size={12} color="var(--blue)" />
            {travail ? "Préparation…" : "Préparer le point avec " + (membre.first_name || nomDe(membre))}
          </button>
          <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>Décompté de votre quota IA</span>
        </div>

        {quotaEpuise && <div style={{ fontSize: "12.5px", color: "#b45309", lineHeight: 1.5 }}>{quotaEpuise}</div>}
        {erreur && <div style={{ fontSize: "12.5px", color: "#dc2626" }}>{erreur}</div>}
        {points && <div style={{ fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{points}</div>}
      </div>
    </div>
  );
}

// ANALYSES
//
// Chaque manager suit ses propres indicateurs. Plutôt que de figer six
// tableaux qui ne conviendront à personne, on laisse choisir la ligne, la
// mesure et la période.
const LIGNES = {
  personne: "Par personne",
  etape: "Par étape",
  mois: "Par mois",
  secteur: "Par secteur",
  source: "Par origine",
};

const MESURES = {
  nombre: "Nombre d'affaires",
  pipeline: "Valeur du pipeline",
  gagne: "Chiffre signé",
  transformation: "Taux de transformation",
  activites: "Activités",
  retard: "Relances en retard",
};

const PERIODES = { j30: "30 jours", j90: "90 jours", m12: "12 mois", tout: "Depuis le début" };
const JOURS_PERIODE = { j30: 30, j90: 90, m12: 365, tout: null };

function Analyses({ fiches, taches, activites, membres, onOpenProspect }) {
  const [ligne, setLigne] = useState("personne");
  const [mesures, setMesures] = useState(["nombre", "pipeline", "gagne", "transformation"]);
  const [periode, setPeriode] = useState("j90");
  const [detail, setDetail] = useState(null);

  const bascule = (m) =>
    setMesures((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const lignes = useMemo(() => {
    const limite = JOURS_PERIODE[periode];
    const dansPeriode = (d) => limite === null || (jours(d) ?? 0) <= limite;
    const retenues = fiches.filter((p) => dansPeriode(p.created_at) || (p.closed_at && dansPeriode(p.closed_at)));

    const cle = (p) => {
      if (ligne === "personne") {
        const m = membres.find((x) => x.user_id === (p.sales_owner_id || p.csm_owner_id));
        return m ? nomDe(m) : "Non attribué";
      }
      if (ligne === "etape") return p.stage;
      if (ligne === "mois") {
        const d = p.closed_at || p.created_at;
        return d ? new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "—";
      }
      if (ligne === "secteur") return p.industry || "Non renseigné";
      return p.source || "Non renseignée";
    };

    const groupes = {};
    for (const p of retenues) {
      const k = cle(p);
      (groupes[k] = groupes[k] || []).push(p);
    }

    return Object.entries(groupes).map(([nom, lot]) => {
      const ids = new Set(lot.map((p) => p.id));
      const ouvertes = lot.filter((p) => OPEN_STAGES.includes(p.stage));
      const gagnees = lot.filter((p) => p.stage === "Gagné");
      const closes = gagnees.length + lot.filter((p) => p.stage === "Perdu").length;
      const sesActivites = activites.filter((a) => ids.has(a.prospect_id) && dansPeriode(a.created_at));
      const sesRetards = taches.filter((t) => ids.has(t.prospect_id) && !t.done && t.due_at && new Date(t.due_at) < new Date());
      return {
        nom,
        nombre: lot.length,
        pipeline: ouvertes.reduce((s, p) => s + Number(p.deal_value || 0), 0),
        gagne: gagnees.reduce((s, p) => s + Number(p.deal_value || 0), 0),
        transformation: closes ? Math.round((gagnees.length / closes) * 100) : null,
        activites: sesActivites.length,
        retard: sesRetards.length,
        // Ce qui est compté, gardé tel quel : ouvrir une cellule doit montrer
        // exactement les lignes derrière le chiffre, pas une approximation.
        detail: {
          nombre: lot,
          pipeline: ouvertes,
          gagne: gagnees,
          transformation: lot.filter((p) => CLOSED_STAGES.includes(p.stage)),
          activites: sesActivites,
          retard: sesRetards,
        },
      };
    }).sort((a, b) => b.nombre - a.nombre);
  }, [fiches, taches, activites, membres, ligne, periode]);

  const affiche = (l, m) => {
    if (m === "pipeline" || m === "gagne") return formatEuros(l[m]);
    if (m === "transformation") return l[m] === null ? "—" : `${l[m]} %`;
    return l[m];
  };

  const totaux = {
    nombre: lignes.reduce((s, l) => s + l.nombre, 0),
    pipeline: lignes.reduce((s, l) => s + l.pipeline, 0),
    gagne: lignes.reduce((s, l) => s + l.gagne, 0),
    activites: lignes.reduce((s, l) => s + l.activites, 0),
    retard: lignes.reduce((s, l) => s + l.retard, 0),
    transformation: null,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "14px" }}>
        <label style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
          Lignes
          <select value={ligne} onChange={(e) => setLigne(e.target.value)} style={{ ...selectStyle, width: "auto", marginTop: "4px", display: "block" }}>
            {Object.entries(LIGNES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
          Période
          <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ ...selectStyle, width: "auto", marginTop: "4px", display: "block" }}>
            {Object.entries(PERIODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
        {Object.entries(MESURES).map(([k, v]) => {
          const actif = mesures.includes(k);
          return (
            <button
              key={k}
              className="focusable"
              onClick={() => bascule(k)}
              style={{
                border: "0.5px solid var(--hairline)", borderRadius: "999px",
                padding: "5px 12px", fontSize: "12px", cursor: "pointer",
                fontWeight: actif ? 600 : 500,
                background: actif ? "var(--blue-dim)" : "var(--panel)",
                color: actif ? "var(--blue)" : "var(--text-faint)",
              }}
            >
              {v}
            </button>
          );
        })}
      </div>

      {mesures.length === 0 ? (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "14px", padding: "30px", textAlign: "center", fontSize: "13px", color: "var(--text-faint)" }}>
          Choisissez au moins une mesure.
        </div>
      ) : (
        <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "14px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "11.5px", fontWeight: 700, color: "var(--text-faint)", borderBottom: "0.5px solid var(--hairline)" }}>
                  {LIGNES[ligne]}
                </th>
                {mesures.map((m) => (
                  <th key={m} style={{ textAlign: "right", padding: "12px 16px", fontSize: "11.5px", fontWeight: 700, color: "var(--text-faint)", borderBottom: "0.5px solid var(--hairline)", whiteSpace: "nowrap" }}>
                    {MESURES[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.nom}>
                  <td style={{ padding: "10px 16px", borderTop: "0.5px solid var(--hairline)", fontWeight: 600 }}>{l.nom}</td>
                  {mesures.map((m) => {
                    const lignesDerriere = l.detail[m] || [];
                    return (
                      <td key={m} style={{ padding: "0", borderTop: "0.5px solid var(--hairline)", textAlign: "right" }}>
                        <button
                          className="focusable"
                          onClick={() => lignesDerriere.length > 0 && setDetail({ ligne: l, mesure: m })}
                          disabled={lignesDerriere.length === 0}
                          title={lignesDerriere.length > 0 ? "Voir le détail" : "Rien à détailler"}
                          style={{
                            width: "100%", padding: "10px 16px", textAlign: "right", background: "none",
                            border: "none", fontSize: "13px", fontVariantNumeric: "tabular-nums",
                            fontFamily: "inherit",
                            cursor: lignesDerriere.length > 0 ? "pointer" : "default",
                            color: m === "retard" && l[m] > 0 ? "#dc2626" : "var(--text)",
                            textDecoration: lignesDerriere.length > 0 ? "underline" : "none",
                            textDecorationColor: "var(--hairline)",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          {affiche(l, m)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {lignes.length > 1 && (
                <tr>
                  <td style={{ padding: "11px 16px", borderTop: "0.5px solid var(--hairline-strong, var(--hairline))", fontWeight: 700 }}>Total</td>
                  {mesures.map((m) => (
                    <td key={m} style={{ padding: "11px 16px", borderTop: "0.5px solid var(--hairline-strong, var(--hairline))", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {totaux[m] === null ? "—" : affiche(totaux, m)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <DetailMesure
          ligne={detail.ligne}
          mesure={detail.mesure}
          libelleLigne={LIGNES[ligne]}
          onOpenProspect={onOpenProspect}
          onFermer={() => setDetail(null)}
        />
      )}

      {lignes.length === 0 && (
        <div style={{ fontSize: "12.5px", color: "var(--text-faint)", marginTop: "12px" }}>
          Aucune donnée sur cette période.
        </div>
      )}
    </div>
  );
}

// Ce qu'il y a derrière un chiffre. Un tableau qu'on ne peut pas ouvrir oblige
// à faire confiance au calcul ; celui-ci montre ses lignes.
function DetailMesure({ ligne, mesure, libelleLigne, onOpenProspect, onFermer }) {
  const items = ligne.detail[mesure] || [];
  const estFiche = ["nombre", "pipeline", "gagne", "transformation"].includes(mesure);

  return (
    <div
      onClick={onFermer}
      style={{ position: "fixed", inset: 0, background: "rgba(10,17,40,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{ background: "var(--panel)", border: "1px solid var(--hairline-strong, var(--hairline))", borderRadius: "14px", padding: "20px 22px", maxWidth: "560px", width: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "var(--shadow-md)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "4px" }}>
          <div className="display" style={{ fontSize: "16px", fontWeight: 700 }}>
            {MESURES[mesure]} — {ligne.nom}
          </div>
          <button
            className="focusable"
            onClick={onFermer}
            style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "13px", cursor: "pointer" }}
          >
            Fermer
          </button>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-faint)", marginBottom: "14px" }}>
          {libelleLigne} · {items.length} ligne{items.length > 1 ? "s" : ""} comptée{items.length > 1 ? "s" : ""}
          {mesure === "transformation" && " (les affaires closes, gagnées et perdues)"}
        </div>

        {items.map((it) => (
          estFiche ? (
            <button
              key={it.id}
              className="focusable"
              onClick={() => { onFermer(); onOpenProspect?.(it.id); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", background: "none", border: "none", borderTop: "0.5px solid var(--hairline)", padding: "10px 0", cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "13px", fontWeight: 600 }}>{it.company}</span>
                <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-faint)" }}>{it.stage} · {it.name}</span>
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {formatEuros(it.deal_value)}
              </span>
            </button>
          ) : (
            <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "0.5px solid var(--hairline)", padding: "10px 0" }}>
              <span style={{ fontSize: "12.5px", color: "var(--text-dim)", minWidth: 0 }}>
                {it.note || (mesure === "activites" ? "Activité enregistrée" : "Action à mener")}
              </span>
              <span style={{ fontSize: "11.5px", color: mesure === "retard" ? "#dc2626" : "var(--text-faint)", whiteSpace: "nowrap" }}>
                {formatDate(it.due_at || it.created_at)}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
