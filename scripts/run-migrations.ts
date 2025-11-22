#!/usr/bin/env tsx

import { runMigrations } from '../server/migrations';
import { pool } from '../server/db';

async function main() {
  await runMigrations();
}

main()
  .catch((error) => {
    console.error('[db:migrate] Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  });

