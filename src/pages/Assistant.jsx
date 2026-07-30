import { useState } from "react";
import { callAI, SparklesIcon } from "../lib/ui.jsx";

const SUGGESTIONS = [
  "Comment relancer un prospect silencieux depuis 2 semaines ?",
  "Donne-moi 3 objections courantes en closing et comment y répondre.",
  "Aide-moi à préparer un appel de découverte pour une PME industrielle.",
];

export default function Assistant({ session }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send(question) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const prompt = `Tu es l'assistant commercial intégré à Piste, un outil de gestion de pipeline de vente. Réponds en français, de façon concise et actionnable, avec des conseils concrets de vente B2B.

Question : ${q}`;
      const text = await callAI(prompt, session.access_token);
      setMessages((m) => [...m, { role: "assistant", text }]);
    } catch (e) {
      setError("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "28px 32px 32px", maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
      <div className="display" style={{ fontWeight: 700, fontSize: "20px", marginBottom: "4px" }}>☕ Assistant IA</div>
      <div style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "18px" }}>Pose une question de vente, sans lien avec un prospect précis.</div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="focusable"
                onClick={() => send(s)}
                style={{ textAlign: "left", background: "var(--panel)", border: "0.5px solid var(--hairline)", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: "var(--text-dim)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--blue-dim)" : "var(--panel)",
              color: m.role === "user" ? "var(--blue)" : "var(--text)",
              border: "0.5px solid " + (m.role === "user" ? "#2563eb40" : "var(--hairline)"),
              borderRadius: "12px",
              padding: "10px 14px",
              fontSize: "13px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: "flex-start", color: "var(--text-faint)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <SparklesIcon size={13} color="var(--blue)" /> Réflexion en cours...
          </div>
        )}
        {error && <div style={{ color: "var(--red)", fontSize: "12px" }}>{error}</div>}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ display: "flex", gap: "8px" }}
      >
        <input
          className="focusable"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris ta question..."
          style={{ flex: 1, background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", color: "var(--text)", fontSize: "13px", padding: "10px 12px" }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="focusable"
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--blue-dim)", color: "var(--blue)", border: "0.5px solid #2563eb55", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", opacity: loading || !input.trim() ? 0.6 : 1 }}
        >
          <SparklesIcon size={13} color="var(--blue)" /> Envoyer
        </button>
      </form>
    </div>
  );
}
