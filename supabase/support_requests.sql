-- Messages envoyés depuis "Paramètres > Support" dans le CRM.
-- Insertion et lecture restreintes à l'auteur (auth.uid() = user_id) côté client ;
-- le back office y accède via la service role (bypass RLS), pas via ces policies.
create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  message text not null,
  status text not null default 'open',
  resolved_at timestamptz
);

alter table support_requests enable row level security;

drop policy if exists "users can submit their own support requests" on support_requests;
create policy "users can submit their own support requests" on support_requests for insert with check (auth.uid() = user_id);

drop policy if exists "users can read their own support requests" on support_requests;
create policy "users can read their own support requests" on support_requests for select using (auth.uid() = user_id);

-- Fil de conversation (ticket) : chaque entrée { from: 'client'|'admin', body, at }.
-- Le premier message reprend la valeur de `message` pour compat avec les lignes déjà créées.
alter table support_requests add column if not exists messages jsonb not null default '[]'::jsonb;

update support_requests
set messages = jsonb_build_array(jsonb_build_object('from', 'client', 'body', message, 'at', created_at))
where messages = '[]'::jsonb;

-- L'utilisateur peut ajouter ses propres messages au fil (le back office répond via update-lead.js, service role).
drop policy if exists "users can update their own support requests" on support_requests;
create policy "users can update their own support requests" on support_requests for update using (auth.uid() = user_id);
