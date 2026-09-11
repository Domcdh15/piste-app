-- Suppression d'une fiche : aller au bout, ou le dire.
--
-- « Supprimer définitivement cette fiche et tout son historique ? » demandait
-- l'écran — et la base répondait non. Trois tables référençaient `prospects`
-- en NO ACTION : `emails_generes`, `analyses_ia` et `scripts_appel`. Dès qu'une
-- fiche avait servi à l'IA ne serait-ce qu'une fois — une relance générée, une
-- analyse d'opportunité, un script d'appel —, la suppression était refusée par
-- Postgres. Le client ignorait l'erreur : la fiche restait, l'utilisateur
-- croyait l'avoir supprimée, et la retrouvait au rechargement suivant.
--
-- Les neuf autres tables filles étaient déjà alignées sur la promesse de
-- l'écran : activités, tâches, documents, signatures, séquences et événements
-- partent avec la fiche (CASCADE) ; les tickets et les interlocuteurs
-- rattachés survivent, détachés (SET NULL), parce qu'ils ont une vie propre.
-- Les trois retardataires rejoignent le premier groupe : ce sont des artefacts
-- de la fiche, ils n'ont aucun sens sans elle.
--
-- Le quota d'IA n'est pas concerné : il est compté dans
-- `user_settings.ai_calls_used`, un compteur, et non en dénombrant ces lignes.
-- Supprimer une fiche ne rend donc pas les générations déjà consommées.

alter table emails_generes drop constraint if exists emails_generes_prospect_id_fkey;
alter table emails_generes
  add constraint emails_generes_prospect_id_fkey
  foreign key (prospect_id) references prospects(id) on delete cascade;

alter table analyses_ia drop constraint if exists analyses_ia_prospect_id_fkey;
alter table analyses_ia
  add constraint analyses_ia_prospect_id_fkey
  foreign key (prospect_id) references prospects(id) on delete cascade;

alter table scripts_appel drop constraint if exists scripts_appel_prospect_id_fkey;
alter table scripts_appel
  add constraint scripts_appel_prospect_id_fkey
  foreign key (prospect_id) references prospects(id) on delete cascade;
