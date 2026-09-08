import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PageTitle, InboxIcon, SparklesIcon, CheckIcon, XIcon, MailIcon, formatRelative, inputStyle } from "../lib/ui.jsx";

// BOÎTE DE RÉCEPTION
//
// Le problème qu'elle traite : des demandes qui arrivent par email, au milieu
// des newsletters et du démarchage, et qu'on suit de mémoire faute de savoir
// quoi noter. L'écran répond aux deux moitiés du problème :
//
//   1. il sépare ce qui est une demande de ce qui n'en est pas une ;
//   2. il propose les colonnes du tableau à partir des emails eux-mêmes,
//      plutôt que de demander à l'utilisateur d'inventer un schéma avant
//      d'avoir vu ses données.
//
// L'IA ne part jamais seule : relever la boîte ne coûte rien, trier et
// proposer des colonnes sont deux boutons, décomptés du quota de la personne
// qui appuie.

const VUES = [
  { cle: "demande", label: "Demandes" },
  { cle: "a_trier", label: "À trier" },
  { cle: "pas_client", label: "Pas un client" },
];

const carte = {
  background: "var(--panel)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "var(--radius-lg, 14px)",
  padding: "18px 20px",
};

function Bouton({ children, onClick, disabled, variante = "neutre", style }) {
  const fonds = {
    principal: { background: "var(--blue)", color: "#fff", border: "none" },
    neutre: { background: "var(--panel2)", color: "var(--text)", border: "0.5px solid var(--hairline)" },
    discret: { background: "transparent", color: "var(--text-dim)", border: "0.5px solid var(--hairline)" },
  };
  return (
    <button
      className="focusable"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...fonds[variante],
        borderRadius: "8px",
        padding: "7px 13px",
        fontSize: "12.5px",
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function nomDepuisEmail(ligne) {
  if (ligne.sender_name) return ligne.sender_name;
  const local = (ligne.sender_email || "").split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(" ") || ligne.sender_email;
}

function domaineDe(email) {
  const at = (email || "").lastIndexOf("@");
  return at === -1 ? "" : email.slice(at).toLowerCase();
}

export default function BoiteReception({ session, team, settings, reloadSettings, reload, onOpenProspect, setActiveTab }) {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [nonConnecte, setNonConnecte] = useState(false);
  const [vue, setVue] = useState("demande");

  const [triEnCours, setTriEnCours] = useState(false);
  const [messageTri, setMessageTri] = useState("");

  const [propositions, setPropositions] = useState(null);
  const [retenues, setRetenues] = useState({});
  const [colonnesEnCours, setColonnesEnCours] = useState(false);
  const [reglageOuvert, setReglageOuvert] = useState(false);

  const colonnes = useMemo(() => {
    const brut = settings?.inbox_columns;
    if (!Array.isArray(brut)) return [];
    return brut.map((c) => (typeof c === "string" ? { nom: c } : c)).filter((c) => c?.nom);
  }, [settings]);

  async function relever() {
    setChargement(true);
    setErreur("");
    try {
      const res = await fetch("/api/calendar/status?action=inbox", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.notConnected) {
        setNonConnecte(true);
        setLignes([]);
      } else {
        setNonConnecte(false);
        setLignes(data.messages || []);
        if (data.erreur) setErreur(data.erreur);
        if (data.error) setErreur(data.error);
      }
    } catch (e) {
      setErreur("La relève de la boîte a échoué. Réessayez.");
    }
    setChargement(false);
  }

  useEffect(() => {
    relever();
  }, [session.access_token]);

  async function appelIA(action) {
    const res = await fetch("/api/calendar/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "L'appel a échoué.");
    if (data.erreur) throw new Error(data.erreur);
    return data;
  }

  const nonTries = lignes.filter((l) => l.verdict === "a_trier");

  async function trier() {
    setTriEnCours(true);
    setMessageTri("");
    setErreur("");
    try {
      const data = await appelIA("inbox_trier");
      await relever();
      setMessageTri(
        data.tries === 0
          ? "Rien de nouveau à trier."
          : `${data.tries} message${data.tries > 1 ? "s" : ""} trié${data.tries > 1 ? "s" : ""}${data.restants ? ` — ${data.restants} en attente, relancez le tri.` : "."}`
      );
    } catch (e) {
      setErreur(e.message);
    }
    setTriEnCours(false);
  }

  async function demanderColonnes() {
    setColonnesEnCours(true);
    setErreur("");
    try {
      const data = await appelIA("inbox_colonnes");
      setPropositions(data.colonnes || []);
      // Tout est retenu par défaut : l'utilisateur retire ce qui ne lui parle
      // pas, il n'a pas à tout cocher pour obtenir un tableau.
      setRetenues(Object.fromEntries((data.colonnes || []).map((c) => [c.nom, true])));
      setReglageOuvert(true);
    } catch (e) {
      setErreur(e.message);
    }
    setColonnesEnCours(false);
  }

  async function enregistrerColonnes() {
    const choisies = (propositions || []).filter((c) => retenues[c.nom]);
    await supabase.from("user_settings").update({ inbox_columns: choisies }).eq("user_id", session.user.id);
    setPropositions(null);
    setReglageOuvert(false);
    await reloadSettings?.();
  }

  async function changerVerdict(ligne, verdict) {
    // Une correction à la main l'emporte sur le tri automatique, et le dit :
    // sans cette trace, on ne saurait plus ce que l'IA a décidé seule.
    await supabase
      .from("inbox_messages")
      .update({ verdict, verdict_source: "utilisateur", raison: null })
      .eq("id", ligne.id);
    setLignes((prev) => prev.map((l) => (l.id === ligne.id ? { ...l, verdict, verdict_source: "utilisateur", raison: null } : l)));
  }

  async function archiver(ligne) {
    await supabase.from("inbox_messages").update({ archived_at: new Date().toISOString() }).eq("id", ligne.id);
    setLignes((prev) => prev.filter((l) => l.id !== ligne.id));
  }

  // Mettre de côté un expéditeur, ou tout son domaine. Le domaine règle le cas
  // des newsletters qui changent d'adresse d'envoi à chaque numéro.
  async function ignorer(ligne, portee) {
    const motif = portee === "domaine" ? domaineDe(ligne.sender_email) : ligne.sender_email;
    if (!motif) return;
    await supabase.from("inbox_senders_ignores").insert({ user_id: session.user.id, pattern: motif });

    const concernes = lignes.filter((l) =>
      motif.startsWith("@") ? (l.sender_email || "").endsWith(motif) : l.sender_email === motif
    );
    for (const l of concernes) {
      await supabase
        .from("inbox_messages")
        .update({ verdict: "pas_client", verdict_source: "expediteur_ignore", raison: "Expéditeur mis de côté." })
        .eq("id", l.id);
    }
    setLignes((prev) =>
      prev.map((l) =>
        concernes.some((c) => c.id === l.id)
          ? { ...l, verdict: "pas_client", verdict_source: "expediteur_ignore", raison: "Expéditeur mis de côté." }
          : l
      )
    );
  }

  async function enregistrerChamp(ligne, colonne, valeur) {
    const champs = { ...(ligne.champs || {}) };
    if (valeur) champs[colonne] = valeur;
    else delete champs[colonne];
    await supabase.from("inbox_messages").update({ champs }).eq("id", ligne.id);
    setLignes((prev) => prev.map((l) => (l.id === ligne.id ? { ...l, champs } : l)));
  }

  async function creerOpportunite(ligne) {
    // Ce que l'IA a extrait part dans les notes de la fiche : la ligne de la
    // boîte finira par sortir de la fenêtre de quatorze jours, la fiche reste.
    const extraits = Object.entries(ligne.champs || {}).filter(([, v]) => v);
    const notes = [
      `Demande reçue par email le ${new Date(ligne.received_at).toLocaleDateString("fr-FR")} — « ${ligne.subject || "sans objet"} »`,
      ...extraits.map(([k, v]) => `${k} : ${v}`),
    ].join("\n");

    const { data, error } = await supabase
      .from("prospects")
      .insert({
        user_id: session.user.id,
        team_id: team?.team?.id || null,
        created_via: "email",
        name: nomDepuisEmail(ligne),
        email: ligne.sender_email,
        company: "",
        stage: "À contacter",
        status: "attente",
        priority: 50,
        deal_value: 0,
        notes,
      })
      .select()
      .single();

    if (error) {
      setErreur("La création de l'opportunité a échoué.");
      return;
    }
    await supabase.from("inbox_messages").update({ prospect_id: data.id }).eq("id", ligne.id);
    setLignes((prev) => prev.map((l) => (l.id === ligne.id ? { ...l, prospect_id: data.id } : l)));
    reload?.();
  }

  const parVue = {
    demande: lignes.filter((l) => l.verdict === "demande"),
    a_trier: nonTries,
    pas_client: lignes.filter((l) => l.verdict === "pas_client"),
  };

  if (nonConnecte) {
    return (
      <div style={{ padding: "28px 32px 60px", maxWidth: "560px" }}>
        <PageTitle icon={InboxIcon} color="var(--blue)" style={{ marginBottom: "16px" }}>Boîte de réception</PageTitle>
        <div style={carte}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Aucune boîte reliée</div>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 16px" }}>
            Reliez Gmail ou Outlook et Clos-ia vous montrera vos demandes d'un côté, le reste de l'autre.
            Rien n'est envoyé depuis cet écran, et le contenu de vos messages n'est jamais recopié dans Clos-ia.
          </p>
          <Bouton variante="principal" onClick={() => setActiveTab("integrations")}>Relier ma boîte</Bouton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "1080px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", marginBottom: "18px" }}>
        <PageTitle icon={InboxIcon} color="var(--blue)">Boîte de réception</PageTitle>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Bouton onClick={relever} disabled={chargement}>{chargement ? "Relève…" : "Relever la boîte"}</Bouton>
          <Bouton variante="principal" onClick={trier} disabled={triEnCours || nonTries.length === 0}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <SparklesIcon size={13} color="#fff" />
              {triEnCours ? "Tri en cours…" : `Trier avec l'IA${nonTries.length ? ` (${nonTries.length})` : ""}`}
            </span>
          </Bouton>
        </div>
      </div>

      <p style={{ fontSize: "12.5px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 18px", maxWidth: "660px" }}>
        Les quatorze derniers jours de votre boîte. Ce qui vient d'un contact déjà suivi est reconnu sans IA ;
        le reste attend que vous lanciez le tri. Seuls l'expéditeur, l'objet et la date sont conservés ici —
        le texte des messages est relu chez votre fournisseur puis oublié.
      </p>

      {erreur && (
        <div style={{ ...carte, borderColor: "var(--red)", color: "var(--red)", fontSize: "12.5px", padding: "12px 16px", marginBottom: "14px" }}>
          {erreur}
        </div>
      )}
      {messageTri && (
        <div style={{ ...carte, fontSize: "12.5px", color: "var(--text-dim)", padding: "12px 16px", marginBottom: "14px" }}>
          {messageTri}
        </div>
      )}

      <ReglageColonnes
        colonnes={colonnes}
        propositions={propositions}
        retenues={retenues}
        setRetenues={setRetenues}
        ouvert={reglageOuvert}
        setOuvert={setReglageOuvert}
        enCours={colonnesEnCours}
        onDemander={demanderColonnes}
        onEnregistrer={enregistrerColonnes}
        onAnnuler={() => { setPropositions(null); setReglageOuvert(false); }}
      />

      <div style={{ display: "flex", gap: "4px", margin: "20px 0 14px", borderBottom: "0.5px solid var(--hairline)" }}>
        {VUES.map((v) => {
          const actif = vue === v.cle;
          return (
            <button
              key={v.cle}
              className="focusable"
              onClick={() => setVue(v.cle)}
              style={{
                background: "none",
                border: "none",
                borderBottom: `2px solid ${actif ? "var(--blue)" : "transparent"}`,
                color: actif ? "var(--blue)" : "var(--text-dim)",
                fontSize: "13px",
                fontWeight: actif ? 700 : 500,
                padding: "8px 12px",
                cursor: "pointer",
                marginBottom: "-0.5px",
              }}
            >
              {v.label} {parVue[v.cle].length > 0 && <span className="mono" style={{ fontSize: "11px" }}>({parVue[v.cle].length})</span>}
            </button>
          );
        })}
      </div>

      {chargement && lignes.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--text-dim)", padding: "24px 0" }}>Relève de la boîte…</div>
      ) : parVue[vue].length === 0 ? (
        <Vide vue={vue} aTrier={nonTries.length} />
      ) : vue === "demande" ? (
        <TableauDemandes
          lignes={parVue.demande}
          colonnes={colonnes}
          onCreer={creerOpportunite}
          onOuvrir={onOpenProspect}
          onPasClient={(l) => changerVerdict(l, "pas_client")}
          onArchiver={archiver}
          onChamp={enregistrerChamp}
        />
      ) : vue === "a_trier" ? (
        <ListeATrier lignes={parVue.a_trier} onVerdict={changerVerdict} />
      ) : (
        <ListePasClient lignes={parVue.pas_client} onVerdict={changerVerdict} onIgnorer={ignorer} />
      )}
    </div>
  );
}

