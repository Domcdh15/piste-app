-- À quelle heure une tâche manquée revient : à la sienne, ou à une heure fixe.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table user_settings
  add column if not exists reschedule_mode text not null default 'same_time';

alter table user_settings
  add column if not exists reschedule_time text not null default '08:00';

do $$ begin
  alter table user_settings add constraint user_settings_reschedule_mode_check
    check (reschedule_mode in ('same_time', 'fixed'));
exception when duplicate_object then null; end $$;

comment on column user_settings.reschedule_mode is
  'same_time = la tâche garde son heure d''origine · fixed = elle revient à reschedule_time.';
