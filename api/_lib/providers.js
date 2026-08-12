const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access Calendars.Read Mail.Send",
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

function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO() {
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

export async function sendEmail(provider, accessToken, { to, subject, body, fromName }) {
  if (provider === "google") {
    const headers = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject || "", "utf-8").toString("base64")}?=`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
    ];
    const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
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
