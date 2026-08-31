-- Recharges de générations IA. Miroir de la migration.
--
-- Quelqu'un qui épuise son quota est le meilleur client, pas un problème à
-- sanctionner. Le renvoyer vers une formule supérieure pour un mois chargé n'a
-- aucun sens : on lui vend la capacité dont il a besoin, quand il en a besoin.
alter table user_settings add column if not exists ai_extra_credits integer not null default 0;

comment on column user_settings.ai_extra_credits is
  'Générations achetées en plus du quota du forfait. Remises à zéro en même
   temps que ai_calls_used, à la date ai_calls_reset_at.';

create table if not exists ai_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  credits integer not null check (credits > 0),
  amount_eur numeric,
  granted_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_grants_user_idx on ai_credit_grants(user_id, created_at desc);
alter table ai_credit_grants enable row level security;
create policy "lire ses recharges" on ai_credit_grants for select
  using (auth.uid() = user_id or (team_id is not null and team_id = my_team_id() and my_team_role() = 'admin'));
