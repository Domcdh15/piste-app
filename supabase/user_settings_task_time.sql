alter table user_settings
  add column if not exists default_task_time text not null default '17:00';
