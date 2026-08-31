-- Fonctions de pilotage réservées à la formule Business. Miroir de la migration.

-- Formule déduite du prix payé — même règle que planTierFor côté serveur.
create or replace function my_team_is_business() returns boolean
language sql security definer stable as $$
  select coalesce((select t.plan_price from teams t where t.id = my_team_id()), 19) > 69;
$$;

-- Le classement nominatif devient une fonction de pilotage : Équipe garde les
-- totaux consolidés, Business voit qui fait quoi, et son objectif.
drop function if exists team_stats_by_member();
create function team_stats_by_member()
returns table(member_id uuid, deals_won bigint, deals_lost bigint, revenue_won numeric,
              prospect_count bigint, csm_count bigint, objective_revenue numeric, objective_deals integer)
language sql security definer stable as $$
  select m.user_id,
    count(*) filter (where p.sales_owner_id = m.user_id and p.status = 'gagne'),
    count(*) filter (where p.sales_owner_id = m.user_id and p.status = 'perdu'),
    coalesce(sum(p.deal_value) filter (where p.sales_owner_id = m.user_id and p.status = 'gagne'), 0),
    count(*) filter (where p.sales_owner_id = m.user_id),
    count(*) filter (where p.csm_owner_id = m.user_id),
    max(s.objective_monthly_revenue), max(s.objective_monthly_deals)
  from team_members m
  left join prospects p on p.team_id = m.team_id
   and (p.sales_owner_id = m.user_id or p.csm_owner_id = m.user_id)
  left join user_settings s on s.user_id = m.user_id
  where m.team_id = my_team_id() and my_team_is_business()
    and (my_team_role() = 'admin' or my_team_visibility() = 'team_detail')
  group by m.user_id;
$$;

-- Journal d'équipe. Distinct de admin_audit_log, qui trace les actions de
-- l'éditeur sur les comptes clients : celui-ci trace ce que les membres d'une
-- équipe font entre eux, et n'est lisible que par leur administrateur.
create table if not exists team_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists team_audit_log_team_idx on team_audit_log(team_id, created_at desc);
alter table team_audit_log enable row level security;
create policy "lire le journal de son équipe" on team_audit_log for select
  using (team_id = my_team_id() and my_team_role() = 'admin' and my_team_is_business());