// --- Colonnes ---------------------------------------------------------------
//
// « Je ne sais pas quoi mettre dans le tableau » n'est pas un manque d'outil,
// c'est un manque de réponse. On la cherche dans les emails plutôt que de
// livrer un schéma générique auquel il faudrait se plier.

function ReglageColonnes({ colonnes, propositions, retenues, setRetenues, ouvert, setOuvert, enCours, onDemander, onEnregistrer, onAnnuler }) {
  if (propositions) {
    const nbRetenues = propositions.filter((c) => retenues[c.nom]).length;
    return (
      <div style={{ ...carte, borderColor: "var(--blue)" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700, marginBottom: "4px" }}>Colonnes proposées</div>
        <p style={{ fontSize: "12.5px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 14px" }}>
          Déduites de vos derniers messages, pas d'un modèle tout fait. Retirez celles qui ne vous servent pas —
          une colonne vide neuf fois sur dix est une colonne à ne pas tenir.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {propositions.map((c) => (
            <label key={c.nom} style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!retenues[c.nom]}
                onChange={(e) => setRetenues((prev) => ({ ...prev, [c.nom]: e.target.checked }))}
                style={{ marginTop: "3px" }}
              />
              <span>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>{c.nom}</span>
                {c.pourquoi && <span style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.5 }}>{c.pourquoi}</span>}
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Bouton variante="principal" onClick={onEnregistrer} disabled={nbRetenues === 0}>
            Tenir ces {nbRetenues} colonne{nbRetenues > 1 ? "s" : ""}
          </Bouton>
          <Bouton variante="discret" onClick={onAnnuler}>Annuler</Bouton>
        </div>
      </div>
    );
  }

  if (colonnes.length === 0) {
    return (
      <div style={{ ...carte, borderColor: "var(--blue)" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700, marginBottom: "4px" }}>Votre tableau n'a pas encore de colonnes</div>
        <p style={{ fontSize: "12.5px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 14px", maxWidth: "620px" }}>
          Plutôt que de vous demander de les inventer, Clos-ia peut les lire dans vos derniers emails :
          ce que vos clients écrivent vraiment dit mieux que n'importe quel modèle ce qu'il y a à suivre.
        </p>
        <Bouton variante="principal" onClick={onDemander} disabled={enCours}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <SparklesIcon size={13} color="#fff" />
            {enCours ? "Lecture des messages…" : "Proposer mes colonnes"}
          </span>
        </Bouton>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "12.5px", color: "var(--text-dim)" }}>
      <span>Colonnes suivies :</span>
      {colonnes.map((c) => (
        <span
          key={c.nom}
          title={c.pourquoi || ""}
          style={{ background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "999px", padding: "2px 10px", fontSize: "11.5px", fontWeight: 600, color: "var(--text)" }}
        >
          {c.nom}
        </span>
      ))}
      <button
        className="focusable"
        onClick={onDemander}
        disabled={enCours}
        style={{ background: "none", border: "none", color: "var(--blue)", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}
      >
        {enCours ? "Lecture…" : "Les revoir"}
      </button>
    </div>
  );
}

