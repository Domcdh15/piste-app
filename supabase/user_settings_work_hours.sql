-- Bornes de la journée de travail, sur lesquelles l'Agenda se concentre.
-- Distinct de default_task_time / default_task_time_end, qui ne servent qu'à
-- placer une tâche créée sans horaire.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table user_settings
  add column if not exists work_start text not null default '08:00';

alter table user_settings
  add column if not exists work_end text not null default '19:00';

comment on column user_settings.work_start is 'Début de journée affiché dans l''Agenda, format HH:MM.';
comment on column user_settings.work_end is 'Fin de journée affichée dans l''Agenda, format HH:MM.';
