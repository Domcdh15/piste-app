import { Component } from "react";

// Un écran qui tombe ne doit pas emporter l'application.
//
// Sans cette frontière, une seule erreur — un composant non défini, une donnée
// inattendue — vide la page entière : ni message, ni navigation, ni moyen de
// repartir. C'est ce qui s'est produit deux fois sur le pipeline, et le plus
// coûteux n'était pas le bug mais l'écran blanc : il ne dit pas quoi faire, et
// recharger ne servait à rien puisque la vue fautive était mémorisée.
//
// Posée autour de chaque page, elle isole la panne : la barre de navigation
// survit, les autres écrans restent accessibles, et l'utilisateur a deux
// issues plutôt qu'une impasse.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // La console reste la seule trace : écrire en base demanderait un point
    // d'entrée serveur, et le plafond Vercel est à 10 fonctions sur 12.
    console.error(`[Clos-ia] ${this.props.page || "écran"} en échec`, erreur, infos?.componentStack);
  }

  // Le choix de vue du pipeline est mémorisé dans le navigateur : quand c'est
  // lui qui déclenche la panne, recharger la reproduit à l'identique. Le seul
  // moyen d'en sortir était d'ouvrir la console — on ne demande pas ça à un
  // utilisateur.
  reinitialiser = () => {
    try {
      for (const cle of Object.keys(localStorage)) {
        if (cle.startsWith("closia:")) localStorage.removeItem(cle);
      }
    } catch {
      // Navigation privée, stockage refusé : le rechargement reste utile.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.erreur) return this.props.children;

    const page = this.props.page ? `« ${this.props.page} »` : "cet écran";

    return (
      <div style={{ padding: "60px 32px", maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: "34px", marginBottom: "14px" }}>⚠️</div>

        <div className="display" style={{ fontSize: "19px", fontWeight: 700, marginBottom: "8px" }}>
          {page} n'a pas pu s'afficher
        </div>

        <p style={{ fontSize: "13.5px", color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 24px" }}>
          {this.props.racine
            ? "Réessaie dans un instant. Tes données ne sont pas touchées — rien n'a été perdu."
            : "Le reste de l'application fonctionne : tu peux changer de page dans le menu. Tes données ne sont pas touchées — rien n'a été perdu."}
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="focusable"
            onClick={() => window.location.reload()}
            style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: 600 }}
          >
            Recharger la page
          </button>
          <button
            className="focusable"
            onClick={this.reinitialiser}
            style={{ background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "10px 18px", fontSize: "13px" }}
          >
            Réinitialiser l'affichage
          </button>
        </div>

        <p style={{ fontSize: "11.5px", color: "var(--text-faint)", margin: "14px 0 0" }}>
          « Réinitialiser l'affichage » oublie tes préférences de vue et repart du réglage d'origine.
          À essayer si le rechargement ne suffit pas.
        </p>

        <details style={{ marginTop: "28px", textAlign: "left" }}>
          <summary style={{ fontSize: "12px", color: "var(--text-faint)", cursor: "pointer" }}>
            Détail technique (à transmettre au support)
          </summary>
          <pre
            className="mono"
            style={{ fontSize: "11px", color: "var(--text-dim)", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "12px", marginTop: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {String(this.state.erreur?.message || this.state.erreur)}
          </pre>
        </details>
      </div>
    );
  }
}
