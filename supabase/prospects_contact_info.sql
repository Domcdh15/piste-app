-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

alter table prospects add column if not exists email text;
alter table prospects add column if not exists phone text;
