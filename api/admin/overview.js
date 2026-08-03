import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const admin = supabaseAdmin();

  const { data: leads } = await admin.from("leads").select("*").order("created_at", { ascending: false });

  const { data: settingsRows } = await admin.from("user_settings").select("*");
  const settingsByUserId = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));

  const authUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }

  const users = authUsers.map((u) => {
    const s = settingsByUserId[u.id] || {};
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
      first_name: s.first_name || null,
      last_name: s.last_name || null,
      company_name: s.company_name || null,
      plan_price: s.plan_price ?? null,
      trial_ends_at: s.trial_ends_at || null,
      subscription_status: s.subscription_status || null,
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.status(200).json({ leads: leads || [], users });
}
