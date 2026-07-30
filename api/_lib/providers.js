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

export async function fetchTodayEvents(provider, accessToken) {
  if (provider === "google") {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startOfDayISO());
    url.searchParams.set("timeMax", endOfDayISO());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error("google_fetch_failed");
    const data = await res.json();
    return (data.items || []).map((e) => ({
      id: e.id,
      title: e.summary || "(Sans titre)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      provider: "google",
    }));
  }

  if (provider === "microsoft") {
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
    url.searchParams.set("startDateTime", startOfDayISO());
    url.searchParams.set("endDateTime", endOfDayISO());
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
      provider: "microsoft",
    }));
  }

  return [];
}
