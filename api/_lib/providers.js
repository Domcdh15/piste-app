const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.readonly",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access Calendars.Read Mail.Send Mail.Read",
    extraAuthParams: {},
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  },
};

export function providerConfig(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error("Fournisseur inconnu");
  return {
    ...p,
    clientId: process.env[p.clientIdEnv],
    clientSecret: process.env[p.clientSecretEnv],
  };
}

export function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function fetchEventsInRange(provider, accessToken, startISO, endISO) {
  if (provider === "google") {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startISO);
    url.searchParams.set("timeMax", endISO);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error("google_fetch_failed");
    const data = await res.json();
    return (data.items || []).map((e) => ({
      id: e.id,
      title: e.summary || "(Sans titre)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || "",
      meetingUrl: e.hangoutLink || "",
      attendees: (e.attendees || []).map((a) => a.email).filter(Boolean),
      provider: "google",
    }));
  }

  if (provider === "microsoft") {
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
    url.searchParams.set("startDateTime", startISO);
    url.searchParams.set("endDateTime", endISO);
    url.searchParams.set("$top", "250");
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    if (!res.ok) throw new Error("microsoft_fetch_failed");
    const data = await res.json();
    return (data.value || []).map((e) => ({
      id: e.id,
      title: e.subject || "(Sans titre)",
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      location: e.location?.displayName || "",
      meetingUrl: e.onlineMeeting?.joinUrl || "",
      attendees: (e.attendees || []).map((a) => a.emailAddress?.address).filter(Boolean),
      provider: "microsoft",
    }));
  }

  return [];
}

export async function fetchTodayEvents(provider, accessToken) {
  return fetchEventsInRange(provider, accessToken, startOfDayISO(), endOfDayISO());
}

// Fonction partagée par tous les endpoints qui utilisent une connexion calendar_connections,
// pour éviter de dupliquer la logique de refresh de token à chaque fois.
export async function ensureFreshToken(admin, conn) {
  if (new Date(conn.expires_at) > new Date(Date.now() + 60000)) return conn.access_token;

  const cfg = providerConfig(conn.provider);
  const body = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  };
  if (conn.provider === "microsoft") body.scope = cfg.scope;

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error("refresh_failed");

  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin.from("calendar_connections").update({ access_token: tokens.access_token, expires_at }).eq("id", conn.id);

  return tokens.access_token;
}

export async function listRecentMessages(provider, accessToken, sinceISO) {
  if (provider === "google") {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("in:inbox newer_than:2d")}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) throw new Error("gmail_list_failed");
    const listData = await listRes.json();
    const ids = (listData.messages || []).map((m) => m.id);
    const sinceMs = new Date(sinceISO).getTime();
    const messages = [];
    for (const id of ids) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const internalDate = Number(msg.internalDate || 0);
      if (internalDate <= sinceMs) continue;
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name === "From")?.value || "";
      const subjectHeader = headers.find((h) => h.name === "Subject")?.value || "";
      const emailMatch = fromHeader.match(/<([^>]+)>/);
      const fromEmail = (emailMatch ? emailMatch[1] : fromHeader).trim().toLowerCase();
      if (fromEmail) messages.push({ id, from: fromEmail, subject: subjectHeader, receivedAt: new Date(internalDate).toISOString() });
    }
    return messages;
  }

  if (provider === "microsoft") {
    const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
    url.searchParams.set("$filter", `receivedDateTime gt ${sinceISO}`);
    url.searchParams.set("$select", "id,from,subject,receivedDateTime");
    url.searchParams.set("$top", "20");
    url.searchParams.set("$orderby", "receivedDateTime desc");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) throw new Error("outlook_list_failed");
    const data = await res.json();
    return (data.value || [])
      .map((m) => ({
        id: m.id,
        from: (m.from?.emailAddress?.address || "").toLowerCase(),
        subject: m.subject || "",
        receivedAt: m.receivedDateTime,
      }))
      .filter((m) => m.from);
  }

  return [];
}

// `attachment` (optionnel) : { filename, contentType, base64 }
export async function sendEmail(provider, accessToken, { to, subject, body, fromName, attachment }) {
  if (provider === "google") {
    const encodedSubject = `Subject: =?utf-8?B?${Buffer.from(subject || "", "utf-8").toString("base64")}?=`;
    let message;

    if (attachment) {
      const boundary = `closia_${Date.now().toString(36)}`;
      message = [
        `To: ${to}`,
        encodedSubject,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body || "",
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "",
        attachment.base64.replace(/(.{76})/g, "$1\r\n"),
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      const headers = [`To: ${to}`, encodedSubject, "Content-Type: text/plain; charset=utf-8", "MIME-Version: 1.0"];
      message = `${headers.join("\r\n")}\r\n\r\n${body}`;
    }
    const raw = Buffer.from(message, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || "gmail_send_failed");
    }
    return;
  }

  if (provider === "microsoft") {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: subject || "",
          body: { contentType: "Text", content: body || "" },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(attachment
            ? {
                attachments: [
                  {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: attachment.filename,
                    contentType: attachment.contentType,
                    contentBytes: attachment.base64,
                  },
                ],
              }
            : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || "outlook_send_failed");
    }
    return;
  }

  throw new Error("Fournisseur d'envoi inconnu");
}

