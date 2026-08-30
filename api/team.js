import { getUserFromToken, bearerToken, supabaseAdmin } from "./_lib/supabase.js";
import { planTierFor } from "./_lib/plans.js";

const ROLES = ["admin", "sales", "customer_success"];
const APP_URL = "https://piste-app-seven.vercel.app";

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
    const [{ data: team }, { data: members }, { data: integ }] = await Promise.all([
      admin.from("teams").select("*").eq("id", membership.team_id).single(),
      admin.from("team_members").select("id, user_id, role").eq("team_id", membership.team_id),
      admin.from("team_integrations").select("*").eq("team_id", membership.team_id).maybeSingle(),
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

    // On ne renvoie jamais le webhook ni le jeton : l'interface a seulement
    // besoin de savoir si la connexion existe.
    const integrations = {
      slack: !!integ?.slack_webhook_url,
      slackDailyBrief: integ?.slack_daily_brief !== false,
      notion: !!integ?.notion_token,
      notionDatabaseId: integ?.notion_database_id || null,
    };

    return res.status(200).json({ team, role: membership.role, members: enriched, integrations });
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
      .select("user_id, sales_owner_id, csm_owner_id, team_id, stage")
      .eq("id", prospectId)
      .eq("team_id", membership.team_id)
      .maybeSingle();
    if (!before) return res.status(404).json({ error: "Prospect introuvable" });

    // Changer le commercial responsable reste une décision d'administrateur :
    // sinon n'importe qui se réattribue le portefeuille d'un collègue par un
    // appel direct, l'interface ne protégeant rien.
    //
    // Passer le relais à un CSM, en revanche, appartient au commercial du
    // dossier : c'est lui qui sait quand l'affaire est prête à être confiée.
    // Uniquement sur une affaire gagnée, et uniquement sur son propre dossier.
    if (membership.role !== "admin") {
      if (salesOwnerId !== undefined) {
        return res.status(403).json({ error: "Seul un administrateur peut changer le commercial responsable." });
      }
      const sien = [before.user_id, before.sales_owner_id].includes(user.id);
      if (!sien) return res.status(403).json({ error: "Ce dossier n'est pas le vôtre." });
      if (before.stage !== "Gagné") {
        return res.status(400).json({ error: "Le relais vers un CSM se passe une fois l'affaire gagnée." });
      }
      if (csmOwnerId) {
        const { data: cible } = await admin
          .from("team_members")
          .select("role")
          .eq("team_id", membership.team_id)
          .eq("user_id", csmOwnerId)
          .maybeSingle();
        if (!cible) return res.status(400).json({ error: "Cette personne ne fait pas partie de votre équipe." });
      }
    }

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

    // On fabrique le lien sans l'envoyer : le SMTP par défaut de Supabase est
    // bridé et réservé aux tests. L'admin le transmet lui-même, ou le fait
    // partir depuis sa propre boîte Gmail/Outlook déjà connectée — auquel cas
    // le coéquipier reçoit l'invitation d'un collègue, pas d'un noreply.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: APP_URL },
    });
    if (linkError || !link?.user) {
      const already = /already|exist/i.test(linkError?.message || "");
      return res.status(400).json({
        error: already
          ? "Cette adresse a déjà un compte Closia."
          : linkError?.message || "La création de l'invitation a échoué",
      });
    }

    const { error: memberError } = await admin.from("team_members").insert({ team_id: membership.team_id, user_id: link.user.id, role });
    if (memberError) return res.status(500).json({ error: "L'ajout à l'équipe a échoué" });

    if (willBeCount > tier.seats && confirmOverage) {
      await admin.from("teams").update({ plan_price: price + tier.overagePrice }).eq("id", membership.team_id);
    }

    return res.status(200).json({ ok: true, invitedEmail: email, inviteLink: link.properties?.action_link || null });
  }

  if (action === "change_plan") {
    const { planPrice } = req.body;
    if (typeof planPrice !== "number" || planPrice <= 0) return res.status(400).json({ error: "Tarif invalide" });
    const { error } = await admin.from("teams").update({ plan_price: planPrice }).eq("id", membership.team_id);
    if (error) return res.status(500).json({ error: "Le changement d'abonnement a échoué" });
    return res.status(200).json({ ok: true });
  }

  if (action === "set_company") {
    // L'identité de facturation engage l'entreprise : seul l'admin la fixe.
    const FIELDS = [
      "company_name", "billing_address", "billing_postal_code", "billing_city",
      "siret", "vat_exempt", "vat_number", "vat_rate",
      "devis_validity_days", "devis_payment_terms",
    ];
    const patch = {};
    for (const f of FIELDS) {
      if (req.body[f] !== undefined) patch[f] = req.body[f] === "" ? null : req.body[f];
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Aucun champ à mettre à jour" });
    const { error } = await admin.from("teams").update(patch).eq("id", membership.team_id);
    if (error) return res.status(500).json({ error: "L'enregistrement a échoué" });
    return res.status(200).json({ ok: true });
  }

  if (action === "set_integration") {
    // Réservé aux formules Équipe et Business : c'est là que le besoin de
    // diffuser vers un canal partagé apparaît.
    const { data: teamRow } = await admin.from("teams").select("plan_price").eq("id", membership.team_id).single();
    if (Number(teamRow?.plan_price ?? 19) < 39) {
      return res.status(403).json({ error: "Les intégrations Slack et Notion sont incluses à partir de la formule Équipe." });
    }

    const { slack_webhook_url, slack_daily_brief, notion_token, notion_database_id } = req.body;
    const patch = { team_id: membership.team_id, updated_at: new Date().toISOString() };

    if (slack_webhook_url !== undefined) {
      const url = (slack_webhook_url || "").trim();
      if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
        return res.status(400).json({ error: "Cette adresse n'est pas un webhook Slack (elle doit commencer par https://hooks.slack.com/)." });
      }
      patch.slack_webhook_url = url || null;
    }
    if (slack_daily_brief !== undefined) patch.slack_daily_brief = !!slack_daily_brief;
    if (notion_token !== undefined) {
      const t = (notion_token || "").trim();
      if (t && !/^(secret_|ntn_)/.test(t)) {
        return res.status(400).json({ error: "Ce jeton ne ressemble pas à un jeton d'intégration Notion." });
      }
      patch.notion_token = t || null;
    }
    if (notion_database_id !== undefined) {
      // Notion accepte l'identifiant avec ou sans tirets : on normalise.
      const raw = (notion_database_id || "").trim().replace(/-/g, "");
      if (raw && !/^[0-9a-f]{32}$/i.test(raw)) {
        return res.status(400).json({ error: "L'identifiant de base Notion doit comporter 32 caractères." });
      }
      patch.notion_database_id = raw || null;
    }

    const { error } = await admin.from("team_integrations").upsert(patch, { onConflict: "team_id" });
    if (error) return res.status(500).json({ error: "L'enregistrement a échoué" });
    return res.status(200).json({ ok: true });
  }

  if (action === "set_team_flags") {
    const { has_multiple_sales, has_multiple_csm, require_next_action, sales_visibility } = req.body;
    const patch = {};
    if (has_multiple_sales !== undefined) patch.has_multiple_sales = has_multiple_sales;
    if (has_multiple_csm !== undefined) patch.has_multiple_csm = has_multiple_csm;
    if (require_next_action !== undefined) patch.require_next_action = !!require_next_action;
    if (sales_visibility !== undefined) {
      // La base porte la même contrainte : on refuse ici pour renvoyer un
      // message clair plutôt qu'une erreur 500 venue de Postgres.
      if (!["own", "team_aggregate", "team_detail"].includes(sales_visibility)) {
        return res.status(400).json({ error: "Niveau de visibilité inconnu" });
      }
      patch.sales_visibility = sales_visibility;
    }
    const { error } = await admin.from("teams").update(patch).eq("id", membership.team_id);
    if (error) return res.status(500).json({ error: "La mise à jour a échoué" });
    return res.status(200).json({ ok: true });
  }

  res.status(400).json({ error: "Action inconnue" });
}
