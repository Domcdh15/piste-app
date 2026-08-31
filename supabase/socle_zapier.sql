-- Socle nécessaire à une intégration Zapier. Miroir de la migration.

-- 1) Horodatage de modification, posé par la base et non par le code : une
-- fiche se modifie depuis le pipeline, l'API d'équipe, un import et bientôt
-- Zapier. Seule la base voit tous les chemins.
alter table prospects add column if not exists updated_at timestamptz not null default now();
alter table tasks     add column if not exists updated_at timestamptz not null default now();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_prospects_updated_at on prospects;
create trigger trg_prospects_updated_at before update on prospects
  for each row execute function touch_updated_at();
drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function touch_updated_at();

create index if not exists prospects_updated_at_idx on prospects(updated_at desc);
create index if not exists tasks_completed_at_idx on tasks(completed_at desc) where completed_at is not null;
create index if not exists prospects_closed_at_idx on prospects(closed_at desc) where closed_at is not null;

-- 2) Journal d'événements. Un déclencheur Zapier qui rate un événement sur dix
-- est pire qu'un déclencheur absent : le client ne s'en aperçoit pas.
create table if not exists prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  from_val text,
  to_val text,
  created_at timestamptz not null default now()
);
create index if not exists prospect_events_created_idx on prospect_events(created_at desc);
create index if not exists prospect_events_team_idx on prospect_events(team_id, created_at desc);

create or replace function log_prospect_event() returns trigger
language plpgsql security definer as $$
begin
  if new.stage is distinct from old.stage then
    insert into prospect_events (prospect_id, team_id, user_id, event, from_val, to_val)
    values (new.id, new.team_id, auth.uid(), 'stage_changed', old.stage, new.stage);
  end if;
  if new.status is distinct from old.status then
    insert into prospect_events (prospect_id, team_id, user_id, event, from_val, to_val)
    values (new.id, new.team_id, auth.uid(), 'status_changed', old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prospect_events on prospects;
create trigger trg_prospect_events after update on prospects
  for each row execute function log_prospect_event();

alter table prospect_events enable row level security;
create policy "lire les événements de ses prospects" on prospect_events for select
  using (exists (
    select 1 from prospects p where p.id = prospect_events.prospect_id
      and (auth.uid() in (p.user_id, p.sales_owner_id, p.csm_owner_id)
           or (p.team_id = my_team_id() and my_team_role() = 'admin'))));

-- 3) Clés d'API. Jamais stockées en clair : une fuite de base ne livrerait que
-- des empreintes inutilisables. Seul le préfixe reste lisible.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_hash_idx on api_keys(key_hash) where revoked_at is null;
create index if not exists api_keys_team_idx on api_keys(team_id);
alter table api_keys enable row level security;
create policy "lire les clés de son équipe" on api_keys for select
  using (team_id = my_team_id() and my_team_role() = 'admin');
