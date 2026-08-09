create table if not exists custom_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dimension text not null,
  measure text not null,
  chart_type text not null default 'bar',
  created_at timestamptz not null default now()
);
alter table custom_metrics enable row level security;
create policy "select own custom_metrics" on custom_metrics for select using (auth.uid() = user_id);
create policy "insert own custom_metrics" on custom_metrics for insert with check (auth.uid() = user_id);
create policy "delete own custom_metrics" on custom_metrics for delete using (auth.uid() = user_id);
