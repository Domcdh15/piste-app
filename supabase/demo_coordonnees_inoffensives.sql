-- Les comptes de démonstration ne doivent joindre personne.
--
-- La règle du projet est que les faux clients portent une adresse en
-- `.example`, domaine réservé par la RFC 2606 qui ne résout jamais : une
-- démonstration où l'on clique « envoyer » n'écrit à personne. Deux trous
-- subsistaient.
--
-- 1. Le compte de démonstration Solo est antérieur à cette règle. Ses vingt
--    fiches portaient des adresses en `.fr` et `.io` — boulangerie-dupont.fr,
--    technova.io, lefevre-avocats.fr. Ces domaines appartiennent
--    vraisemblablement à de vraies entreprises : un « envoyer » pendant une
--    démonstration serait parti chez un inconnu.
--
-- 2. Les téléphones n'avaient jamais été traités, sur AUCUN compte. Le compte
--    Solo portait une série 06 12 34 56 01 à 20 ; les comptes test.* des
--    numéros géographiques plausibles, dont « 01 40 70 70 70 ». Tous sont
--    attribuables à un abonné réel.
--
-- Les plages 01 99 00 XX XX et 06 39 98 XX XX sont réservées à la fiction :
-- personne ne peut s'y trouver. Le format à paires espacées est conservé,
-- c'est lui qui rend l'écran crédible.
--
-- Les noms et les entreprises ne bougent pas : ils sont déjà fictifs, et une
-- démonstration a besoin qu'ils le restent pour rester lisible.

-- 1. Les adresses du compte de démonstration Solo.
update prospects p
   set email = regexp_replace(lower(p.email), '\.[a-z]+$', '.example')
  from auth.users u
 where u.id = p.user_id
   and u.email = 'domitille.croizier@gmail.com'
   and p.email is not null
   and p.email not like '%.example';

-- 2. Les téléphones de tous les comptes de démonstration.
with cible as (
  select p.id,
         left(regexp_replace(p.phone, '\D', '', 'g'), 2) as prefixe,
         row_number() over (partition by p.user_id order by p.created_at) as n
    from prospects p
    join auth.users u on u.id = p.user_id
   where u.email in ('domitille.croizier@gmail.com', 'test.solo@clos-ia.fr',
                     'test.equipe@clos-ia.fr', 'test.business@clos-ia.fr')
     and p.phone is not null
)
update prospects p
   set phone = case when c.prefixe in ('06', '07') then '06 39 98 ' else '01 99 00 ' end
             || substr(lpad(c.n::text, 4, '0'), 1, 2) || ' ' || substr(lpad(c.n::text, 4, '0'), 3, 2)
  from cible c
 where p.id = c.id;

-- 3. Trois fiches du compte Solo n'avaient ni adresse ni téléphone. Sans
--    danger — il n'y a rien à joindre —, mais une fiche sans coordonnées a
--    l'air cassée dans une démonstration, et deux d'entre elles portent
--    l'historique le plus riche du compte (24 et 6 tâches). On leur donne des
--    coordonnées inoffensives, une orthographe correcte pour « Charcuterie »,
--    et un nom de famille à « Gérard », qui s'affichait seul.
update prospects p set
  name    = case p.name when 'Gérard' then 'Gérard Vasseur' else p.name end,
  company = case p.company when 'Charchuterie' then 'Charcuterie Bonneau'
                           when 'Mentor'       then 'Vasseur Conseil'
                           else p.company end,
  email   = case p.name when 'Gérard'         then 'gerard.vasseur@vasseur-conseil.example'
                        when 'Jean Bonneau'   then 'jean.bonneau@charcuterie-bonneau.example'
                        when 'Martin Mystère' then 'martin.mystere@mystery.example' end,
  phone   = case p.name when 'Gérard'         then '06 39 98 00 21'
                        when 'Jean Bonneau'   then '06 39 98 00 22'
                        when 'Martin Mystère' then '06 39 98 00 23' end
from auth.users u
where u.id = p.user_id
  and u.email = 'domitille.croizier@gmail.com'
  and p.email is null;
