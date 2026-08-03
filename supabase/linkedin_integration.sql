-- Ajoute le suivi LinkedIn : URL de profil sur les prospects,
-- et un nouveau type d'activité "message_linkedin" pour logger le suivi.

alter table prospects add column if not exists linkedin_url text;

alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('appel_abouti', 'appel_manque', 'message_linkedin', 'deal_gagne', 'deal_perdu', 'note'));
