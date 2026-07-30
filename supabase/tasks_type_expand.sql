-- Élargit les types de tâches : appel téléphonique / appel visio / RDV physique / relance mail
alter table tasks drop constraint if exists tasks_type_check;

update tasks set type = 'appel_telephone' where type = 'appeler';
update tasks set type = 'relance_email' where type = 'email';

alter table tasks add constraint tasks_type_check
  check (type in ('appel_telephone', 'appel_visio', 'rdv_physique', 'relance_email'));
