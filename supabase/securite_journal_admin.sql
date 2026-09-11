-- Le journal d'administration était ouvert à tout le monde.
--
-- `admin_audit_log` était la seule table de `public` sans RLS, et les rôles
-- `anon` et `authenticated` y avaient SELECT, INSERT, UPDATE, DELETE et
-- TRUNCATE. Or `anon`, c'est n'importe qui : la clé publiable est dans le
-- JavaScript de l'application, par construction. Un appel à
-- /rest/v1/admin_audit_log suffisait donc à lire — ou à effacer — le journal.
--
-- Ce que ce journal contient : les créations de comptes clients, les
-- changements de formule avec leur montant, les alertes de quota d'IA, les
-- liens de mot de passe générés. C'est-à-dire la liste des clients, leur
-- tarif et leur usage.
--
-- Personne côté navigateur ne lit cette table : seules trois fonctions
-- serveur y touchent, toutes avec la clé service_role, qui n'est jamais
-- soumise à RLS. Le back-office passe par api/admin/overview.js, pas par la
-- base en direct. Fermer n'enlève donc rien à personne.
--
-- Même figure que team_integrations : RLS activée et AUCUNE policy. Ce n'est
-- pas un oubli, c'est la configuration la plus sûre — tout est refusé, sauf à
-- la clé de service.

revoke all on table public.admin_audit_log from anon, authenticated;
alter table public.admin_audit_log enable row level security;

comment on table public.admin_audit_log is
  'Journal d''administration. RLS active sans aucune policy : lecture et écriture réservées à la clé service_role, depuis les fonctions serveur. Ne jamais y ajouter de policy client.';

-- Le chemin de recherche des fonctions, figé.
--
-- Une fonction SECURITY DEFINER s'exécute avec les droits de son propriétaire.
-- Si son search_path n'est pas fixé, l'appelant peut le détourner et lui faire
-- exécuter ses propres objets avec ces droits élevés. Seize fonctions étaient
-- dans ce cas, dont domaine_pro, ajoutée aujourd'hui — l'oubli est facile,
-- d'où l'intérêt de le traiter en une fois.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and (p.proconfig is null or not exists (
             select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.signature);
  end loop;
end $$;
