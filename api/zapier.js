import crypto from "node:crypto";
import { supabaseAdmin } from "./_lib/supabase.js";

// API publique de Closia, consommée par Zapier, Make ou tout appel direct.
//
// Une seule fonction serverless pour tout : l'authentification par clé, sept
// lectures d'événements, cinq écritures et trois recherches. Le routage se fait
// par le paramètre « resource » plutôt que par le chemin — le plan Vercel
// compte les fichiers, pas les routes.
//
// PORTÉE. Une clé vaut soit pour toute l'équipe, soit pour les seuls dossiers
// de son porteur. Cette fonction travaille en rôle de service et court-circuite
// donc les règles d'accès de la base : c'est ici, et nulle part ailleurs, que
// le cloisonnement doit être reproduit. Toute lecture passe par filtrer().

const MAX_LIGNES = 100;

function cleDeLaRequete(req) {
  const h = req.headers["x-closia-key"];
  if (typeof h === "string" && h.trim()) return h.trim();
  // Zapier envoie parfois la clé en Bearer selon la configuration choisie.
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function authentifier(req) {
  const cle = cleDeLaRequete(req);
  if (!cle) return { erreur: "Clé d'API manquante", code: 401 };

  const empreinte = crypto.createHash("sha256").update(cle).digest("hex");
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("api_keys")
    .select("id, team_id, user_id, scope, name")
    .eq("key_hash", empreinte)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return { erreur: "Clé d'API invalide ou révoquée", code: 401 };

  // Date de dernière utilisation, sans bloquer la réponse : c'est un confort
  // d'administration, pas une donnée dont dépend l'appel.
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(
    () => {},
    () => {}
  );

  return { admin, cle: data };
}

// Restreint une requête sur les prospects au périmètre de la clé. Reproduit le
// prédicat des règles d'accès de la table : créateur, commercial responsable ou
// CSM responsable.
function filtrer(query, cle, colonne = "team_id") {
  const q = query.eq(colonne, cle.team_id);
  if (cle.scope === "team") return q;
  return q.or(`user_id.eq.${cle.user_id},sales_owner_id.eq.${cle.user_id},csm_owner_id.eq.${cle.user_id}`);
}

const prospetSortie = (p) => ({
  id: p.id,
  nom: p.name,
  entreprise: p.company,
  email: p.email,
  telephone: p.phone,
  fonction: p.job_title,
  etape: p.stage,
  statut: p.status,
  montant: Number(p.deal_value || 0),
  priorite: p.priority,
  source: p.source,
  secteur: p.industry,
  dernier_echange: p.last_contact_at,
  cree_le: p.created_at,
  modifie_le: p.updated_at,
});

const CHAMPS_PROSPECT = "id, name, company, email, phone, job_title, stage, status, deal_value, priority, source, industry, last_contact_at, created_at, updated_at, closed_at, user_id, team_id, sales_owner_id, csm_owner_id";

export default async function handler(req, res) {
  const auth = await authentifier(req);
  if (auth.erreur) return res.status(auth.code).json({ error: auth.erreur });
  const { admin, cle } = auth;

  const resource = req.query.resource || req.body?.resource;
  const event = req.query.event;

  // ---------------------------------------------------------------- lectures
  if (req.method === "GET") {
    // Zapier appelle cet endpoint pour valider la connexion et l'étiqueter.
    if (resource === "me") {
      const { data: equipe } = await admin.from("teams").select("name, plan_price").eq("id", cle.team_id).single();
      return res.status(200).json({
        equipe: equipe?.name || "Mon équipe",
        cle: cle.name,
        portee: cle.scope === "team" ? "toute l'équipe" : "les dossiers du porteur",
      });
    }

    if (resource === "prospects") {
      const tri = { new: "created_at", updated: "updated_at", won: "closed_at", lost: "closed_at" }[event] || "created_at";
      let q = filtrer(admin.from("prospects").select(CHAMPS_PROSPECT), cle);
      if (event === "won") q = q.eq("status", "gagne").not("closed_at", "is", null);
      if (event === "lost") q = q.eq("status", "perdu").not("closed_at", "is", null);
      const { data } = await q.order(tri, { ascending: false }).limit(MAX_LIGNES);
      return res.status(200).json((data || []).map(prospetSortie));
    }

    if (resource === "events") {
      // Les événements portent leur propre team_id : on filtre dessus, puis on
      // restreint au porteur si la clé est personnelle.
      let q = admin
        .from("prospect_events")
        .select("id, prospect_id, event, from_val, to_val, created_at, prospects!inner(name, company, user_id, sales_owner_id, csm_owner_id)")
        .eq("team_id", cle.team_id);
      if (event) q = q.eq("event", event);
      const { data } = await q.order("created_at", { ascending: false }).limit(MAX_LIGNES);
      const lignes = (data || []).filter(
        (e) => cle.scope === "team" ||
          [e.prospects?.user_id, e.prospects?.sales_owner_id, e.prospects?.csm_owner_id].includes(cle.user_id)
      );
      return res.status(200).json(lignes.map((e) => ({
        id: e.id,
        prospect_id: e.prospect_id,
        nom: e.prospects?.name,
        entreprise: e.prospects?.company,
        evenement: e.event,
        avant: e.from_val,
        apres: e.to_val,
        date: e.created_at,
      })));
    }

    if (resource === "tasks") {
      let q = admin.from("tasks").select("id, prospect_id, type, note, due_at, done, completed_at, created_at, user_id").eq("team_id", cle.team_id);
      if (cle.scope === "own") q = q.eq("user_id", cle.user_id);
      if (event === "completed") q = q.eq("done", true).not("completed_at", "is", null);
      const tri = event === "completed" ? "completed_at" : "created_at";
      const { data } = await q.order(tri, { ascending: false }).limit(MAX_LIGNES);
      return res.status(200).json((data || []).map((t) => ({
        id: t.id, prospect_id: t.prospect_id, type: t.type, intitule: t.note,
        echeance: t.due_at, faite: t.done, faite_le: t.completed_at, creee_le: t.created_at,
      })));
    }

    if (resource === "signatures") {
      const { data } = await admin
        .from("document_signatures")
        .select("id, prospect_id, signer_email, signed_name, signed_at, status")
        .eq("team_id", cle.team_id)
        .eq("status", "signe")
        .order("signed_at", { ascending: false })
        .limit(MAX_LIGNES);
      return res.status(200).json((data || []).map((s) => ({
        id: s.id, prospect_id: s.prospect_id, signataire: s.signed_name,
        email: s.signer_email, signe_le: s.signed_at,
      })));
    }

    if (resource === "search") {
      const { by, email, company } = req.query;
      let q = filtrer(admin.from("prospects").select(CHAMPS_PROSPECT), cle);
      if (by === "email") {
        if (!email) return res.status(400).json({ error: "Paramètre email manquant" });
        q = q.ilike("email", email.trim());
      } else if (by === "company") {
        if (!company) return res.status(400).json({ error: "Paramètre company manquant" });
        q = q.ilike("company", `%${company.trim()}%`);
      } else {
        return res.status(400).json({ error: "Paramètre « by » attendu : email ou company" });
      }
      const { data } = await q.limit(20);

      // « Trouver ou créer » : le motif le plus utilisé de Zapier. Sans lui,
      // chaque formulaire branché sur Closia créerait un doublon à chaque envoi.
      if ((!data || data.length === 0) && req.query.create === "1" && by === "email") {
        const { data: cree } = await admin
          .from("prospects")
          .insert({
            user_id: cle.user_id,
            team_id: cle.team_id,
            created_via: "site",
            name: (req.query.name || email).trim(),
            company: (req.query.company || "").trim(),
            email: email.trim().toLowerCase(),
            stage: "À contacter",
            status: "attente",
            priority: 50,
            deal_value: Number(req.query.deal_value) || 0,
          })
          .select(CHAMPS_PROSPECT)
          .single();
        return res.status(200).json(cree ? [prospetSortie(cree)] : []);
      }
      return res.status(200).json((data || []).map(prospetSortie));
    }

    return res.status(400).json({ error: "Ressource inconnue" });
  }

  // ---------------------------------------------------------------- écritures
  if (req.method === "POST") {
    if (resource === "prospects") {
      const b = req.body || {};
      if (!b.name?.trim()) return res.status(400).json({ error: "Le nom est requis" });
      const { data, error } = await admin
        .from("prospects")
        .insert({
          user_id: cle.user_id,
          team_id: cle.team_id,
          created_via: "site",
          name: b.name.trim(),
          company: (b.company || "").trim(),
          email: (b.email || "").trim().toLowerCase() || null,
          phone: (b.phone || "").trim() || null,
          job_title: (b.job_title || "").trim() || null,
          stage: b.stage || "À contacter",
          status: b.status || "attente",
          priority: Number(b.priority) || 50,
          deal_value: Number(b.deal_value) || 0,
          source: b.source || null,
          notes: b.notes || null,
        })
        .select(CHAMPS_PROSPECT)
        .single();
      if (error) return res.status(400).json({ error: "La création a échoué" });
      return res.status(200).json(prospetSortie(data));
    }

    if (resource === "tasks") {
      const b = req.body || {};
      if (!b.prospect_id || !b.type) return res.status(400).json({ error: "prospect_id et type sont requis" });
      const { data: p } = await filtrer(admin.from("prospects").select("id"), cle).eq("id", b.prospect_id).maybeSingle();
      if (!p) return res.status(404).json({ error: "Prospect introuvable dans le périmètre de cette clé" });

      const { data, error } = await admin
        .from("tasks")
        .insert({
          user_id: cle.user_id, team_id: cle.team_id, prospect_id: b.prospect_id,
          type: b.type, note: b.note || null,
          due_at: b.due_at || null, priority: Number(b.priority) || 50,
        })
        .select("id, prospect_id, type, note, due_at")
        .single();
      if (error) return res.status(400).json({ error: "La création a échoué" });
      return res.status(200).json(data);
    }

    if (resource === "activities" || resource === "notes") {
      const b = req.body || {};
      const texte = resource === "notes" ? b.text : b.note;
      if (!b.prospect_id) return res.status(400).json({ error: "prospect_id est requis" });
      if (resource === "notes" && !texte?.trim()) return res.status(400).json({ error: "Le texte est requis" });

      const { data: p } = await filtrer(admin.from("prospects").select("id"), cle).eq("id", b.prospect_id).maybeSingle();
      if (!p) return res.status(404).json({ error: "Prospect introuvable dans le périmètre de cette clé" });

      const { data, error } = await admin
        .from("activities")
        .insert({
          user_id: cle.user_id, team_id: cle.team_id, prospect_id: b.prospect_id,
          type: resource === "notes" ? "note" : (b.type || "note"),
          note: texte || null,
          source: "zapier",
        })
        .select("id, prospect_id, type, note, created_at")
        .single();
      if (error) return res.status(400).json({ error: "L'enregistrement a échoué" });
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "Ressource inconnue" });
  }

  if (req.method === "PATCH" && resource === "prospects") {
    const id = req.query.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "id manquant" });
    const { data: p } = await filtrer(admin.from("prospects").select("id"), cle).eq("id", id).maybeSingle();
    if (!p) return res.status(404).json({ error: "Prospect introuvable dans le périmètre de cette clé" });

    const MODIFIABLES = ["name", "company", "email", "phone", "job_title", "stage", "status", "priority", "deal_value", "source", "notes", "industry"];
    const patch = {};
    for (const c of MODIFIABLES) if (req.body?.[c] !== undefined) patch[c] = req.body[c];
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Aucun champ à modifier" });

    const { data, error } = await admin.from("prospects").update(patch).eq("id", id).select(CHAMPS_PROSPECT).single();
    if (error) return res.status(400).json({ error: "La modification a échoué" });
    return res.status(200).json(prospetSortie(data));
  }

  res.status(405).json({ error: "Méthode non autorisée" });
}
