-- Persistent file storage table for attachments and uploads
-- Uses bytea to store file contents; metadata holds optional analysis and extra fields

create table if not exists stored_files (
  id uuid primary key default gen_random_uuid(),
  owner_id varchar not null,
  name text not null,
  mime_type text not null,
  size integer not null,
  content bytea not null,
  analyzed_content text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists stored_files_owner_idx on stored_files(owner_id);
create index if not exists stored_files_created_idx on stored_files(created_at);
