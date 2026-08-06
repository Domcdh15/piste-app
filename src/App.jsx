import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Login from "./pages/Login.jsx";
import Shell from "./pages/Shell.jsx";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("impersonate_token");
    if (tokenHash) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }).then(({ data, error }) => {
        setSession(error ? null : data.session);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
      });
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  return session ? <Shell session={session} /> : <Login />;
}
