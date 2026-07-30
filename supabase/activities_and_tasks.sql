-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

-- Log d'activité (appels, issues de deal) — sert au reporting dans "Activités".
-- Le champ "source" garde la porte ouverte à une future synchro externe
-- (Aircall, CRM tiers...) sans changer le modèle : source='manual' aujourd'hui,
-- source='aircall' / 'external_crm' plus tard, même table.
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  prospect_id uuid references prospects(id) on delete cascade not null,
  type text not null check (type in ('appel_abouti', 'appel_manque', 'deal_gagne', 'deal_perdu')),
  note text,
  source text not null default 'manual',
  created_at timestamptz default now()
);

alter table activities enable row level security;

create policy "select own activities" on activities for select using (auth.uid() = user_id);
create policy "insert own activities" on activities for insert with check (auth.uid() = user_id);
create policy "delete own activities" on activities for delete using (auth.uid() = user_id);

-- Tâches de relance (appeler / emailer), avec échéance et statut fait/pas fait.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  prospect_id uuid references prospects(id) on delete cascade not null,
  type text not null check (type in ('appeler', 'email')),
  note text,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "select own tasks" on tasks for select using (auth.uid() = user_id);
create policy "insert own tasks" on tasks for insert with check (auth.uid() = user_id);
create policy "update own tasks" on tasks for update using (auth.uid() = user_id);
create policy "delete own tasks" on tasks for delete using (auth.uid() = user_id);

-- Date de clôture (Gagné / Perdu), pour le reporting et l'historique.
alter table prospects add column if not exists closed_at timestamptz;
