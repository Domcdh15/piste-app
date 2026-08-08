alter table user_settings add column if not exists ai_detail_level text not null default 'Équilibré';
alter table user_settings add column if not exists ai_initiative text not null default 'Équilibré';
alter table user_settings add column if not exists work_days jsonb not null default '["Lun","Mar","Mer","Jeu","Ven"]';
