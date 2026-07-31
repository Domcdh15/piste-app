alter table user_settings
  add column if not exists ai_calls_used integer not null default 0,
  add column if not exists ai_calls_reset_at timestamptz;
