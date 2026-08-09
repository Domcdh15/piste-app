alter table user_settings add column if not exists vacation_mode_enabled boolean not null default false;
alter table user_settings add column if not exists vacation_message text;
alter table user_settings add column if not exists vacation_redirect_name text;
alter table user_settings add column if not exists vacation_redirect_email text;
alter table user_settings add column if not exists vacation_return_at timestamptz;
alter table user_settings add column if not exists vacation_last_checked_at timestamptz;
alter table user_settings add column if not exists vacation_replied_senders jsonb not null default '[]'::jsonb;
