-- Vérification complète de la sécurité (RLS) — lecture seule, ne modifie rien.

-- 1) RLS activée sur chaque table sensible ?
select tablename,
  case when rowsecurity then '✅ activée' else '❌ DÉSACTIVÉE' end as rls
from pg_tables
where schemaname = 'public'
  and tablename in ('prospects','emails_generes','scripts_appel','analyses_ia','activities','tasks','user_settings','calendar_connections','leads')
order by tablename;

-- 2) Nombre de policies par table (0 = problème, sauf calendar_connections qui n'en a volontairement aucune)
select tablename, count(*) as nb_policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- 3) Lignes sans user_id sur les 3 tables corrigées (doit renvoyer 0 partout)
select 'emails_generes' as table_name, count(*) as lignes_sans_user_id from emails_generes where user_id is null
union all
select 'scripts_appel', count(*) from scripts_appel where user_id is null
union all
select 'analyses_ia', count(*) from analyses_ia where user_id is null;
