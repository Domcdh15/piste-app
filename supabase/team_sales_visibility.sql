-- Visibilité des résultats d'équipe pour les commerciaux, choisie par l'admin.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table teams
  add column if not exists sales_visibility text not null default 'team_aggregate';

do $$ begin
  alter table teams add constraint teams_sales_visibility_check
    check (sales_visibility in ('own', 'team_aggregate', 'team_detail'));
exception when duplicate_object then null; end $$;

comment on column teams.sales_visibility is
  'own = chacun ses chiffres · team_aggregate = totaux consolidés · team_detail = détail nominatif par commercial.';

create or replace function my_team_visibility() returns text
language sql security definer stable as $$
  select coalesce(t.sales_visibility, 'team_aggregate') from teams t where t.id = my_team_id();
$$;

-- Les totaux d'équipe disparaissent complètement au niveau « own » :
-- zéro ligne renvoyée plutôt qu'une ligne de zéros, sinon l'interface
-- afficherait un bandeau vide au lieu de ne rien afficher.
create or replace function team_stats_for_me()
returns table(deals_won bigint, deals_lost bigint, revenue_won numeric, prospect_count bigint)
language sql security definer stable as $$
  select s.deals_won, s.deals_lost, s.revenue_won, s.prospect_count
  from (
    select
      count(*) filter (where status = 'gagne') as deals_won,
      count(*) filter (where status = 'perdu') as deals_lost,
      sum(deal_value) filter (where status = 'gagne') as revenue_won,
      count(*) as prospect_count
    from prospects
    where team_id = my_team_id()
  ) s
  where my_team_role() = 'admin' or my_team_visibility() <> 'own';
$$;

-- Détail nominatif : l'admin y a toujours droit, un commercial seulement
-- si l'admin a ouvert ce niveau.
create or replace function team_stats_by_member()
returns table(member_id uuid, deals_won bigint, deals_lost bigint, revenue_won numeric, prospect_count bigint)
language sql security definer stable as $$
  select
    p.sales_owner_id,
    count(*) filter (where p.status = 'gagne'),
    count(*) filter (where p.status = 'perdu'),
    coalesce(sum(p.deal_value) filter (where p.status = 'gagne'), 0),
    count(*)
  from prospects p
  where p.team_id = my_team_id()
    and p.sales_owner_id is not null
    and (my_team_role() = 'admin' or my_team_visibility() = 'team_detail')
  group by p.sales_owner_id;
$$;
