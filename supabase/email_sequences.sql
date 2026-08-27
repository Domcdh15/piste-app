-- Séquences de relance : plusieurs messages rédigés d'un coup, relus par le
-- commercial, puis envoyés à des dates échelonnées depuis sa propre boîte.
-- Idempotent : peut être exécuté plusieurs fois sans risque.

create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  name text,
  status text not null default 'active' check (status in ('active', 'done', 'stopped')),
  stopped_reason text,
  created_at timestamptz not null default now()
);

create table if not exists sequence_messages (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  step integer not null,
  subject text,
  body text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists sequences_prospect_idx on sequences(prospect_id);
create index if not exists sequences_status_idx on sequences(status);
-- Le cron lit tous les matins « ce qui doit partir » : cet index porte la requête.
create index if not exists sequence_messages_due_idx
  on sequence_messages(status, send_at) where status = 'scheduled';
create index if not exists sequence_messages_sequence_idx on sequence_messages(sequence_id);

alter table sequences enable row level security;
alter table sequence_messages enable row level security;

drop policy if exists "own sequences" on sequences;
create policy "own sequences" on sequences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sequence messages" on sequence_messages;
create policy "own sequence messages" on sequence_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table sequences is
  'Une séquence de relance appliquée à un prospect. S''arrête seule dès que le prospect répond.';
comment on column sequence_messages.send_at is
  'Date prévue. L''envoi réel a lieu au passage du cron du matin qui suit.';
