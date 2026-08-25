-- Identité légale de l'émetteur, nécessaire pour produire un devis valable en France.
alter table user_settings add column if not exists billing_address text;
alter table user_settings add column if not exists billing_postal_code text;
alter table user_settings add column if not exists billing_city text;
alter table user_settings add column if not exists billing_country text default 'France';
alter table user_settings add column if not exists siret text;
alter table user_settings add column if not exists vat_number text;
alter table user_settings add column if not exists vat_rate numeric default 20;
-- Micro-entreprises : mention "TVA non applicable, art. 293 B du CGI"
alter table user_settings add column if not exists vat_exempt boolean default false;
alter table user_settings add column if not exists devis_validity_days integer default 30;
alter table user_settings add column if not exists devis_payment_terms text;
alter table user_settings add column if not exists devis_counter integer default 0;

-- Coordonnées du destinataire, à faire figurer sur le devis.
alter table prospects add column if not exists billing_address text;
alter table prospects add column if not exists billing_postal_code text;
alter table prospects add column if not exists billing_city text;
