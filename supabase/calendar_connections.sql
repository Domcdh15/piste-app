-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('google', 'microsoft')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  unique (user_id, provider)
);

alter table calendar_connections enable row level security;

create policy "select own calendar connections"
  on calendar_connections for select
  using (auth.uid() = user_id);

create policy "insert own calendar connections"
  on calendar_connections for insert
  with check (auth.uid() = user_id);

create policy "update own calendar connections"
  on calendar_connections for update
  using (auth.uid() = user_id);

create policy "delete own calendar connections"
  on calendar_connections for delete
  using (auth.uid() = user_id);

-- Note : les fonctions serverless (api/calendar/*, api/google/*, api/microsoft/*)
-- utilisent la clé "service_role" (SUPABASE_SERVICE_ROLE_KEY) côté serveur, qui
-- contourne la RLS ci-dessus par design — ces policies protègent l'accès direct
-- depuis le frontend (clé anon), qui ne doit jamais lire cette table.
