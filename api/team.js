import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";

const ROLES = ["admin", "sales", "customer_success"];

async function memberLabel(admin, userId) {
  if (!userId) return "Non attribué";
  const [{ data: u }, { data: settings }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("user_settings").select("first_name, last_name").eq("user_id", userId).maybeSingle(),
  ]);
  const name = settings && (settings.first_name || settings.last_name) ? `${settings.first_name || ""} ${settings.last_name || ""}`.trim() : null;
  return name || u?.user?.email || "Utilisateur";
}

async function countAdmins(admin, teamId) {
  const { count } = await admin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("role", "admin");
  return count || 0;
}

export default async function handler(req, res) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const admin = supabaseAdmin();
  const { data: membership } = await admin.from("team_members").select("*").eq("user_id", user.id).maybeSingle();
  if (!membership) return res.status(404).json({ error: "Aucune équipe associée à ce compte" });

  if (req.method === "GET") {
    const [{ data: team }, { data: members }] = await Promise.all([
      admin.from("teams").select("*").eq("id", membership.team_id).single(),
      admin.from("team_members").select("id, user_id, role").eq("team_id", membership.team_id),
    ]);

    const enriched = await Promise.all(
      (members || []).map(async (m) => {
        const [{ data: u }, { data: settings }] = await Promise.all([
          admin.auth.admin.getUserById(m.user_id),
          admin.from("user_settings").select("first_name, last_name").eq("user_id", m.user_id).maybeSingle(),
        ]);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          email: u?.user?.email || null,
          first_name: settings?.first_name || null,
          last_name: settings?.last_name || null,
        };
      })
    );

    return res.status(200).json({ team, role: membership.role, members: enriched });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { action } = req.body || {};

  if (action === "assign_prospect") {
    const { prospectId, salesOwnerId, csmOwnerId } = req.body;
    if (!prospectId) return res.status(400).json({ error: "prospectId manquant" });

    const { data: before } = await admin
      .from("prospects")
      .select("sales_owner_id, csm_owner_id, team_id")
      .eq("id", prospectId)
      .eq("team_id", membership.team_id)
      .maybeSingle();
    if (!before) return res.status(404).json({ error: "Prospect introuvable" });

    const patch = {};
    if (salesOwnerId !== undefined) patch.sales_owner_id = salesOwnerId;
    if (csmOwnerId !== undefined) patch.csm_owner_id = csmOwnerId;
    const { error } = await admin.from("prospects").update(patch).eq("id", prospectId).eq("team_id", membership.team_id);
    if (error) return res.status(500).json({ error: "L'attribution a échoué" });

    const notes = [];
    if (salesOwnerId !== undefined && salesOwnerId !== before.sales_owner_id) {
      notes.push(`Commercial responsable : ${await memberLabel(admin, before.sales_owner_id)} → ${await memberLabel(admin, salesOwnerId)}`);
    }
    if (csmOwnerId !== undefined && csmOwnerId !== before.csm_owner_id) {
      notes.push(`CSM responsable : ${await memberLabel(admin, before.csm_owner_id)} → ${await memberLabel(admin, csmOwnerId)}`);
    }
    if (notes.length > 0) {
      await admin.from("activities").insert({
        prospect_id: prospectId,
        user_id: user.id,
        team_id: membership.team_id,
        type: "reassignation",
        note: notes.join(" · "),
      });
    }

    return res.status(200).json({ ok: true });
  }

  // Le reste des actions est réservé à l'administrateur de l'équipe.
  if (membership.role !== "admin") {
    return res.status(403).json({ error: "Réservé à l'administrateur de l'équipe" });
  }

  if (action === "change_role") {
    const { userId, role } = req.body;
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide" });
    if (userId === user.id && role !== "admin" && (await countAdmins(admin, membership.team_id)) <= 1) {
      return res.status(400).json({ error: "Impossible de retirer le dernier administrateur" });
    }
    const { error } = await admin.from("team_members").update({ role }).eq("team_id", membership.team_id).eq("user_id", userId);
    if (error) return res.status(500).json({ error: "La mise à jour du rôle a échoué" });
    return res.status(200).json({ ok: true });
  }

  if (action === "remove") {
    const { userId } = req.body;
    const { data: target } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", membership.team_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (target?.role === "admin" && (await countAdmins(admin, membership.team_id)) <= 1) {
      return res.status(400).json({ error: "Impossible de retirer le dernier administrateur" });
    }
    const { error } = await admin.from("team_members").delete().eq("team_id", membership.team_id).eq("user_id", userId);
    if (error) return res.status(500).json({ error: "La suppression a échoué" });
    return res.status(200).json({ ok: true });
  }

  if (action === "set_team_flags") {
    const { has_multiple_sales, has_multiple_csm } = req.body;
    const patch = {};
    if (has_multiple_sales !== undefined) patch.has_multiple_sales = has_multiple_sales;
    if (has_multiple_csm !== undefined) patch.has_multiple_csm = has_multiple_csm;
    const { error } = await admin.from("teams").update(patch).eq("id", membership.team_id);
    if (error) return res.status(500).json({ error: "La mise à jour a échoué" });
    return res.status(200).json({ ok: true });
  }

  res.status(400).json({ error: "Action inconnue" });
}
