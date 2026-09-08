-- BOÎTE DE RÉCEPTION
--
-- Pourquoi. Beaucoup de métiers reçoivent leurs demandes par email, en vrac,
-- mêlées aux newsletters, aux factures de fournisseurs et au démarchage. Le
-- suivi se perd non pas faute d'outil, mais parce que rien ne distingue une
-- vraie demande du reste, et parce qu'il faut ressaisir à la main ce que
-- l'email disait déjà. Cet écran fait les deux : il sépare, et il extrait.
--
-- Ce qui est conservé, et ce qui ne l'est pas. On garde l'expéditeur, l'objet,
-- la date, le verdict et les champs extraits — de quoi tenir un tableau de
-- suivi. On ne recopie **jamais** le corps du message en base : il est relu
-- chez Gmail ou Outlook au moment du tri, puis jeté. Dupliquer une boîte mail
-- dans un CRM, c'est doubler la surface d'une fuite sans rien apporter au
-- suivi.

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,

  provider text not null check (provider in ('google', 'microsoft')),
  -- Identifiant du message chez le fournisseur : c'est lui qui empêche qu'une
  -- relève rejoue un message déjà trié.
  message_id text not null,

  sender_email text not null,
  sender_name text,
  subject text,
  received_at timestamptz,

  verdict text not null default 'a_trier'
    check (verdict in ('a_trier', 'demande', 'pas_client')),
  -- D'où vient le verdict. Un tri fait par l'IA ne se corrige pas comme un tri
  -- fait à la main : l'utilisateur doit voir lequel il regarde.
  verdict_source text
    check (verdict_source is null or verdict_source in ('ia', 'utilisateur', 'expediteur_connu', 'expediteur_ignore', 'categorie')),
  raison text,

  -- Les colonnes du tableau, remplies par l'IA. Un jsonb plutôt que des
  -- colonnes en dur : deux métiers ne suivent pas les mêmes informations, et
  -- c'est justement ce que l'utilisateur ne sait pas nommer au départ.
  champs jsonb not null default '{}'::jsonb,

  prospect_id uuid references prospects(id) on delete set null,
  -- Traité : sorti de la liste sans être supprimé, pour ne pas revenir à la
  -- relève suivante.
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, provider, message_id)
);

create index if not exists inbox_messages_user_idx on inbox_messages(user_id, received_at desc);
create index if not exists inbox_messages_verdict_idx on inbox_messages(user_id, verdict);

-- Expéditeurs à ne plus jamais faire remonter. Une adresse complète
-- (« news@fournisseur.fr ») ou un domaine entier (« @fournisseur.fr ») : c'est
-- le domaine qui règle le cas des newsletters qui changent d'expéditeur à
-- chaque envoi.
create table if not exists inbox_senders_ignores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

-- Les colonnes du tableau de suivi, propres à chaque utilisateur.
-- [{ "nom": "Type de projet", "pourquoi": "…" }, …]
alter table user_settings add column if not exists inbox_columns jsonb;

comment on column user_settings.inbox_columns is
  'Colonnes du tableau de la boîte de réception, proposées par l''IA puis validées par l''utilisateur. Null = pas encore définies.';

-- ============================================================
-- RLS — la boîte de réception d'une personne n'est à personne d'autre
-- ============================================================
--
-- Contrairement aux prospects, rien n'est ouvert à l'admin d'équipe : le
-- partage se fait en créant l'opportunité, pas en lisant le courrier de
-- quelqu'un.

alter table inbox_messages enable row level security;

drop policy if exists "select own inbox" on inbox_messages;
create policy "select own inbox" on inbox_messages for select using (auth.uid() = user_id);

drop policy if exists "insert own inbox" on inbox_messages;
create policy "insert own inbox" on inbox_messages for insert with check (auth.uid() = user_id);

drop policy if exists "update own inbox" on inbox_messages;
create policy "update own inbox" on inbox_messages for update using (auth.uid() = user_id);

drop policy if exists "delete own inbox" on inbox_messages;
create policy "delete own inbox" on inbox_messages for delete using (auth.uid() = user_id);

alter table inbox_senders_ignores enable row level security;

drop policy if exists "select own ignores" on inbox_senders_ignores;
create policy "select own ignores" on inbox_senders_ignores for select using (auth.uid() = user_id);

drop policy if exists "insert own ignores" on inbox_senders_ignores;
create policy "insert own ignores" on inbox_senders_ignores for insert with check (auth.uid() = user_id);

drop policy if exists "delete own ignores" on inbox_senders_ignores;
create policy "delete own ignores" on inbox_senders_ignores for delete using (auth.uid() = user_id);
