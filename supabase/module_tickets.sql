-- MODULE TICKETS
--
-- Un ticket suit une demande d'un client de votre client : Entreprise →
-- Contact → Ticket → Messages. Distinct d'une tâche, qui est une action à
-- mener : un ticket peut engendrer une tâche, l'inverse n'est pas vrai.
--
-- Distinct aussi de support_requests, qui sert au support de Closia lui-même.

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  prospect_id uuid references prospects(id) on delete set null,

  -- Numéro lisible, séquentiel par équipe : chaque client commence à 1.
  number integer not null,

  subject text not null,
  status text not null default 'nouveau'
    check (status in ('nouveau', 'en_cours', 'attente_client', 'resolu', 'ferme')),
  priority text not null default 'normale'
    check (priority in ('basse', 'normale', 'haute', 'urgente')),
  type text not null default 'demande'
    check (type in ('demande', 'probleme', 'question', 'reclamation')),

  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,

  due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (team_id, number)
);

create index if not exists tickets_team_idx on tickets(team_id, created_at desc);
create index if not exists tickets_company_idx on tickets(company_id);
create index if not exists tickets_prospect_idx on tickets(prospect_id);
create index if not exists tickets_status_idx on tickets(team_id, status);

-- Numérotation : calculée en base, jamais par le client. Deux tickets créés
-- au même instant ne peuvent pas recevoir le même numéro, la contrainte
-- d'unicité rejetterait le second.
create or replace function attribuer_numero_ticket() returns trigger
language plpgsql as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number
    from tickets where team_id = new.team_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ticket_numero on tickets;
create trigger trg_ticket_numero before insert on tickets
  for each row execute function attribuer_numero_ticket();

drop trigger if exists trg_tickets_updated_at on tickets;
create trigger trg_tickets_updated_at before update on tickets
  for each row execute function touch_updated_at();

-- Messages du ticket. is_internal distingue la note interne, qui ne part
-- jamais au client, de la réponse qui lui est destinée.
create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'agent')),
  sender_id uuid references auth.users(id) on delete set null,
  sender_email text,
  body text not null,
  is_internal boolean not null default false,

  -- Rattachement des emails, posé dès maintenant. Les ajouter plus tard
  -- obligerait à reprendre tout l'historique pour retrouver les fils.
  message_id text,
  in_reply_to text,

  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx on ticket_messages(ticket_id, created_at);
create index if not exists ticket_messages_msgid_idx on ticket_messages(message_id) where message_id is not null;

create table if not exists ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_message_id uuid not null references ticket_messages(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_message_idx on ticket_attachments(ticket_message_id);

-- Objets de demande proposés, modifiables par l'admin. Une liste fermée serait
-- un piège : un menuisier et un avocat n'ont pas les mêmes demandes. Celle-ci
-- ne fait que suggérer, le champ reste libre.
alter table teams add column if not exists ticket_subjects jsonb;

comment on column teams.ticket_subjects is
  'Objets de demande proposes a la saisie, par type. Null = liste par defaut du code.';

-- Cloisonnement : un ticket appartient a une equipe, et rien d'autre ne le voit.
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
alter table ticket_attachments enable row level security;

create policy "lire les tickets de son équipe" on tickets for select
  using (team_id = my_team_id());
create policy "créer un ticket" on tickets for insert
  with check (team_id = my_team_id());
create policy "modifier un ticket" on tickets for update
  using (team_id = my_team_id());

create policy "lire les messages" on ticket_messages for select
  using (exists (select 1 from tickets t where t.id = ticket_messages.ticket_id and t.team_id = my_team_id()));
create policy "écrire un message" on ticket_messages for insert
  with check (exists (select 1 from tickets t where t.id = ticket_messages.ticket_id and t.team_id = my_team_id()));

create policy "lire les pièces jointes" on ticket_attachments for select
  using (exists (
    select 1 from ticket_messages m join tickets t on t.id = m.ticket_id
    where m.id = ticket_attachments.ticket_message_id and t.team_id = my_team_id()));
create policy "joindre un fichier" on ticket_attachments for insert
  with check (exists (
    select 1 from ticket_messages m join tickets t on t.id = m.ticket_id
    where m.id = ticket_attachments.ticket_message_id and t.team_id = my_team_id()));

-- Une équipe peut être offerte comme un compte individuel peut l'être :
-- comptes de test, de démonstration, clients accompagnés. Sans cette colonne,
-- dès qu'une équipe porte son propre tarif, sa gratuité était perdue et son
-- abonnement fictif venait gonfler le MRR du back office.
alter table teams add column if not exists is_comped boolean not null default false;

comment on column teams.is_comped is
  'Equipe non facturee : elle garde son palier et ses droits, mais ne compte pas dans le MRR.';

-- ENCADREMENT (migration encadrement_equipe)
--
-- Encadrer n'est pas un métier de plus : c'est une responsabilité posée
-- par-dessus un métier. On sépare donc ce que la personne fait (role, inchangé)
-- de ce qu'elle encadre (manages, ajouté à côté). Rien n'est retiré.
alter table team_members
  add column if not exists manages text not null default 'none'
  check (manages in ('none', 'sales', 'csm', 'both'));

alter table teams
  add column if not exists sales_is_csm boolean not null default false;

create or replace function my_team_manages() returns text
language sql security definer stable as $$
  select case when role = 'admin' then 'both' else coalesce(manages, 'none') end
  from team_members where user_id = auth.uid() limit 1;
$$;

create or replace function encadre_ce_pool(pool_ligne text) returns boolean
language sql stable as $$
  select case my_team_manages()
    when 'both' then true
    when 'sales' then pool_ligne = 'sales'
    when 'csm' then pool_ligne = 'customer_success'
    else false
  end;
$$;

-- ABSENCE DATÉE (migration absence_dates)
--
-- Le mode absence n'avait qu'un interrupteur : la réponse automatique ne
-- s'arrêtait jamais d'elle-même, et rien dans l'application ne savait qu'une
-- personne était absente aujourd'hui.
alter table user_settings add column if not exists vacation_from date;
alter table user_settings add column if not exists vacation_to date;

create or replace function est_absent(depuis date, jusqu_a date, actif boolean)
returns boolean language sql immutable as $$
  select coalesce(actif, false)
     and (depuis is null or current_date >= depuis)
     and (jusqu_a is null or current_date <= jusqu_a);
$$;
