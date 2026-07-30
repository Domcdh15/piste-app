-- Audit et renforcement de la sécurité des données clients (RLS).
-- Idempotent : peut être exécuté plusieurs fois sans risque.
-- But : garantir que chaque utilisateur ne voit et ne modifie QUE ses propres données,
-- ce qui devient critique dès qu'il y aura plusieurs commerciaux sur le même compte Supabase.

-- ============================================================
-- 1) PROSPECTS — table principale des données clients
-- ============================================================
alter table prospects enable row level security;

drop policy if exists "select own prospects" on prospects;
create policy "select own prospects" on prospects for select using (auth.uid() = user_id);

drop policy if exists "insert own prospects" on prospects;
create policy "insert own prospects" on prospects for insert with check (auth.uid() = user_id);

drop policy if exists "update own prospects" on prospects;
create policy "update own prospects" on prospects for update using (auth.uid() = user_id);

drop policy if exists "delete own prospects" on prospects;
create policy "delete own prospects" on prospects for delete using (auth.uid() = user_id);

-- ============================================================
-- 2) EMAILS GÉNÉRÉS / SCRIPTS D'APPEL / ANALYSES IA
-- Ces tables n'ont pas de colonne user_id : on la rattache au
-- prospect concerné, dont le user_id fait foi.
-- ============================================================
alter table emails_generes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table scripts_appel add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table analyses_ia add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Rattrape les lignes existantes qui n'ont pas encore de user_id, via leur prospect.
update emails_generes set user_id = prospects.user_id from prospects where emails_generes.prospect_id = prospects.id and emails_generes.user_id is null;
update scripts_appel set user_id = prospects.user_id from prospects where scripts_appel.prospect_id = prospects.id and scripts_appel.user_id is null;
update analyses_ia set user_id = prospects.user_id from prospects where analyses_ia.prospect_id = prospects.id and analyses_ia.user_id is null;

alter table emails_generes enable row level security;
alter table scripts_appel enable row level security;
alter table analyses_ia enable row level security;

drop policy if exists "select own emails" on emails_generes;
create policy "select own emails" on emails_generes for select using (auth.uid() = user_id);
drop policy if exists "insert own emails" on emails_generes;
create policy "insert own emails" on emails_generes for insert with check (auth.uid() = user_id);
drop policy if exists "delete own emails" on emails_generes;
create policy "delete own emails" on emails_generes for delete using (auth.uid() = user_id);

drop policy if exists "select own scripts" on scripts_appel;
create policy "select own scripts" on scripts_appel for select using (auth.uid() = user_id);
drop policy if exists "insert own scripts" on scripts_appel;
create policy "insert own scripts" on scripts_appel for insert with check (auth.uid() = user_id);
drop policy if exists "delete own scripts" on scripts_appel;
create policy "delete own scripts" on scripts_appel for delete using (auth.uid() = user_id);

drop policy if exists "select own analyses" on analyses_ia;
create policy "select own analyses" on analyses_ia for select using (auth.uid() = user_id);
drop policy if exists "insert own analyses" on analyses_ia;
create policy "insert own analyses" on analyses_ia for insert with check (auth.uid() = user_id);
drop policy if exists "delete own analyses" on analyses_ia;
create policy "delete own analyses" on analyses_ia for delete using (auth.uid() = user_id);

-- ============================================================
-- 3) ACTIVITIES / TASKS — déjà en RLS, on réaffirme pour être sûr
-- ============================================================
alter table activities enable row level security;
drop policy if exists "select own activities" on activities;
create policy "select own activities" on activities for select using (auth.uid() = user_id);
drop policy if exists "insert own activities" on activities;
create policy "insert own activities" on activities for insert with check (auth.uid() = user_id);
drop policy if exists "delete own activities" on activities;
create policy "delete own activities" on activities for delete using (auth.uid() = user_id);

alter table tasks enable row level security;
drop policy if exists "select own tasks" on tasks;
create policy "select own tasks" on tasks for select using (auth.uid() = user_id);
drop policy if exists "insert own tasks" on tasks;
create policy "insert own tasks" on tasks for insert with check (auth.uid() = user_id);
drop policy if exists "update own tasks" on tasks;
create policy "update own tasks" on tasks for update using (auth.uid() = user_id);
drop policy if exists "delete own tasks" on tasks;
create policy "delete own tasks" on tasks for delete using (auth.uid() = user_id);

-- ============================================================
-- 4) USER_SETTINGS — déjà en RLS, on réaffirme
-- ============================================================
alter table user_settings enable row level security;
drop policy if exists "user_settings_select_own" on user_settings;
create policy "user_settings_select_own" on user_settings for select using (auth.uid() = user_id);
drop policy if exists "user_settings_insert_own" on user_settings;
create policy "user_settings_insert_own" on user_settings for insert with check (auth.uid() = user_id);
drop policy if exists "user_settings_update_own" on user_settings;
create policy "user_settings_update_own" on user_settings for update using (auth.uid() = user_id);

-- ============================================================
-- 5) CALENDAR_CONNECTIONS — contient des tokens OAuth sensibles.
-- Volontairement AUCUNE policy client : seule la clé service_role
-- (utilisée uniquement côté serveur dans /api) peut y accéder.
-- On s'assure juste que RLS est bien activée (donc bloque tout accès client).
-- ============================================================
alter table calendar_connections enable row level security;

-- ============================================================
-- Vérification : liste les tables sans policy après ce script
-- (ne devrait rien retourner si tout est correctement sécurisé)
-- ============================================================
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('prospects','emails_generes','scripts_appel','analyses_ia','activities','tasks','user_settings','calendar_connections','leads')
  and tablename not in (select tablename from pg_policies where schemaname = 'public')
  and tablename <> 'calendar_connections';
