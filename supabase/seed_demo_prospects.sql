-- Jeu de données de démo : 20 prospects variés + activités déjà réalisées.
-- Rattache tout à ton compte via ton email (adapte si besoin).
-- À exécuter dans Supabase → SQL Editor.

with u as (
  select id from auth.users where email = 'domitille.croizier@gmail.com'
)
insert into prospects (id, user_id, civility, name, company, job_title, email, phone, stage, status, priority, deal_value, last_contact_at, next_contact_at, created_at, closed_at)
select v.id, u.id, v.civility, v.name, v.company, v.job_title, v.email, v.phone, v.stage, v.status, v.priority, v.deal_value,
  case when v.last_contact_days is null then null else now() - (v.last_contact_days || ' days')::interval end,
  case when v.next_contact_days is null then null else now() + (v.next_contact_days || ' days')::interval end,
  now() - (v.created_days || ' days')::interval,
  case when v.closed_days is null then null else now() - (v.closed_days || ' days')::interval end
from u, (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'Monsieur', 'Jean Dupont', 'Boulangerie Dupont', 'Gérant', 'jean.dupont@boulangerie-dupont.fr', '0612345601', 'À contacter', 'appeler', 50, 800, null::int, null::int, 2, null::int),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'Madame', 'Marie Lefevre', 'Cabinet Lefevre Avocats', 'Associée', 'marie.lefevre@lefevre-avocats.fr', '0612345602', 'Contact établi', 'relancer', 50, 3500, 4, 2, 10, null),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'Monsieur', 'Ahmed Benali', 'Benali BTP', 'Fondateur', 'a.benali@benali-btp.fr', '0612345603', 'Rendez-vous prévu', 'attente', 75, 12000, 2, 1, 15, null),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'Madame', 'Sophie Girard', 'Girard Coiffure', 'Gérante', 'sophie.girard@girard-coiffure.fr', '0612345604', 'Proposition envoyée', 'relancer', 75, 1500, 3, 5, 20, null),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'Monsieur', 'Thomas Muller', 'TechNova Solutions', 'CTO', 'thomas.muller@technova.io', '0612345605', 'Négociation', 'appeler', 100, 24000, 1, 3, 25, null),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'Madame', 'Camille Rousseau', 'Rousseau Immobilier', 'Directrice commerciale', 'camille.rousseau@rousseau-immo.fr', '0612345606', 'Gagné', 'attente', 100, 18000, 5, null, 40, 3),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'Monsieur', 'Nicolas Petit', 'Petit Automobiles', 'Gérant', 'nicolas.petit@petit-auto.fr', '0612345607', 'Perdu', 'attente', 25, 6000, 12, null, 35, 8),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'Madame', 'Julie Fontaine', 'Fontaine Traiteur', 'Fondatrice', 'julie.fontaine@fontaine-traiteur.fr', '0612345608', 'À contacter', 'attente', 25, 2200, null, null, 1, null),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'Monsieur', 'Marc Dubois', 'Dubois Transport', 'Directeur d''exploitation', 'marc.dubois@dubois-transport.fr', '0612345609', 'Contact établi', 'appeler', 50, 9500, 6, 1, 12, null),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'Madame', 'Isabelle Moreau', 'Moreau Santé', 'Pharmacienne titulaire', 'isabelle.moreau@moreau-sante.fr', '0612345610', 'Rendez-vous prévu', 'attente', 75, 5400, 2, 2, 18, null),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'Monsieur', 'Karim Cherif', 'Cherif Informatique', 'Responsable achats', 'karim.cherif@cherif-info.fr', '0612345611', 'Proposition envoyée', 'relancer', 50, 7800, 4, 4, 22, null),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'Madame', 'Laurence Simon', 'École Simon', 'Directrice', 'laurence.simon@ecole-simon.fr', '0612345612', 'Négociation', 'attente', 75, 15000, 3, 6, 28, null),
  ('10000000-0000-0000-0000-000000000013'::uuid, 'Monsieur', 'Pierre Lambert', 'Lambert Finance', 'Directeur associé', 'pierre.lambert@lambert-finance.fr', '0612345613', 'À contacter', 'retard', 50, 4200, 20, null, 21, null),
  ('10000000-0000-0000-0000-000000000014'::uuid, 'Madame', 'Nathalie Blanc', 'Blanc Architecture', 'Architecte associée', 'nathalie.blanc@blanc-archi.fr', '0612345614', 'Contact établi', 'appeler', 50, 11000, 5, 1, 14, null),
  ('10000000-0000-0000-0000-000000000015'::uuid, 'Monsieur', 'David Faure', 'Faure Sport', 'Gérant', 'david.faure@faure-sport.fr', '0612345615', 'Rendez-vous prévu', 'attente', 25, 1800, 1, 3, 9, null),
  ('10000000-0000-0000-0000-000000000016'::uuid, 'Madame', 'Amandine Roche', 'Roche Beauté', 'Fondatrice', 'amandine.roche@roche-beaute.fr', '0612345616', 'Proposition envoyée', 'relancer', 75, 3200, 2, 2, 17, null),
  ('10000000-0000-0000-0000-000000000017'::uuid, 'Monsieur', 'Julien Mercier', 'Mercier Vins', 'Gérant', 'julien.mercier@mercier-vins.fr', '0612345617', 'Négociation', 'appeler', 100, 9800, 1, 2, 24, null),
  ('10000000-0000-0000-0000-000000000018'::uuid, 'Madame', 'Céline Bertrand', 'Bertrand RH', 'Consultante senior', 'celine.bertrand@bertrand-rh.fr', '0612345618', 'Gagné', 'attente', 100, 6600, 7, null, 45, 5),
  ('10000000-0000-0000-0000-000000000019'::uuid, 'Monsieur', 'Antoine Girard', 'Girard Menuiserie', 'Artisan', 'antoine.girard@girard-menuiserie.fr', '0612345619', 'Perdu', 'attente', 25, 2900, 15, null, 30, 10),
  ('10000000-0000-0000-0000-000000000020'::uuid, '-', 'Émilie Rousset', 'Rousset Marketing', 'Directrice associée', 'emilie.rousset@rousset-marketing.fr', '0612345620', 'À contacter', 'retard', 50, 5000, 25, null, 26, null)
) as v(id, civility, name, company, job_title, email, phone, stage, status, priority, deal_value, last_contact_days, next_contact_days, created_days, closed_days);

