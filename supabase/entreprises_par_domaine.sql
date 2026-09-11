-- Rapprocher les fiches par le domaine de l'adresse professionnelle.
--
-- Jusqu'ici, deux fiches n'étaient réunies sous la même entreprise que si le
-- nom saisi était identique au caractère près (à la casse et aux espaces
-- extérieurs près). « We Assign », « WeAssign » et « WeAssign SAS » faisaient
-- donc trois entreprises, alors que les trois contacts écrivaient depuis
-- @we-assign.com. Le nom est ce que l'utilisateur tape ; le domaine est ce
-- que l'entreprise est.
--
-- Le nom garde la priorité : s'il correspond à une entreprise connue, rien ne
-- change. Le domaine ne sert qu'en second recours, quand le nom saisi ne
-- correspond à rien — c'est précisément le cas de la faute de frappe et de la
-- variante d'écriture.
--
-- Les boîtes personnelles sont exclues : sans cela, tous les contacts en
-- @gmail.com deviendraient une seule et même maison.

-- 1. Le domaine professionnel d'une adresse, ou NULL s'il n'en dit rien.
create or replace function public.domaine_pro(adresse text)
returns text
language sql
immutable
as $$
  select case
    when adresse is null or position('@' in adresse) = 0 then null
    when split_part(lower(btrim(adresse)), '@', 2) = '' then null
    when split_part(split_part(lower(btrim(adresse)), '@', 2), '.', 1) = any (array[
      'gmail','outlook','hotmail','yahoo','orange','free','wanadoo','laposte',
      'sfr','icloud','me','live','msn','protonmail','bbox','numericable','aol'
    ]) then null
    else split_part(lower(btrim(adresse)), '@', 2)
  end;
$$;

comment on function public.domaine_pro(text) is
  'Domaine d''une adresse professionnelle. NULL pour une boîte personnelle : le domaine n''y dit rien de l''entreprise.';

-- 2. Renseigner le domaine des entreprises déjà en base, à partir des adresses
--    de leurs contacts. On ne retient un domaine que s'il est le SEUL trouvé
--    parmi les fiches de l'entreprise : deux domaines différents signalent un
--    regroupement douteux qu'il vaut mieux ne pas entériner.
with domaines as (
  select p.company_id,
         min(domaine_pro(p.email)) as domaine,
         count(distinct domaine_pro(p.email)) as combien
    from prospects p
   where p.company_id is not null
     and domaine_pro(p.email) is not null
   group by p.company_id
)
update companies c
   set domain = d.domaine
  from domaines d
 where c.id = d.company_id
   and d.combien = 1
   and c.domain is null;

create index if not exists companies_domaine_equipe
    on companies (team_id, domain) where domain is not null;
create index if not exists companies_domaine_proprietaire
    on companies (sales_owner_id, domain) where domain is not null;

-- 3. Le rattachement : nom d'abord, domaine ensuite.
create or replace function public.rattacher_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nom     text := nullif(btrim(new.company), '');
  cle     text;
  domaine text := domaine_pro(new.email);
  trouve  uuid;
begin
  if nom is null then
    new.company_id := null;
    return new;
  end if;

  if tg_op = 'INSERT' and new.company_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.company_id is not null
     and new.company_id is not distinct from old.company_id
     and lower(btrim(coalesce(old.company, ''))) = lower(nom)
     and coalesce(domaine_pro(old.email), '') = coalesce(domaine, '') then
    return new;
  end if;

  cle := lower(nom);

  if new.team_id is not null then
    select id into trouve
      from companies
     where team_id = new.team_id and lower(btrim(name)) = cle
     limit 1;

    -- Le nom saisi ne correspond à rien de connu : c'est là que le domaine
    -- rattrape la variante d'écriture. La plus ancienne fait foi, pour que
    -- deux imports simultanés aboutissent au même rattachement.
    if trouve is null and domaine is not null then
      select id into trouve
        from companies
       where team_id = new.team_id and domain = domaine
       order by created_at
       limit 1;
    end if;

    if trouve is null then
      insert into companies (team_id, name, domain) values (new.team_id, nom, domaine)
      on conflict do nothing
      returning id into trouve;

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

    if trouve is null and domaine is not null then
      select id into trouve
        from companies
       where team_id is null and sales_owner_id = new.user_id and domain = domaine
       order by created_at
       limit 1;
    end if;

    if trouve is null then
      insert into companies (team_id, name, sales_owner_id, domain)
      values (null, nom, new.user_id, domaine)
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

  -- Une entreprise connue par son nom mais sans domaine en gagne un au passage.
  if trouve is not null and domaine is not null then
    update companies set domain = domaine where id = trouve and domain is null;
  end if;

  new.company_id := trouve;
  return new;
end;
$$;
