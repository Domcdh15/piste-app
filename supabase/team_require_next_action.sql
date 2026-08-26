-- Invariant « aucun prospect sans prochaine action ».
-- Réglage d'équipe, activé par l'administrateur, réservé aux formules Équipe et Business.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table teams
  add column if not exists require_next_action boolean not null default false;

comment on column teams.require_next_action is
  'Quand true, un prospect en cours ne peut pas être quitté sans prochaine action planifiée.';