// Applique la signature directement dans les paramètres Gmail du compte connecté (nécessite
// le scope gmail.settings.basic) — pas d'équivalent public côté Microsoft Graph pour Outlook.
export async function setGmailSignature(accessToken, signatureText) {
  const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "gmail_sendas_list_failed");
  }
  const { sendAs = [] } = await listRes.json();
  const primary = sendAs.find((s) => s.isPrimary) || sendAs[0];
  if (!primary) throw new Error("Aucune adresse d'envoi trouvée sur ce compte Gmail");

  const signatureHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#202124;white-space:pre-line;">${signatureText
    .split("\n")
    .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .join("<br>")}</div>`;

  const patchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(primary.sendAsEmail)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ signature: signatureHtml }),
    }
  );
  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "gmail_signature_update_failed");
  }
}

// Convertit la signature HTML renvoyée par Gmail en texte brut simple, pour l'utiliser
// comme point de départ éditable côté Closia (import, pas de rendu HTML fidèle).
function htmlSignatureToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, arr) => line || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
}

export async function getGmailSignature(accessToken) {
  const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "gmail_sendas_list_failed");
  }
  const { sendAs = [] } = await listRes.json();
  const primary = sendAs.find((s) => s.isPrimary) || sendAs[0];
  if (!primary?.signature) return "";
  return htmlSignatureToText(primary.signature);
}

// --- Lecture des échanges email (Gmail) ---------------------------------
// Utilisé pour donner à l'IA le contexte réel des échanges avec un prospect.
// Rien n'est stocké : les messages sont lus à la demande puis jetés.

function decodeBase64Url(data) {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

// Le corps d'un message Gmail peut être à la racine ou réparti dans des parts
// imbriquées (multipart) — on privilégie le texte brut, sinon on retombe sur le HTML nettoyé.
function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);

  for (const part of payload.parts || []) {
    const found = extractBody(part);
    if (found) return found;
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return htmlToText(decodeBase64Url(payload.body.data));
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

function htmlToText(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n");
}

function headerValue(headers, name) {
  return (headers || []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

const MAX_BODY_CHARS = 1500;

// Point d'entrée unique — Gmail et Outlook renvoient le même format de message.
export async function fetchEmailThreadWith(provider, accessToken, contactEmail, maxResults = 8) {
  if (provider === "google") return fetchGmailThreadWith(accessToken, contactEmail, maxResults);
  if (provider === "microsoft") return fetchOutlookThreadWith(accessToken, contactEmail, maxResults);
  return [];
}

async function fetchOutlookThreadWith(accessToken, contactEmail, maxResults = 8) {
  const safeEmail = contactEmail.replace(/["\\]/g, "");
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  // $search couvre expéditeur et destinataires en une requête ; il interdit $orderby,
  // le tri est donc fait côté serveur Closia juste après.
  url.searchParams.set("$search", `"participants:${safeEmail}"`);
  url.searchParams.set("$select", "id,subject,from,toRecipients,receivedDateTime,bodyPreview,body");
  url.searchParams.set("$top", String(maxResults));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error("outlook_list_failed");
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  const { value = [] } = await res.json();

  return value
    .map((m) => {
      const raw = m.body?.contentType === "html" ? htmlToText(m.body?.content) : m.body?.content || m.bodyPreview || "";
      const body = raw.trim();
      const fromAddr = m.from?.emailAddress;
      return {
        id: m.id,
        from: fromAddr ? `${fromAddr.name || ""} <${fromAddr.address || ""}>`.trim() : "",
        to: (m.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean).join(", "),
        subject: m.subject || "",
        date: m.receivedDateTime || "",
        sentAt: m.receivedDateTime || null,
        snippet: m.bodyPreview || "",
        body: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…` : body,
      };
    })
    .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
}

async function fetchGmailThreadWith(accessToken, contactEmail, maxResults = 8) {
  const safeEmail = contactEmail.replace(/["\\]/g, "");
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `from:"${safeEmail}" OR to:"${safeEmail}"`);
  listUrl.searchParams.set("maxResults", String(maxResults));

  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) {
    const detail = await listRes.text();
    const err = new Error("gmail_list_failed");
    err.status = listRes.status;
    err.detail = detail;
    throw err;
  }
  const { messages = [] } = await listRes.json();
  if (messages.length === 0) return [];

  const results = await Promise.all(
    messages.map(async (m) => {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const msg = await res.json();
      const headers = msg.payload?.headers;
      const body = extractBody(msg.payload).trim();
      return {
        id: msg.id,
        from: headerValue(headers, "From"),
        to: headerValue(headers, "To"),
        subject: headerValue(headers, "Subject"),
        date: headerValue(headers, "Date"),
        sentAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
        snippet: msg.snippet || "",
        body: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…` : body,
      };
    })
  );

  return results.filter(Boolean).sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
}
