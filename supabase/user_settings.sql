create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notif_urgent_alerts boolean not null default true,
  notif_hot_leads boolean not null default true,
  notif_daily_recap boolean not null default false,
  objective_monthly_revenue numeric,
  objective_monthly_deals integer,
  ai_default_tone text not null default 'Professionnel',
  ai_signature text not null default '',
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "user_settings_select_own" on user_settings;
create policy "user_settings_select_own" on user_settings for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on user_settings;
create policy "user_settings_insert_own" on user_settings for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on user_settings;
create policy "user_settings_update_own" on user_settings for update using (auth.uid() = user_id);