-- Activités déjà réalisées (appels, notes, issues de deal)
insert into activities (user_id, prospect_id, type, note, source, created_at)
select (select id from auth.users where email = 'domitille.croizier@gmail.com'), v.prospect_id, v.type, v.note, 'manual', now() - (v.days_ago || ' days')::interval
from (values
  ('10000000-0000-0000-0000-000000000002'::uuid, 'appel_abouti', 'Échange positif, en attente de devis détaillé.', 5),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'appel_abouti', 'RDV confirmé sur site la semaine prochaine.', 3),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'appel_manque', 'Pas de réponse, à retenter en fin de journée.', 4),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'appel_abouti', 'Discussion technique approfondie, très intéressé.', 2),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'deal_gagne', 'Signature du contrat annuel.', 3),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'deal_perdu', 'Est parti chez un concurrent moins cher.', 8),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'appel_abouti', 'Premier contact cordial, besoin confirmé.', 6),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'note', 'Cherche surtout à réduire son temps de gestion administrative.', 5),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'appel_manque', 'Injoignable, boîte vocale.', 6),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'appel_abouti', 'Budget validé en interne, attend notre proposition finale.', 4),
  ('10000000-0000-0000-0000-000000000014'::uuid, 'appel_abouti', 'Bon feeling, veut une démo avec son associé.', 5),
  ('10000000-0000-0000-0000-000000000017'::uuid, 'appel_abouti', 'Objection sur le prix, à retravailler.', 2),
  ('10000000-0000-0000-0000-000000000018'::uuid, 'deal_gagne', 'Contrat signé après 3 échanges.', 7),
  ('10000000-0000-0000-0000-000000000019'::uuid, 'deal_perdu', 'Budget reporté à l''année prochaine.', 10),
  ('10000000-0000-0000-0000-000000000020'::uuid, 'appel_manque', 'Deux tentatives sans réponse.', 9)
) as v(prospect_id, type, note, days_ago);

-- Tâches : certaines déjà faites, d'autres encore à faire
insert into tasks (user_id, prospect_id, type, note, due_at, priority, done)
select (select id from auth.users where email = 'domitille.croizier@gmail.com'), v.prospect_id, v.type, v.note,
  case when v.due_days_future is null then now() - (v.due_days_past || ' days')::interval else now() + (v.due_days_future || ' days')::interval end,
  v.priority, v.done
from (values
  ('10000000-0000-0000-0000-000000000002'::uuid, 'relance_email', 'Envoyer le devis détaillé', null::int, 2::int, 50, false),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'rdv_physique', 'Visite de chantier prévue', null, 1, 75, false),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'appel_visio', 'Démo technique avec l''équipe produit', null, 3, 100, false),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'appel_telephone', 'Rappeler pour qualifier le besoin', null, 2, 50, false),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'relance_email', 'Envoyer la proposition finale', null, 4, 75, false),
  ('10000000-0000-0000-0000-000000000017'::uuid, 'appel_telephone', 'Rappeler avec une contre-offre', null, 1, 100, false),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'appel_telephone', 'Premier appel de qualification', 3, null, 50, true),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'relance_email', 'Email de bienvenue client', 4, null, 50, true),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'appel_telephone', 'Appel de découverte', 2, null, 50, true)
) as v(prospect_id, type, note, due_days_past, due_days_future, priority, done);
