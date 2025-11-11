#!/usr/bin/env tsx

import { fileURLToPath } from 'node:url';

import { db, pool } from '../server/db';
import { migrateLegacyPlans } from '../server/plans/legacy-plan-migration';

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply') || args.has('--commit');
const wantsJson = args.has('--json');
const verbose = args.has('--verbose') || args.has('-v');
const dryRun = !shouldApply;

async function main(): Promise<void> {
  const start = Date.now();

  const report = await migrateLegacyPlans(db, {
    dryRun,
    logger: verbose ? (message) => console.log(message) : undefined,
  });

  const durationMs = Date.now() - start;

  if (wantsJson) {
    console.log(
      JSON.stringify(
        {
          ...report,
          durationMs,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nPlan alignment ${dryRun ? 'dry-run' : 'execution'} complete in ${durationMs}ms.`);
    console.log(`Users evaluated: ${report.totalUsers}`);
    console.log(`Users requiring updates: ${report.updatedUsers}`);

    if (Object.keys(report.reasons).length > 0) {
      console.log('\nReason counts:');
      const entries = Object.entries(report.reasons).sort((a, b) => b[1] - a[1]);
      for (const [reason, count] of entries) {
        console.log(`  - ${reason}: ${count}`);
      }
    }

    if (dryRun) {
      console.log('\nNo changes were written. Re-run with --apply to persist updates.');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error('❌ Plan migration failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => undefined);
    });
}
