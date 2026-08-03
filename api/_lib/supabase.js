import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rbzbvbfgselsyrkxvwbj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IqBG4JndPA3wgsji3ovftg_5VQ2ULIa";

export const ADMIN_EMAILS = ["domitille.croizier@gmail.com"];

export function isAdminUser(user) {
  return !!user && ADMIN_EMAILS.includes((user.email || "").toLowerCase());
}

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

// Ces routes sont appelées depuis le back office, une interface séparée sur un
// autre domaine — l'accès reste protégé par le token + l'allowlist d'email
// (isAdminUser), pas par l'origine, donc un CORS ouvert est sans risque ici.
export function applyAdminCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
