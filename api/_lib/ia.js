// Appel direct au modèle, pour les traitements automatiques.
//
// Distinct de api/generate.js, qui sert les demandes d'un utilisateur connecté
// et décompte son quota. Ici l'appel est déclenché par le cron, sans personne
// derrière : le décompter sur le quota de quelqu'un le pénaliserait pour un
// rapport qu'il n'a pas demandé.
//
// Coût assumé : une génération par membre et par semaine, soit environ
// 20 par mois pour une équipe de cinq, ou 0,22 € — un centième de la marge
// d'un abonnement Équipe.
export async function genererTexte(prompt, maxTokens = 700) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`generation_failed_${res.status}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("").trim();
}
