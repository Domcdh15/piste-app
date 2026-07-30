-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

alter table prospects add column if not exists job_title text;
