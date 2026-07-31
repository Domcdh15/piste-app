alter table user_settings
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company_name text,
  add column if not exists industry text,
  add column if not exists team_size text,
  add column if not exists existing_crm text;
