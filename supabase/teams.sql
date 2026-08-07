-- Équipes multi-utilisateurs avec rôles (admin / sales / customer_success).
-- Idempotent : peut être exécuté plusieurs fois sans risque.
-- Ajoute team_id (partage d'équipe) et sales_owner_id/csm_owner_id (attribution
-- nominative par prospect) en plus de user_id (qui reste "créateur de la fiche").

-- ============================================================
-- 1) TEAMS / TEAM_MEMBERS
-- ============================================================
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon équipe',
  has_multiple_sales boolean not null default false,
  has_multiple_csm boolean not null default false,
  created_at timestamptz not null default now()
);

do $$ begin
  create type team_role as enum ('admin', 'sales', 'customer_success');
exception when duplicate_object then null;
end $$;

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role team_role not null default 'sales',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists team_members_user_id_idx on team_members(user_id);
create index if not exists team_members_team_id_idx on team_members(team_id);

-- ============================================================
-- 2) COLONNES SUR LES TABLES EXISTANTES
-- ============================================================
alter table prospects add column if not exists team_id uuid references teams(id) on delete cascade;
alter table prospects add column if not exists pool text not null default 'sales' check (pool in ('sales', 'customer_success'));
alter table prospects add column if not exists sales_owner_id uuid references auth.users(id);
alter table prospects add column if not exists csm_owner_id uuid references auth.users(id);

alter table tasks add column if not exists team_id uuid references teams(id) on delete cascade;
alter table activities add column if not exists team_id uuid references teams(id) on delete cascade;
alter table emails_generes add column if not exists team_id uuid references teams(id) on delete cascade;
alter table scripts_appel add column if not exists team_id uuid references teams(id) on delete cascade;
alter table analyses_ia add column if not exists team_id uuid references teams(id) on delete cascade;

-- ============================================================
-- 3) BACKFILL — un compte solo existant devient une équipe de 1 (rôle admin)
-- ============================================================
insert into teams (id, name)
select gen_random_uuid(), coalesce(nullif(us.company_name, ''), 'Mon équipe')
from user_settings us
where not exists (select 1 from team_members tm where tm.user_id = us.user_id);

-- Rattache chaque user_id sans équipe à sa propre équipe nouvellement créée.
-- (jointure par ordre de création : chaque user_settings sans membership obtient
-- une des équipes créées ci-dessus, une par une, via une CTE numérotée)
with missing as (
  select us.user_id, row_number() over (order by us.user_id) as rn
  from user_settings us
  where not exists (select 1 from team_members tm where tm.user_id = us.user_id)
),
fresh_teams as (
  select t.id, row_number() over (order by t.created_at) as rn
  from teams t
  where not exists (select 1 from team_members tm where tm.team_id = t.id)
)
insert into team_members (team_id, user_id, role)
select ft.id, m.user_id, 'admin'
from missing m
join fresh_teams ft on ft.rn = m.rn;

-- Backfill team_id sur toutes les tables de contenu, à partir du membership.
update prospects set team_id = tm.team_id from team_members tm where prospects.user_id = tm.user_id and prospects.team_id is null;
update tasks set team_id = tm.team_id from team_members tm where tasks.user_id = tm.user_id and tasks.team_id is null;
update activities set team_id = tm.team_id from team_members tm where activities.user_id = tm.user_id and activities.team_id is null;
update emails_generes set team_id = tm.team_id from team_members tm where emails_generes.user_id = tm.user_id and emails_generes.team_id is null;
update scripts_appel set team_id = tm.team_id from team_members tm where scripts_appel.user_id = tm.user_id and scripts_appel.team_id is null;
update analyses_ia set team_id = tm.team_id from team_members tm where analyses_ia.user_id = tm.user_id and analyses_ia.team_id is null;

-- Attribution nominative par défaut : le créateur devient le commercial responsable.
update prospects set sales_owner_id = user_id where sales_owner_id is null;

