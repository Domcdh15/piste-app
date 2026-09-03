-- Une entreprise porte plusieurs contacts.
--
-- La table companies existait, prospects.company_id aussi, mais rien ne les
-- remplissait : ni déclencheur, ni code applicatif. Résultat, deux contacts de
-- la même maison étaient deux fiches sans lien, et la seule chose qui les
-- rapprochait était une chaîne de caractères recopiée à la main. Sur les 99
-- fiches en base, les trois dernières créées — les trois comptes de test, tous
-- chez « Closiatest » — étaient détachées.
--
-- Le rattachement est fait ICI et non dans le client, pour trois raisons :
-- il couvre tous les chemins d'écriture d'un coup (formulaire, import,
-- back office, Zapier, le déclencheur leads -> prospects), il ne consomme
-- aucune fonction serverless — le plafond Vercel est à 10/12 —, et il ne peut
-- pas être contourné par un appel direct à l'API.

-- 1. Les entreprises d'un compte sans équipe appartiennent à quelqu'un.
--    sales_owner_id sert de porteur : c'est déjà la colonne sur laquelle
--    s'appuie la règle de lecture de companies pour les comptes solo, et pour
--    un compte sans équipe le responsable commercial EST l'utilisateur.
update companies c
   set sales_owner_id = p.user_id
  from prospects p
 where p.company_id = c.id
   and c.team_id is null
   and c.sales_owner_id is null;

-- 2. Deux saisies du même nom ne doivent plus faire deux entreprises.
--    Comparaison sur le nom normalisé : « Boulangerie Dupont » et
--    « boulangerie dupont  » sont la même maison.
create unique index if not exists companies_nom_unique_par_equipe
    on companies (team_id, lower(btrim(name)))
 where team_id is not null;

create unique index if not exists companies_nom_unique_par_proprietaire
    on companies (sales_owner_id, lower(btrim(name)))
 where team_id is null and sales_owner_id is not null;

-- 3. Le rattachement lui-même : on retrouve l'entreprise par son nom, on la
--    crée si elle n'existe pas, et on renseigne company_id.
create or replace function public.rattacher_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nom    text := nullif(btrim(new.company), '');
  cle    text;
  trouve uuid;
begin
  -- Sans nom d'entreprise, il n'y a rien à rattacher.
  if nom is null then
    new.company_id := null;
    return new;
  end if;

  -- Un rattachement fourni explicitement fait foi : on ne l'écrase pas.
  if tg_op = 'INSERT' and new.company_id is not null then
    return new;
  end if;

  -- En mise à jour, on ne retouche que si le nom a changé ou si la fiche
  -- n'était pas encore rattachée. Sinon on laisserait un lien manuel se
  -- faire défaire à chaque sauvegarde.
  if tg_op = 'UPDATE'
     and new.company_id is not null
     and new.company_id is not distinct from old.company_id
     and lower(btrim(coalesce(old.company, ''))) = lower(nom) then
    return new;
  end if;

  cle := lower(nom);

  if new.team_id is not null then
    select id into trouve
      from companies
     where team_id = new.team_id and lower(btrim(name)) = cle
     limit 1;

    if trouve is null then
      insert into companies (team_id, name) values (new.team_id, nom)
      on conflict do nothing
      returning id into trouve;

      -- Deux imports simultanés peuvent créer la même entreprise : l'index
      -- unique en arrête un, et on relit celle que l'autre vient de poser.
      if trouve is null then
        select id into trouve
          from companies
         where team_id = new.team_id and lower(btrim(name)) = cle
         limit 1;
      end if;
    end if;
  else
    select id into trouve
      from companies
     where team_id is null and sales_owner_id = new.user_id and lower(btrim(name)) = cle
     limit 1;

    if trouve is null then
      insert into companies (team_id, name, sales_owner_id)
      values (null, nom, new.user_id)
      on conflict do nothing
      returning id into trouve;

      if trouve is null then
        select id into trouve
          from companies
         where team_id is null and sales_owner_id = new.user_id and lower(btrim(name)) = cle
         limit 1;
      end if;
    end if;
  end if;

  new.company_id := trouve;
  return new;
end;
$$;

drop trigger if exists trg_rattacher_entreprise on prospects;
create trigger trg_rattacher_entreprise
  before insert or update on prospects
  for each row execute function rattacher_entreprise();

-- 4. Rattrapage des fiches déjà en base qui n'ont pas d'entreprise.
--    log_prospect_event n'écrit que sur un changement d'étape ou de statut :
--    cette mise à jour ne laisse donc aucune trace parasite dans l'historique.
update prospects
   set company = company
 where company_id is null
   and nullif(btrim(company), '') is not null;
