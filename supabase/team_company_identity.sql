-- L'identité de facturation appartient à l'entreprise, pas à chaque salarié :
-- l'admin la renseigne une fois, toute l'équipe l'utilise sur ses devis.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table teams add column if not exists company_name text;
alter table teams add column if not exists billing_address text;
alter table teams add column if not exists billing_postal_code text;
alter table teams add column if not exists billing_city text;
alter table teams add column if not exists siret text;
alter table teams add column if not exists vat_exempt boolean;
alter table teams add column if not exists vat_number text;
alter table teams add column if not exists vat_rate numeric;
alter table teams add column if not exists devis_validity_days integer;
alter table teams add column if not exists devis_payment_terms text;

-- Reprise : l'équipe hérite de ce que son administrateur avait déjà saisi.
update teams t set
  company_name        = coalesce(t.company_name, us.company_name),
  billing_address     = coalesce(t.billing_address, us.billing_address),
  billing_postal_code = coalesce(t.billing_postal_code, us.billing_postal_code),
  billing_city        = coalesce(t.billing_city, us.billing_city),
  siret               = coalesce(t.siret, us.siret),
  vat_exempt          = coalesce(t.vat_exempt, us.vat_exempt),
  vat_number          = coalesce(t.vat_number, us.vat_number),
  vat_rate            = coalesce(t.vat_rate, us.vat_rate),
  devis_validity_days = coalesce(t.devis_validity_days, us.devis_validity_days),
  devis_payment_terms = coalesce(t.devis_payment_terms, us.devis_payment_terms)
from team_members tm
join user_settings us on us.user_id = tm.user_id
where tm.team_id = t.id and tm.role = 'admin';