-- ============================================================
-- 4) FONCTIONS SECURITY DEFINER (évite la récursion RLS)
-- ============================================================
create or replace function my_team_id()
returns uuid
language sql
security definer
stable
as $$
  select team_id from team_members where user_id = auth.uid() limit 1;
$$;

create or replace function my_team_role()
returns team_role
language sql
security definer
stable
as $$
  select role from team_members where user_id = auth.uid() limit 1;
$$;

create or replace function team_stats_for_me()
returns table(deals_won bigint, deals_lost bigint, revenue_won numeric, prospect_count bigint)
language sql
security definer
stable
as $$
  select
    count(*) filter (where status = 'gagne'),
    count(*) filter (where status = 'perdu'),
    sum(deal_value) filter (where status = 'gagne'),
    count(*)
  from prospects
  where team_id = my_team_id()
$$;

-- ============================================================
-- 5) RLS — TEAMS / TEAM_MEMBERS (lecture seule côté client)
-- ============================================================
alter table teams enable row level security;
drop policy if exists "select my team" on teams;
create policy "select my team" on teams for select using (id = my_team_id());
-- aucune policy d'écriture cliente : les mutations passent par api/team.js (service role)

alter table team_members enable row level security;
drop policy if exists "select team members" on team_members;
create policy "select team members" on team_members for select using (team_id = my_team_id());
-- idem, aucune policy d'écriture cliente

-- ============================================================
-- 6) RLS — PROSPECTS (remplace les policies user_id-only précédentes)
-- ============================================================
drop policy if exists "select own prospects" on prospects;
drop policy if exists "select prospects" on prospects;
create policy "select prospects" on prospects for select using (
  auth.uid() in (user_id, sales_owner_id, csm_owner_id)
  or (team_id = my_team_id() and my_team_role() = 'admin')
);

drop policy if exists "insert own prospects" on prospects;
create policy "insert own prospects" on prospects for insert with check (
  auth.uid() = user_id and (team_id = my_team_id() or team_id is null)
);

drop policy if exists "update own prospects" on prospects;
drop policy if exists "update assigned prospects" on prospects;
create policy "update assigned prospects" on prospects for update using (
  auth.uid() in (user_id, sales_owner_id, csm_owner_id)
);

drop policy if exists "delete own prospects" on prospects;
create policy "delete own prospects" on prospects for delete using (auth.uid() = user_id);

-- ============================================================
-- 7) RLS — TASKS / ACTIVITIES (owner-ou-admin-équipe en lecture, owner en écriture)
-- ============================================================
drop policy if exists "select own tasks" on tasks;
create policy "select tasks" on tasks for select using (
  auth.uid() = user_id or (team_id = my_team_id() and my_team_role() = 'admin')
);
drop policy if exists "insert own tasks" on tasks;
create policy "insert own tasks" on tasks for insert with check (
  auth.uid() = user_id and (team_id = my_team_id() or team_id is null)
);
drop policy if exists "update own tasks" on tasks;
create policy "update own tasks" on tasks for update using (auth.uid() = user_id);
drop policy if exists "delete own tasks" on tasks;
create policy "delete own tasks" on tasks for delete using (auth.uid() = user_id);

drop policy if exists "select own activities" on activities;
create policy "select activities" on activities for select using (
  auth.uid() = user_id or (team_id = my_team_id() and my_team_role() = 'admin')
);
drop policy if exists "insert own activities" on activities;
create policy "insert own activities" on activities for insert with check (
  auth.uid() = user_id and (team_id = my_team_id() or team_id is null)
);
drop policy if exists "delete own activities" on activities;
create policy "delete own activities" on activities for delete using (auth.uid() = user_id);

-- ============================================================
-- 8) Vérification — ne devrait rien retourner
-- ============================================================
select 'prospects' as table_name, count(*) from prospects where team_id is null
union all
select 'tasks', count(*) from tasks where team_id is null
union all
select 'activities', count(*) from activities where team_id is null
having count(*) > 0;
