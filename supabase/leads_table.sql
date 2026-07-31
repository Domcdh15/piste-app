-- Table pour les demandes de démo/contact venant du site vitrine.
-- Insertion publique autorisée (formulaire anonyme), lecture réservée à toi.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  message text,
  created_at timestamptz not null default now()
);

alter table leads enable row level security;

drop policy if exists "anyone can submit a lead" on leads;
create policy "anyone can submit a lead" on leads for insert with check (true);

drop policy if exists "authenticated users can read leads" on leads;
create policy "authenticated users can read leads" on leads for select using (auth.role() = 'authenticated');
