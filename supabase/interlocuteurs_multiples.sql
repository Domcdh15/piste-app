-- Plusieurs interlocuteurs sur une même affaire.
--
-- Dans Closia, une fiche EST une affaire : la même ligne porte la personne,
-- l'entreprise et le deal (étape, montant, échéance). Deux contacts de la même
-- maison sur la même vente donnaient donc deux affaires, et le total du
-- pipeline comptait le montant deux fois.
--
-- Plutôt que de séparer l'affaire de la personne — ce qui toucherait le
-- pipeline, l'agenda, les activités, les tickets, les devis, la signature,
-- l'import et Zapier —, une fiche peut être rattachée à l'affaire d'une autre.
-- Elle garde son historique, ses relances et ses notes : elle reste un contact
-- à part entière. Elle cesse simplement d'être une affaire distincte.

alter table prospects
  add column if not exists rattache_a uuid references prospects(id) on delete set null;

comment on column prospects.rattache_a is
  'Fiche porteuse de l''affaire. NULL = la fiche porte sa propre affaire et compte dans le pipeline. Renseignée = la fiche est un interlocuteur supplémentaire sur l''affaire d''une autre fiche de la même entreprise.';

create index if not exists prospects_rattache_a_idx on prospects (rattache_a)
  where rattache_a is not null;

-- Trois garde-fous, en base parce qu'un appel direct à l'API contournerait
-- l'écran : on ne se rattache pas à soi-même, on ne fait pas de chaîne, et on
-- ne rattache pas deux maisons différentes l'une à l'autre.
create or replace function public.valider_rattachement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  porteuse record;
begin
  if new.rattache_a is null then
    return new;
  end if;

  if new.rattache_a = new.id then
    raise exception 'Une fiche ne peut pas être rattachée à elle-même.';
  end if;

  select id, company_id, rattache_a into porteuse
    from prospects where id = new.rattache_a;

  if porteuse.id is null then
    raise exception 'La fiche porteuse est introuvable.';
  end if;

  -- Pas de chaîne : la porteuse doit elle-même porter son affaire.
  if porteuse.rattache_a is not null then
    raise exception 'Cette fiche est déjà rattachée à une autre affaire : elle ne peut pas en porter une.';
  end if;

  -- Pas d'inversion : une fiche qui porte déjà des interlocuteurs ne peut pas
  -- devenir elle-même un interlocuteur, sinon ses rattachés se retrouveraient
  -- orphelins d'affaire.
  if exists (select 1 from prospects x where x.rattache_a = new.id) then
    raise exception 'Cette fiche porte déjà des interlocuteurs : détachez-les avant de la rattacher.';
  end if;

  -- Même maison, sinon le regroupement par entreprise ne veut plus rien dire.
  if new.company_id is null or new.company_id is distinct from porteuse.company_id then
    raise exception 'Les deux fiches doivent appartenir à la même entreprise.';
  end if;

  return new;
end;
$$;

-- Se déclenche APRÈS trg_rattacher_entreprise (ordre alphabétique des noms),
-- donc company_id est déjà résolu quand on le compare.
drop trigger if exists trg_valider_rattachement on prospects;
create trigger trg_valider_rattachement
  before insert or update on prospects
  for each row execute function valider_rattachement();
