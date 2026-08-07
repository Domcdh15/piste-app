-- Permet à un commercial ou CSM assigné à un prospect de voir tout
-- l'historique (tâches, activités) lié à ce prospect, pas seulement ce
-- qu'il a lui-même créé — nécessaire pour un vrai suivi de la fiche
-- client une fois qu'on a des attributions nominatives (sales_owner_id /
-- csm_owner_id). Idempotent.

alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type = any (array['appel_abouti','appel_manque','message_linkedin','deal_gagne','deal_perdu','note','reassignation']));

drop policy if exists "select tasks" on tasks;
create policy "select tasks" on tasks for select using (
  auth.uid() = user_id
  or exists (select 1 from prospects p where p.id = tasks.prospect_id and auth.uid() in (p.user_id, p.sales_owner_id, p.csm_owner_id))
  or (team_id = my_team_id() and my_team_role() = 'admin')
);

drop policy if exists "select activities" on activities;
create policy "select activities" on activities for select using (
  auth.uid() = user_id
  or exists (select 1 from prospects p where p.id = activities.prospect_id and auth.uid() in (p.user_id, p.sales_owner_id, p.csm_owner_id))
  or (team_id = my_team_id() and my_team_role() = 'admin')
);