// --- Les trois listes -------------------------------------------------------

function Expediteur({ ligne }) {
  return (
    <span>
      <span style={{ fontWeight: 600, color: "var(--text)" }}>{nomDepuisEmail(ligne)}</span>
      <span style={{ display: "block", fontSize: "11px", color: "var(--text-faint)" }}>{ligne.sender_email}</span>
    </span>
  );
}

function Raison({ ligne }) {
  if (!ligne.raison) return null;
  return (
    <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-faint)", lineHeight: 1.5, marginTop: "3px" }}>
      {ligne.verdict_source === "ia" ? "IA : " : ""}{ligne.raison}
    </span>
  );
}

// Une cellule se corrige sur place. L'IA ne remplit pas tout — et un message
// trié à la main n'a aucune valeur extraite : sans saisie directe, le tableau
// serait à prendre ou à laisser, ce qui est le meilleur moyen de le laisser.
function Cellule({ ligne, colonne, onEnregistrer }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState("");
  const actuelle = ligne.champs?.[colonne] || "";

  async function valider() {
    setEdition(false);
    const propre = valeur.trim();
    if (propre === actuelle) return;
    await onEnregistrer(ligne, colonne, propre);
  }

  if (edition) {
    return (
      <input
        autoFocus
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
          if (e.key === "Escape") setEdition(false);
        }}
        style={{ ...inputStyle, width: "100%", minWidth: "110px", padding: "5px 7px", fontSize: "12.5px" }}
      />
    );
  }

  return (
    <button
      className="focusable"
      title="Cliquer pour modifier"
      onClick={() => { setValeur(actuelle); setEdition(true); }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        textAlign: "left",
        cursor: "text",
        fontSize: "12.5px",
        color: actuelle ? "var(--text)" : "var(--text-faint)",
        fontFamily: "inherit",
      }}
    >
      {actuelle || "—"}
    </button>
  );
}

