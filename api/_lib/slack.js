// Envoi vers un webhook entrant Slack.
//
// Placé dans _lib et non dans une route : le point du matin (cron) comme le
// message de test (api/integrations.js) s'en servent, et les fichiers _lib ne
// comptent pas dans le plafond de fonctions serverless de Vercel.
export async function postSlack(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  // Slack répond « ok » en texte brut, jamais en JSON.
  const corps = await res.text();
  if (!res.ok || corps.trim() !== "ok") {
    throw new Error(corps.trim() || `Slack a répondu ${res.status}`);
  }
}
