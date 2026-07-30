const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access Calendars.Read",
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
