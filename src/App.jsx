import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Login, { SetPassword } from "./pages/Login.jsx";
import Shell from "./pages/Shell.jsx";

// Le modèle d'email par défaut de Supabase renvoie le type dans le fragment
// d'URL (#type=invite). supabase-js le consomme puis l'efface, donc on le lit
// au chargement du module — avant lui. Ça évite d'avoir à personnaliser les
// modèles d'email pour que l'invitation fonctionne.
const URL_HASH_TYPE = (() => {
  const m = /[#&]type=([a-z_]+)/.exec(window.location.hash || "");
  return m ? m[1] : null;
})();

const NEEDS_PASSWORD_SETUP = URL_HASH_TYPE === "invite" || URL_HASH_TYPE === "recovery";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [team, setTeam] = useState(null);
  const [passwordSetupMode, setPasswordSetupMode] = useState(false);

  async function loadTeam(currentSession) {
    if (!currentSession) {
      setTeam(null);
      return;
    }
    try {
      const res = await fetch("/api/team", { headers: { Authorization: `Bearer ${currentSession.access_token}` } });
      if (!res.ok) return setTeam(null);
      const data = await res.json();
      setTeam(data);
    } catch (e) {
      setTeam(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const impersonateToken = params.get("impersonate_token");
    const recoveryToken = params.get("recovery_token");
    // Un coéquipier invité arrive avec son jeton : il définit son mot de passe
    // avant d'entrer, exactement comme une réinitialisation.
    const inviteToken = params.get("invite_token");

    if (impersonateToken) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: impersonateToken, type: "magiclink" }).then(({ data, error }) => {
        const s = error ? null : data.session;
        setSession(s);
        loadTeam(s);
      });
    } else if (inviteToken) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: inviteToken, type: "invite" }).then(({ data, error }) => {
        const s = error ? null : data.session;
        setSession(s);
        setPasswordSetupMode(!error);
        loadTeam(s);
      });
    } else if (recoveryToken) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: recoveryToken, type: "recovery" }).then(({ data, error }) => {
        const s = error ? null : data.session;
        setSession(s);
        setPasswordSetupMode(!error);
        loadTeam(s);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        // Arrivée par un lien d'invitation au format par défaut : on demande
        // le mot de passe avant de laisser entrer.
        if (data.session && NEEDS_PASSWORD_SETUP) setPasswordSetupMode(true);
        loadTeam(data.session);
      });
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY" || (newSession && NEEDS_PASSWORD_SETUP)) setPasswordSetupMode(true);
      loadTeam(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
        Chargement...
      </div>
    );
  }

  if (session && passwordSetupMode) return <SetPassword onDone={() => setPasswordSetupMode(false)} />;

  return session ? <Shell session={session} team={team} reloadTeam={() => loadTeam(session)} /> : <Login />;
}
