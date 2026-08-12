-- Demandes d'abonnement soumises depuis la page /subscribe.html du site vitrine.
-- Insertion publique autorisée (formulaire anonyme), lecture réservée aux comptes authentifiés
-- (back office), même pattern que la table leads.
create table if not exists subscription_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan text not null,
  seats int not null default 1,
  company_name text not null,
  billing_siret_or_vat text,
  billing_address text not null,
  billing_postal_code text not null,
  billing_city text not null,
  billing_country text not null default 'France',
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  payment_method text,
  message text,
  status text not null default 'pending'
);

alter table subscription_requests enable row level security;

drop policy if exists "anyone can submit a subscription request" on subscription_requests;
create policy "anyone can submit a subscription request" on subscription_requests for insert with check (true);

drop policy if exists "authenticated users can read subscription requests" on subscription_requests;
create policy "authenticated users can read subscription requests" on subscription_requests for select using (auth.role() = 'authenticated');
