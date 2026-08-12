import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";

const ROLES = ["admin", "sales", "customer_success"];
const APP_URL = "https://piste-app-seven.vercel.app";

const PLAN_TIERS = [
  { name: "Solo", maxPrice: 19, seats: 1, overagePrice: 12 },
  { name: "Équipe", maxPrice: 39, seats: 3, overagePrice: 12 },
  { name: "Business", maxPrice: 79, seats: 10, overagePrice: 10 },
  { name: "Sur mesure", maxPrice: Infinity, seats: 20, overagePrice: 8 },
];

function planTierFor(price) {
  return PLAN_TIERS.find((t) => price <= t.maxPrice) || PLAN_TIERS[PLAN_TIERS.length - 1];
}

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

  if (action === "invite_member") {
    const { email, role, confirmOverage } = req.body;
    if (!email || !ROLES.includes(role)) return res.status(400).json({ error: "Email ou rôle invalide" });

    const [{ count: currentCount }, { data: teamRow }] = await Promise.all([
      admin.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", membership.team_id),
      admin.from("teams").select("plan_price").eq("id", membership.team_id).single(),
    ]);
    const price = Number(teamRow?.plan_price ?? 19);
    const tier = planTierFor(price);
    const seatsUsed = currentCount || 0;
    const willBeCount = seatsUsed + 1;

    if (willBeCount > tier.seats && !confirmOverage) {
      return res.status(200).json({
        needsConfirmation: true,
        tier: tier.name,
        seatsIncluded: tier.seats,
        seatsUsed,
        overagePrice: tier.overagePrice,
      });
    }

    const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: APP_URL,
    });
    if (inviteError) return res.status(500).json({ error: inviteError.message || "L'invitation a échoué" });

    const { error: memberError } = await admin.from("team_members").insert({ team_id: membership.team_id, user_id: created.user.id, role });
    if (memberError) return res.status(500).json({ error: "L'ajout à l'équipe a échoué" });

    if (willBeCount > tier.seats && confirmOverage) {
      await admin.from("teams").update({ plan_price: price + tier.overagePrice }).eq("id", membership.team_id);
    }

    return res.status(200).json({ ok: true, invitedEmail: email });
  }

  if (action === "change_plan") {
    const { planPrice } = req.body;
    if (typeof planPrice !== "number" || planPrice <= 0) return res.status(400).json({ error: "Tarif invalide" });
    const { error } = await admin.from("teams").update({ plan_price: planPrice }).eq("id", membership.team_id);
    if (error) return res.status(500).json({ error: "Le changement d'abonnement a échoué" });
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
