-- Comment le prospect est entré dans Closia, renseigné par le code et non
-- par l'utilisateur. Distinct de `source`, qui reste la provenance
-- commerciale déclarée (Recommandation, LinkedIn, Salon…).
-- Idempotent : peut être exécuté plusieurs fois sans risque.

alter table prospects
  add column if not exists created_via text;

do $$ begin
  alter table prospects add constraint prospects_created_via_check
    check (created_via is null or created_via in ('manuel', 'import', 'back_office', 'site', 'email'));
exception when duplicate_object then null; end $$;

comment on column prospects.created_via is
  'Mode d''entrée technique : manuel | import | back_office | site | email. Null = antérieur au suivi.';

-- Reprise de l'existant : seuls les prospects déclarés « Import » peuvent
-- être qualifiés avec certitude, le reste est passé par le formulaire.
update prospects set created_via = 'import' where created_via is null and source = 'Import';
update prospects set created_via = 'manuel' where created_via is null;
