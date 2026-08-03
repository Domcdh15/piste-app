-- Suivi manuel des leads depuis le back office
alter table leads add column if not exists contacted boolean not null default false;
alter table leads add column if not exists contacted_at timestamptz;

-- Le back office lit les leads via le service role (API /api/admin/*, réservée à
-- l'administratrice) : plus besoin que n'importe quel compte client authentifié
-- puisse lire cette table directement.
drop policy if exists "authenticated users can read leads" on leads;
