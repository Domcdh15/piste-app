-- Ajoute rdv_physique et appel_visio comme types d'activité valides,
-- pour que le sélecteur de type d'action sur la fiche prospect couvre
-- les mêmes types que les tâches. Idempotent.

alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type = any (array['appel_abouti','appel_manque','rdv_physique','appel_visio','message_linkedin','deal_gagne','deal_perdu','note','reassignation']));
