import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Login from "./pages/Login.jsx";
import Shell from "./pages/Shell.jsx";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [team, setTeam] = useState(null);

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
    const tokenHash = params.get("impersonate_token");
    if (tokenHash) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }).then(({ data, error }) => {
        const s = error ? null : data.session;
        setSession(s);
        loadTeam(s);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        loadTeam(data.session);
      });
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  return session ? <Shell session={session} team={team} reloadTeam={() => loadTeam(session)} /> : <Login />;
}
