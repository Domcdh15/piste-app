-- Un prospect peut naître d'un rendez-vous d'agenda. Miroir de la migration.
alter table prospects drop constraint if exists prospects_created_via_check;
alter table prospects add constraint prospects_created_via_check
  check (created_via is null or created_via in ('manuel', 'import', 'back_office', 'site', 'email', 'agenda'));

comment on column prospects.created_via is
  'Mode d''entrée technique : manuel | import | back_office | site | email | agenda. Null = antérieur au suivi.';

-- Adresses écartées depuis l'agenda. Sans cette mémoire, le même participant
-- serait reproposé à chaque ouverture — un prestataire, un comptable ou un
-- collègue externe reviennent toutes les semaines dans un agenda.
create table if not exists ignored_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);
create index if not exists ignored_contacts_user_idx on ignored_contacts(user_id);
alter table ignored_contacts enable row level security;
create policy "lire ses adresses écartées" on ignored_contacts for select using (auth.uid() = user_id);
create policy "écarter une adresse" on ignored_contacts for insert with check (auth.uid() = user_id);
create policy "réintégrer une adresse" on ignored_contacts for delete using (auth.uid() = user_id);
