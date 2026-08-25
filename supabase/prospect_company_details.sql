-- Informations d'entreprise affichées sur la fiche client.
-- (la colonne notes existe déjà et sert au bloc Notes)
alter table prospects add column if not exists website text;
alter table prospects add column if not exists industry text;
alter table prospects add column if not exists company_size text;
alter table prospects add column if not exists siret text;
alter table prospects add column if not exists source text;
