-- Le mode absence répondait à tout le monde.
--
-- Le passage quotidien lisait les vingt derniers messages reçus et envoyait
-- une réponse à CHAQUE nouvel expéditeur, sans distinction : newsletters,
-- notifications automatiques, relances de facture, spams, courrier personnel.
-- Or cette réponse diffuse le message d'absence, la date de retour, et le nom
-- et l'adresse du contact de secours — à des gens qui n'ont rien demandé.
-- Répondre à un spam confirme en prime que l'adresse est lue, et répondre à
-- une liste de diffusion renvoie parfois le message à tous ses abonnés.
--
-- Le tri du courrier automatique (en-têtes List-Id, List-Unsubscribe,
-- Precedence, Auto-Submitted, et les boîtes no-reply) est appliqué sans
-- condition : ce n'est pas une préférence, c'est ce que fait le répondeur de
-- Gmail lui-même.
--
-- Ne répondre qu'aux personnes du fichier client, en revanche, est un choix :
-- un prospect qui écrit pendant les vacances mérite souvent une réponse, même
-- s'il n'a pas encore de fiche. L'option est donc décochée par défaut.

alter table user_settings
  add column if not exists vacation_only_known_contacts boolean not null default false;

comment on column user_settings.vacation_only_known_contacts is
  'true = la réponse d''absence n''est envoyée qu''aux expéditeurs ayant une fiche. Le tri du courrier automatique, lui, s''applique dans tous les cas.';
