#!/usr/bin/env tsx

import { pool } from '../server/db';

const STORED_FILES_SQL = `
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
`;

async function main() {
  const { rows } = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.tables
       where table_schema = 'public' and table_name = 'stored_files'
     ) as exists`,
  );

  if (rows[0]?.exists) {
    console.log('[ensure-stored-files] stored_files table already exists; nothing to do.');
    return;
  }

  console.log('[ensure-stored-files] Creating stored_files table...');
  await pool.query(STORED_FILES_SQL);
  console.log('[ensure-stored-files] stored_files table created.');
}

main()
  .catch((error) => {
    console.error('[ensure-stored-files] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  });

