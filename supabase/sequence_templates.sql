-- Modèles de séquence réutilisables, et connexion à une plateforme d'emailing.
-- Miroir de la migration appliquée en base.
create table if not exists sequence_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  steps jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sequence_templates_user_idx on sequence_templates(user_id);
alter table sequence_templates enable row level security;

-- Un modèle est personnel, mais partagé avec l'équipe : une bonne mécanique de
-- relance n'a aucune raison de rester dans un tiroir.
create policy "lire les modèles" on sequence_templates for select
  using (auth.uid() = user_id or (team_id is not null and team_id = my_team_id()));
create policy "créer ses modèles" on sequence_templates for insert with check (auth.uid() = user_id);
create policy "modifier ses modèles" on sequence_templates for update using (auth.uid() = user_id);
create policy "supprimer ses modèles" on sequence_templates for delete using (auth.uid() = user_id);

alter table team_integrations
  add column if not exists emailing_provider text
    check (emailing_provider in ('brevo', 'mailjet')),
  add column if not exists emailing_api_key text,
  add column if not exists emailing_api_secret text,
  add column if not exists emailing_list_id text;
