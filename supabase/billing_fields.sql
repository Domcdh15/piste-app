-- Champs d'abonnement, sans intégration de paiement réelle pour l'instant.
-- Permet d'afficher un vrai statut (essai / plan / prix figé) dans Paramètres > Facturation.
alter table user_settings
  add column if not exists plan_price numeric not null default 39,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_status text not null default 'trialing';

alter table user_settings drop constraint if exists user_settings_subscription_status_check;
alter table user_settings add constraint user_settings_subscription_status_check
  check (subscription_status in ('trialing', 'active', 'canceled'));
