import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rbzbvbfgselsyrkxvwbj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IqBG4JndPA3wgsji3ovftg_5VQ2ULIa";

export function supabaseAdmin() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getUserFromToken(token) {
  if (!token) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export function bearerToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}
