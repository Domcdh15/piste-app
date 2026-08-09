import { useEffect, useState } from "react";
import { PlugIcon, PageTitle, CalendarIcon, ArrowLeftIcon } from "../lib/ui.jsx";

const BADGE_COLORS = ["#2563eb", "#0ea5e9", "#7c3aed", "#0d9488", "#d97706", "#dc2626", "#4f46e5", "#0284c7", "#059669"];
function badgeColor(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

const CATEGORIES = ["Toutes", "Agenda", "CRM", "Email", "Productivité"];

const CATALOG = [
  { key: "google", label: "Google Calendar", category: "Agenda", desc: "Synchronisez vos rendez-vous et envoyez vos relances directement depuis Gmail.", real: true, permissions: "Lecture de l'agenda (calendar.readonly) et envoi d'email (gmail.send)" },
  { key: "microsoft", label: "Outlook Calendar", category: "Agenda", desc: "Synchronisez vos événements et envoyez vos relances directement depuis Outlook.", real: true, permissions: "Lecture de l'agenda (Calendars.Read) et envoi d'email (Mail.Send)" },
  { key: "hubspot", label: "HubSpot", category: "CRM", desc: "Synchronisez vos contacts, entreprises et opportunités avec Closia." },
  { key: "salesforce", label: "Salesforce", category: "CRM", desc: "Centralisez vos comptes, contacts et opportunités Salesforce dans Closia." },
  { key: "pipedrive", label: "Pipedrive", category: "CRM", desc: "Synchronisez vos prospects et opportunités avec Closia." },
  { key: "gmail", label: "Gmail", category: "Email", desc: "Synchronisez vos échanges commerciaux et permettez à Closia d'utiliser leur contexte pour vos relances." },
  { key: "outlook_mail", label: "Outlook", category: "Email", desc: "Connectez votre boîte Outlook et centralisez vos échanges commerciaux." },
  { key: "aircall", label: "Aircall", category: "Productivité", desc: "Logger automatiquement vos appels." },
  { key: "notion", label: "Notion", category: "Productivité", desc: "Exporter comptes-rendus et notes vers Notion." },
  { key: "stripe", label: "Stripe", category: "Productivité", desc: "Suivre les paiements liés à vos deals gagnés." },
];

const COMING_LATER = [
  { key: "slack", label: "Slack", desc: "Recevez vos alertes commerciales directement dans Slack." },
  { key: "zapier", label: "Zapier", desc: "Connectez Closia à des milliers d'applications." },
  { key: "make", label: "Make", desc: "Automatisez vos workflows commerciaux." },
];

export default function Integrations({ session, onBack }) {
  const [status, setStatus] = useState({ google: false, microsoft: false });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [confirmKey, setConfirmKey] = useState(null);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      setStatus({ google: !!data.google, microsoft: !!data.microsoft });
    } catch (e) {
      // silencieux — l'état reste "non connecté"
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function disconnect(provider) {
    await fetch("/api/calendar/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ provider }),
    });
    loadStatus();
  }

  function connect(provider) {
    window.location.href = `/api/${provider}/authorize?token=${encodeURIComponent(session.access_token)}`;
  }

  const connectedTools = CATALOG.filter((t) => t.real && status[t.key]);
  const q = search.trim().toLowerCase();
  const filteredCatalog = CATALOG.filter((t) => (category === "Toutes" || t.category === category) && (!q || t.label.toLowerCase().includes(q)));
  const byCategory = CATEGORIES.slice(1).map((c) => ({ category: c, tools: filteredCatalog.filter((t) => t.category === c) })).filter((g) => g.tools.length > 0);

  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "820px" }}>
      {onBack && (
        <button className="focusable" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: "4px 0", marginBottom: "16px", color: "var(--text-dim)", fontSize: "13px" }}>
          <ArrowLeftIcon size={14} color="var(--text-dim)" /> Retour aux paramètres
        </button>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
        <div>
          <PageTitle icon={PlugIcon} color="#1e40af" style={{ marginBottom: "4px" }}>Intégrations</PageTitle>
          <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>Connectez vos outils. Closia fait le reste.</div>
        </div>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>Vos connexions</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: "14px" }}>
          {loading ? "Chargement..." : connectedTools.length === 0 ? "Aucune application connectée." : `${connectedTools.length} application${connectedTools.length > 1 ? "s" : ""} connectée${connectedTools.length > 1 ? "s" : ""}`}
        </div>

        {!loading && connectedTools.length === 0 ? (
          <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "24px", textAlign: "center" }}>
            <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px" }}>Connectez votre premier outil</div>
            <div style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: "14px" }}>Importez vos données et retrouvez votre activité commerciale dans Closia.</div>
            <button className="focusable" onClick={() => document.getElementById("connect-app-anchor")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600 }}>
              Voir les intégrations
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
            {connectedTools.map((t) => (
              <div key={t.key} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <span style={{ width: "30px", height: "30px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: badgeColor(t.label), color: "#fff", fontWeight: 700, fontSize: "12px" }}>
                    {t.label.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="display" style={{ fontWeight: 600, fontSize: "13px" }}>{t.label}</div>
                    <span className="mono" style={{ fontSize: "10px", fontWeight: 700, color: "#0ea968" }}>● Connecté</span>
                  </div>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginBottom: "10px" }}>{t.desc}</div>
                <button className="focusable" onClick={() => disconnect(t.key)} style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55" }}>
                  Déconnecter
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="connect-app-anchor" style={{ marginBottom: "8px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>Connecter une application</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: "14px" }}>Choisissez un outil à connecter à votre espace Closia.</div>

        <input
          placeholder="Rechercher une intégration..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "9px 12px", marginBottom: "10px" }}
        />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
          {CATEGORIES.map((c) => (
            <button key={c} className="focusable" onClick={() => setCategory(c)} style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 500, background: category === c ? "var(--blue-dim)" : "var(--panel2)", color: category === c ? "var(--blue)" : "var(--text-dim)", border: category === c ? "0.5px solid #2563eb55" : "0.5px solid var(--hairline)" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {byCategory.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: "13px", marginBottom: "24px" }}>Aucune intégration ne correspond à cette recherche.</div>
      ) : (
        byCategory.map((group) => (
          <div key={group.category} style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.04em", marginBottom: "10px" }}>{group.category.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              {group.tools.map((t) => (
                <ToolCard
                  key={t.key}
                  tool={t}
                  connected={t.real && status[t.key]}
                  loading={loading}
                  onConnect={() => (t.real ? setConfirmKey(t.key) : null)}
                  onDisconnect={() => disconnect(t.key)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: "8px", marginBottom: "32px" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>Bientôt disponible</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: "14px" }}>D'autres outils arrivent prochainement.</div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {COMING_LATER.map((t) => (
            <div key={t.key} style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", flex: "1 1 200px", minWidth: "180px" }}>
              <div className="display" style={{ fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>{t.label}</div>
              <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "12px", padding: "18px", textAlign: "center" }}>
        <div className="display" style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>Besoin d'aide pour connecter votre outil ?</div>
        <div style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: "12px" }}>Écrivez-nous, on vous répond rapidement.</div>
        <a href="mailto:support@clos-ia.fr" className="focusable" style={{ display: "inline-block", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
          Contacter le support
        </a>
      </div>

      {confirmKey && (
        <ConnectConfirmModal
          tool={CATALOG.find((t) => t.key === confirmKey)}
          onCancel={() => setConfirmKey(null)}
          onConfirm={() => { connect(confirmKey); setConfirmKey(null); }}
        />
      )}
    </div>
  );
}

function ToolCard({ tool, connected, loading, onConnect, onDisconnect }) {
  return (
    <div style={{ background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ width: "30px", height: "30px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: badgeColor(tool.label), color: "#fff", fontWeight: 700, fontSize: "12px" }}>
          {tool.label.slice(0, 2).toUpperCase()}
        </span>
        <div className="display" style={{ fontWeight: 600, fontSize: "13px" }}>{tool.label}</div>
      </div>
      <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginBottom: "12px", flex: 1 }}>{tool.desc}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.02em" }}>{tool.category.toUpperCase()}</span>
        {!tool.real ? (
          <span style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--panel2)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>Bientôt disponible</span>
        ) : loading ? (
          <span style={{ color: "var(--text-faint)", fontSize: "11.5px" }}>...</span>
        ) : connected ? (
          <button className="focusable" onClick={onDisconnect} style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--red-dim)", color: "var(--red)", border: "0.5px solid var(--red)55", whiteSpace: "nowrap" }}>
            Déconnecter
          </button>
        ) : (
          <button className="focusable" onClick={onConnect} style={{ fontSize: "11.5px", padding: "6px 10px", borderRadius: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", whiteSpace: "nowrap" }}>
            Connecter
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectConfirmModal({ tool, onCancel, onConfirm }) {
  if (!tool) return null;
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: "12px", boxShadow: "var(--shadow-md)", padding: "20px", maxWidth: "380px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <CalendarIcon size={16} color="var(--blue)" />
          <span className="display" style={{ fontWeight: 700, fontSize: "15px" }}>Connecter {tool.label}</span>
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "14px" }}>
          Closia va lire vos rendez-vous à venir dans {tool.label} pour les afficher dans votre agenda, et pourra envoyer des emails de relance en votre nom lorsque vous cliquez sur "Envoyer". Vous serez redirigé vers {tool.label} pour autoriser l'accès.
        </div>
        <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginBottom: "18px" }}>Permissions demandées : {tool.permissions}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="focusable" onClick={onCancel} style={{ flex: 1, background: "var(--panel2)", color: "var(--text-dim)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "9px", fontSize: "13px" }}>
            Annuler
          </button>
          <button className="focusable" onClick={onConfirm} style={{ flex: 1, background: "var(--blue)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px", fontSize: "13px", fontWeight: 600 }}>
            Connecter {tool.label}
          </button>
        </div>
      </div>
    </div>
  );
}
