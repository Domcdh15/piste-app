-- À quelle heure une tâche manquée revient : à la sienne, ou à une heure fixe.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table user_settings
  add column if not exists reschedule_mode text not null default 'fixed';

alter table user_settings
  add column if not exists reschedule_time text not null default '08:00';

do $$ begin
  alter table user_settings add constraint user_settings_reschedule_mode_check
    check (reschedule_mode in ('same_time', 'fixed'));
exception when duplicate_object then null; end $$;

comment on column user_settings.reschedule_mode is
  'same_time = la tâche garde son heure d''origine · fixed = elle revient à reschedule_time.';

-- Par défaut, une tâche oubliée revient à un créneau choisi plutôt qu'à son
-- heure d'origine, qui risquait de tomber sur un rendez-vous pris entre-temps.
alter table user_settings alter column reschedule_mode set default 'fixed';
