-- Espace de stockage privé : les fichiers ne sont jamais accessibles par URL
-- directe, seulement via une URL signée générée pour l'utilisateur qui y a droit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('prospect-documents', 'prospect-documents', false, 10485760)
on conflict (id) do nothing;

-- Le chemin de chaque fichier commence par l'identifiant de son propriétaire :
-- c'est ce préfixe qui sert de garde-fou dans les règles ci-dessous.
create policy "lire ses documents" on storage.objects for select
  using (bucket_id = 'prospect-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "déposer ses documents" on storage.objects for insert
  with check (bucket_id = 'prospect-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "supprimer ses documents" on storage.objects for delete
  using (bucket_id = 'prospect-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Métadonnées : nom d'origine, taille et type, que le stockage seul ne restitue pas commodément.
create table if not exists prospect_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_documents_prospect_idx on prospect_documents(prospect_id);

alter table prospect_documents enable row level security;

create policy "select prospect_documents" on prospect_documents for select
  using (auth.uid() = user_id or (team_id is not null and team_id = my_team_id() and my_team_role() = 'admin'));

create policy "insert prospect_documents" on prospect_documents for insert
  with check (auth.uid() = user_id);

create policy "delete prospect_documents" on prospect_documents for delete
  using (auth.uid() = user_id);
