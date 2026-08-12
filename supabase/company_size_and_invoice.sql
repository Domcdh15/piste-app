-- Champs affichés/éditables dans la fiche client du back office :
-- taille d'entreprise auto-déclarée, et suivi manuel de facturation
-- (pas de système de facturation automatisé, juste un suivi côté admin).
alter table user_settings add column if not exists company_size text;
alter table user_settings add column if not exists invoice_status text not null default 'none';
alter table user_settings add column if not exists invoice_amount numeric;
alter table user_settings add column if not exists invoice_note text;
