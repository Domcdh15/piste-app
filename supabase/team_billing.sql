-- Tarification globale par équipe (au lieu d'un prix par utilisateur individuel),
-- pour les comptes à plusieurs membres. Idempotent.

alter table teams add column if not exists plan_price numeric;
alter table teams add column if not exists trial_ends_at timestamptz;
alter table teams add column if not exists subscription_status text not null default 'trialing' check (subscription_status in ('trialing', 'active', 'cancelled'));

-- Note : les comptes à un seul membre continuent d'utiliser le prix stocké sur
-- user_settings (comportement existant, inchangé). Le prix d'équipe ci-dessus
-- ne s'applique que lorsque l'équipe compte 2 membres ou plus — voir la logique
-- côté front dans Settings.jsx (BillingPanel).
