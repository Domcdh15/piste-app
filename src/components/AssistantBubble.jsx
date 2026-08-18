import { useState } from "react";
import { callAI, SparklesIcon, XIcon } from "../lib/ui.jsx";

export default function AssistantBubble({ session }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setSending(true);
    try {
      const answer = await callAI(
        `Tu es l'assistant intégré au CRM Closia (pipeline commercial, agenda, relances, assistant IA). Réponds de façon concise et utile, en français, à la question suivante de l'utilisateur :\n\n${question}`,
        session.access_token
      );
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: e.message || "Une erreur est survenue. Réessaie.", error: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "88px",
            right: "24px",
            width: "340px",
            height: "440px",
            background: "var(--panel)",
            border: "0.5px solid var(--hairline)",
            borderRadius: "16px",
            boxShadow: "var(--shadow-md, 0 8px 24px rgba(20,23,31,.16))",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 200,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--gradient-identity)", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "13.5px" }}>
              <SparklesIcon size={14} color="#fff" /> Assistant Closia
            </div>
            <button className="focusable" onClick={() => setOpen(false)} style={{ background: "none", border: "none", padding: 0, display: "flex" }}>
              <XIcon size={16} color="#fff" />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {messages.length === 0 && (
              <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Pose une question sur Closia ou sur comment utiliser l'outil.</div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "user" ? "var(--blue-dim)" : "var(--panel2)",
                  color: m.error ? "var(--red)" : m.role === "user" ? "var(--blue)" : "var(--text)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  fontSize: "12.5px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                }}
              >
                {m.text}
              </div>
            ))}
            {sending && <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>L'assistant réfléchit...</div>}
          </div>

          <div style={{ display: "flex", gap: "8px", padding: "12px", borderTop: "0.5px solid var(--hairline)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Pose ta question..."
              style={{ flex: 1, background: "var(--panel2)", border: "0.5px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", color: "var(--text)" }}
            />
            <button
              className="focusable"
              onClick={send}
              disabled={sending || !input.trim()}
              style={{
                background: "var(--blue-dim)",
                color: "var(--blue)",
                border: "0.5px solid #147ff555",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 600,
                opacity: sending || !input.trim() ? 0.6 : 1,
              }}
            >
              →
            </button>
          </div>
        </div>
      )}

      <button
        className="focusable"
        onClick={() => setOpen((o) => !o)}
        title="Assistant Closia"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "var(--gradient-identity)",
          border: "none",
          boxShadow: "var(--shadow-md, 0 8px 24px rgba(20,23,31,.16))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 200,
        }}
      >
        {open ? <XIcon size={20} color="#fff" /> : <SparklesIcon size={20} color="#fff" />}
      </button>
    </>
  );
}
