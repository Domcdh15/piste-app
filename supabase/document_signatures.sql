-- Signature électronique simple d'un document (typiquement un devis).
--
-- Portée juridique : c'est une signature simple au sens d'eIDAS, valable en
-- droit français (art. 1366-1367 du Code civil) mais sans présomption de
-- fiabilité — celle-ci est réservée à la signature qualifiée. En cas de
-- contestation, c'est donc à celui qui invoque le document de prouver la
-- signature : tout l'intérêt de cette table est de conserver ce faisceau de
-- preuves (empreinte du fichier signé, vérification de l'adresse email par
-- code à usage unique, horodatages, adresse IP, navigateur).
--
-- Cette table est la source de vérité. Le PDF signé n'en est qu'un rendu :
-- il se régénère à tout moment à partir des colonnes ci-dessous.
create table if not exists document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references prospect_documents(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,

  -- Le jeton du lien public. Imprévisible, c'est lui qui tient lieu
  -- d'authentification pour le signataire, qui n'a aucun compte.
  token text not null unique,
  signer_email text not null,
  signer_name text,
  message text,

  status text not null default 'envoye'
    check (status in ('envoye', 'vu', 'signe', 'refuse', 'annule')),

  -- Code à usage unique : jamais stocké en clair.
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,

  -- Le dossier de preuve.
  doc_sha256 text not null,
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  signed_at timestamptz,
  refused_at timestamptz,
  refusal_reason text,
  signed_name text,
  signer_ip text,
  signer_user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists document_signatures_token_idx on document_signatures(token);
create index if not exists document_signatures_document_idx on document_signatures(document_id);
create index if not exists document_signatures_prospect_idx on document_signatures(prospect_id);

alter table document_signatures enable row level security;

-- Lecture seule côté client, pour le commercial propriétaire et l'admin de son
-- équipe. Aucune politique d'écriture : la création et la signature passent
-- exclusivement par /api/sign, qui agit en rôle de service. Un signataire n'a
-- de toute façon pas de session Supabase — c'est son jeton qui l'identifie.
create policy "lire ses demandes de signature" on document_signatures for select
  using (
    auth.uid() = user_id
    or (team_id is not null and team_id = my_team_id() and my_team_role() = 'admin')
  );
