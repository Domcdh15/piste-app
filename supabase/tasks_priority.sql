-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → New query

alter table tasks add column if not exists priority integer not null default 50;
