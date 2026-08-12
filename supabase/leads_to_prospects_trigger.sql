-- Chaque nouveau lead (formulaire de contact du site vitrine) crée automatiquement
-- un prospect correspondant dans le pipeline du compte pro domitille.debouy@clos-ia.fr,
-- pour qu'elle puisse le gérer directement dans le CRM plutôt que seulement depuis le
-- back office (qui ne permet que de marquer "à recontacter").
create or replace function create_prospect_from_lead()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into prospects (user_id, name, company, email, notes)
  values (
    'ca0b4c82-cd8c-4589-a593-2d9189445432',
    coalesce(nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')), ''), new.name, 'Lead site web'),
    coalesce(nullif(new.company, ''), 'Non renseigné'),
    new.email,
    trim(both E'\n' from concat_ws(E'\n',
      'Lead entrant depuis le site (formulaire de contact).',
      case when new.industry is not null and new.industry <> '' then 'Secteur : ' || new.industry end,
      case when new.team_size is not null and new.team_size <> '' then 'Taille équipe : ' || new.team_size end,
      case when new.contact_preference is not null and new.contact_preference <> '' then 'Préférence : ' || new.contact_preference end,
      case when new.message is not null and new.message <> '' then 'Message : ' || new.message end
    ))
  );
  return new;
end;
$$;

drop trigger if exists trg_create_prospect_from_lead on leads;
create trigger trg_create_prospect_from_lead
after insert on leads
for each row execute function create_prospect_from_lead();
