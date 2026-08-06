import { getUserFromToken, bearerToken, supabaseAdmin, isAdminUser, applyAdminCors } from "../_lib/supabase.js";

const EDITABLE_TABLES = ["prospects", "tasks", "activities", "user_settings"];

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const user = await getUserFromToken(bearerToken(req));
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const admin = supabaseAdmin();
  const { table, id, patch, deleteRow } = req.body || {};

  if (table) {
    if (!EDITABLE_TABLES.includes(table)) {
      return res.status(400).json({ error: "Table non autorisée" });
    }
    if (!id) return res.status(400).json({ error: "id manquant" });
    const key = table === "user_settings" ? "user_id" : "id";

    if (deleteRow) {
      const { error } = await admin.from(table).delete().eq(key, id);
      if (error) return res.status(500).json({ error: "La suppression a échoué" });
      return res.status(200).json({ ok: true });
    }

    if (!patch || typeof patch !== "object") {
      return res.status(400).json({ error: "patch manquant" });
    }
    const { error } = await admin.from(table).update(patch).eq(key, id);
    if (error) return res.status(500).json({ error: "La mise à jour a échoué" });
    return res.status(200).json({ ok: true });
  }

  const { contacted } = req.body || {};
  if (!id || typeof contacted !== "boolean") {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  const { error } = await admin
    .from("leads")
    .update({ contacted, contacted_at: contacted ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return res.status(500).json({ error: "La mise à jour a échoué" });
  res.status(200).json({ ok: true });
}
