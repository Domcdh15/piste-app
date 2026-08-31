import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";
import { planTierFor } from "../_lib/plans.js";

const DEFAULT_PRICE = 19;

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

  if (req.query.clientId) {
    const clientId = req.query.clientId;
    const [prospects, tasks, activities, settings, membership, auditLog, clientTickets] = await Promise.all([
      admin.from("prospects").select("*").eq("user_id", clientId).order("created_at", { ascending: false }),
      admin.from("tasks").select("*").eq("user_id", clientId).order("due_at", { ascending: true, nullsFirst: false }),
      admin.from("activities").select("*").eq("user_id", clientId).order("created_at", { ascending: false }).limit(100),
      admin.from("user_settings").select("*").eq("user_id", clientId).maybeSingle(),
      admin.from("team_members").select("*").eq("user_id", clientId).maybeSingle(),
      admin.from("admin_audit_log").select("*").eq("target_user_id", clientId).order("created_at", { ascending: false }).limit(50),
      admin.from("support_requests").select("*").eq("user_id", clientId).order("created_at", { ascending: false }),
    ]);

    let team = null;
    let teamMembers = [];
    if (membership.data) {
      const [teamRow, membersRows] = await Promise.all([
        admin.from("teams").select("*").eq("id", membership.data.team_id).single(),
        admin.from("team_members").select("id, user_id, role").eq("team_id", membership.data.team_id),
      ]);
      team = teamRow.data || null;
      teamMembers = membersRows.data || [];
    }

    return res.status(200).json({
      prospects: prospects.data || [],
      tasks: tasks.data || [],
      activities: activities.data || [],
      settings: settings.data || null,
      team,
      teamMembers,
      auditLog: auditLog.data || [],
      supportRequests: clientTickets.data || [],
    });
  }

  const { data: leads } = await admin.from("leads").select("*").order("created_at", { ascending: false });
  const { data: supportRequests } = await admin.from("support_requests").select("*").order("created_at", { ascending: false });

  const { data: settingsRows } = await admin.from("user_settings").select("*");
  const settingsByUserId = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));

  const { data: memberRows } = await admin.from("team_members").select("*");
  const membershipByUserId = Object.fromEntries((memberRows || []).map((m) => [m.user_id, m]));
  const memberCountByTeamId = {};
  (memberRows || []).forEach((m) => {
    memberCountByTeamId[m.team_id] = (memberCountByTeamId[m.team_id] || 0) + 1;
  });

  const { data: teamRows } = await admin.from("teams").select("*");
  const teamsById = Object.fromEntries((teamRows || []).map((t) => [t.id, t]));

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
    const membership = membershipByUserId[u.id];
    const team = membership ? teamsById[membership.team_id] : null;
    const memberCount = membership ? memberCountByTeamId[membership.team_id] || 1 : 1;
    const useTeamBilling = !!team && (memberCount > 1 || team.plan_price != null);
    const price = useTeamBilling ? (team.plan_price ?? null) : (s.plan_price ?? DEFAULT_PRICE);

    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
      banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
      first_name: s.first_name || null,
      last_name: s.last_name || null,
      company_name: s.company_name || null,
      company_size: s.company_size || null,
      invoice_status: s.invoice_status || "none",
      invoice_amount: s.invoice_amount ?? null,
      invoice_note: s.invoice_note || null,
      team_id: membership?.team_id || null,
      team_role: membership?.role || null,
      team_member_count: memberCount,
      plan_price: price,
      // Le nom de la formule est déduit ici, jamais recalculé par le back
      // office : deux grilles finiraient par diverger.
      plan_tier: price == null ? null : planTierFor(price).name,
      is_comped: useTeamBilling ? !!team.is_comped : !!s.is_comped,
      trial_ends_at: useTeamBilling ? team.trial_ends_at : (s.trial_ends_at || null),
      subscription_status: useTeamBilling ? team.subscription_status : (s.subscription_status || null),
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const teams = (teamRows || []).map((t) => ({
    ...t,
    member_count: memberCountByTeamId[t.id] || 0,
  }));

  res.status(200).json({ leads: leads || [], supportRequests: supportRequests || [], users, teams });
}
