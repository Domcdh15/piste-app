alter table user_settings
  add column if not exists sig_name text,
  add column if not exists sig_job_title text,
  add column if not exists sig_company text,
  add column if not exists sig_phone text;