function TableauDemandes({ lignes, colonnes, onCreer, onOuvrir, onPasClient, onArchiver, onChamp }) {
  const th = { textAlign: "left", padding: "7px 10px", fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" };
  const td = { padding: "11px 10px", fontSize: "12.5px", color: "var(--text)", verticalAlign: "top" };

  return (
    <div style={{ ...carte, padding: "6px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "0.5px solid var(--hairline)" }}>
            <th style={th}>Reçu</th>
            <th style={th}>Expéditeur</th>
            <th style={th}>Objet</th>
            {colonnes.map((c) => <th key={c.nom} style={th}>{c.nom}</th>)}
            <th style={{ ...th, textAlign: "right" }}>Suite</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} style={{ borderBottom: "0.5px solid var(--hairline)" }}>
              <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-dim)" }}>{formatRelative(l.received_at)}</td>
              <td style={td}><Expediteur ligne={l} /></td>
              <td style={{ ...td, minWidth: "180px" }}>
                {l.subject || <span style={{ color: "var(--text-faint)" }}>(sans objet)</span>}
                <Raison ligne={l} />
              </td>
              {colonnes.map((c) => (
                <td key={c.nom} style={td}>
                  <Cellule ligne={l} colonne={c.nom} onEnregistrer={onChamp} />
                </td>
              ))}
              <td style={{ ...td, textAlign: "right" }}>
                <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {l.prospect_id ? (
                    <Bouton variante="discret" onClick={() => onOuvrir?.(l.prospect_id, "email")}>Voir la fiche</Bouton>
                  ) : (
                    <Bouton variante="principal" onClick={() => onCreer(l)}>Créer l'opportunité</Bouton>
                  )}
                  <Bouton variante="discret" onClick={() => onArchiver(l)}>Traité</Bouton>
                  <Bouton variante="discret" onClick={() => onPasClient(l)}>Pas un client</Bouton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListeATrier({ lignes, onVerdict }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {lignes.map((l) => (
        <div key={l.id} style={{ ...carte, display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <MailIcon size={15} color="var(--text-faint)" style={{ marginTop: "3px" }} />
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
              <Expediteur ligne={l} />
              <span style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{formatRelative(l.received_at)}</span>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "6px" }}>{l.subject || "(sans objet)"}</div>
            {l.extrait && (
              <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.55, marginTop: "4px" }}>{l.extrait}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Bouton variante="principal" onClick={() => onVerdict(l, "demande")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><CheckIcon size={12} color="#fff" />C'est une demande</span>
            </Bouton>
            <Bouton variante="discret" onClick={() => onVerdict(l, "pas_client")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><XIcon size={12} />Pas un client</span>
            </Bouton>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListePasClient({ lignes, onVerdict, onIgnorer }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {lignes.map((l) => (
        <div
          key={l.id}
          style={{ ...carte, padding: "11px 16px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <div style={{ fontSize: "12.5px" }}>
              <span style={{ fontWeight: 600 }}>{nomDepuisEmail(l)}</span>
              <span style={{ color: "var(--text-faint)" }}> — {l.subject || "(sans objet)"}</span>
            </div>
            <Raison ligne={l} />
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Bouton variante="discret" onClick={() => onVerdict(l, "demande")}>C'est une demande</Bouton>
            {l.verdict_source !== "expediteur_ignore" && (
              <>
                <Bouton variante="discret" onClick={() => onIgnorer(l, "adresse")}>Ne plus afficher</Bouton>
                <Bouton variante="discret" onClick={() => onIgnorer(l, "domaine")} style={{ color: "var(--text-faint)" }}>
                  ni tout {domaineDe(l.sender_email)}
                </Bouton>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Vide({ vue, aTrier }) {
  const textes = {
    demande: aTrier > 0
      ? `Aucune demande identifiée pour l'instant — ${aTrier} message${aTrier > 1 ? "s" : ""} attend${aTrier > 1 ? "ent" : ""} le tri.`
      : "Aucune demande dans les quatorze derniers jours.",
    a_trier: "Tout est trié.",
    pas_client: "Rien n'a été écarté pour l'instant.",
  };
  return <div style={{ fontSize: "13px", color: "var(--text-dim)", padding: "22px 0" }}>{textes[vue]}</div>;
}
