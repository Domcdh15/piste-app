-- Identifiants des intégrations d'équipe (Slack, Notion).
--
-- Table à part, et non des colonnes sur « teams » : la politique de lecture de
-- « teams » autorise n'importe quel membre de l'équipe, ce qui exposerait le
-- jeton Notion et l'adresse du webhook Slack à tout le monde. Ici, aucune
-- politique n'est déclarée : seul le rôle de service y accède, donc uniquement
-- les fonctions serveur. L'interface n'en reçoit qu'un état, jamais la valeur.
create table if not exists team_integrations (
  team_id uuid primary key references teams(id) on delete cascade,
  slack_webhook_url text,
  slack_daily_brief boolean not null default true,
  notion_token text,
  notion_database_id text,
  updated_at timestamptz not null default now()
);

alter table team_integrations enable row level security;
