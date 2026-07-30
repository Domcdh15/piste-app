import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Login from "./pages/Login.jsx";
import Shell from "./pages/Shell.jsx";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

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
