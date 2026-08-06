import { supabaseAdmin } from "../_lib/supabase.js";

const SEED_SECRET = "closia-seed-9f3a7d21";

export default async function handler(req, res) {
  if (req.query.secret !== SEED_SECRET) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const admin = supabaseAdmin();
  const email = "client.test@closia.fr";
  const password = "ClosiaTest2026!";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: "Client",
      last_name: "Test",
      company_name: "Menuiserie Dupont",
      industry: "Artisanat / BTP",
    },
  });
  if (createError) return res.status(500).json({ error: createError.message });

  const userId = created.user.id;
  const { error: settingsError } = await admin.from("user_settings").upsert({
    user_id: userId,
    plan_price: 39,
    trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    subscription_status: "active",
    first_name: "Client",
    last_name: "Test",
    company_name: "Menuiserie Dupont",
    industry: "Artisanat / BTP",
    sig_name: "Client Test",
    sig_company: "Menuiserie Dupont",
  });
  if (settingsError) return res.status(500).json({ error: settingsError.message });

  res.status(200).json({ ok: true, email, password, userId });
}
