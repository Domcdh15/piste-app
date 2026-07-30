import { getUserFromToken, bearerToken } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Prompt manquant" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "Erreur API Claude", details: errText });
    }

    const data = await response.json();
    const text = (data.content || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur" });
  }
}
