-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

alter table prospects
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_contact_at timestamptz;
