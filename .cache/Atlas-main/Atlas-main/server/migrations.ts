import fs from "node:fs";
import path from "node:path";

import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { db, pool } from "./db";
import { log } from "./vite";

const MIGRATIONS_SCOPE = "migrations";
const FALLBACK_MIGRATIONS_TABLE = "atlas_migrations";

let migrationsPromise: Promise<void> | null = null;

function resolveMigrationsFolder(): string | null {
  const configured = process.env.DRIZZLE_MIGRATIONS_FOLDER;
  const dirname = path.dirname(new URL(import.meta.url).pathname);
  const candidate = configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(dirname, "..", "migrations");

  if (!fs.existsSync(candidate)) {
    log(
      `Skipping migrations: folder not found at ${candidate}`,
      MIGRATIONS_SCOPE,
    );
    return null;
  }

  return candidate;
}

function hasDrizzleJournal(folder: string): boolean {
  const journalPath = path.join(folder, "meta", "_journal.json");
  return fs.existsSync(journalPath);
}

async function applySqlMigrations(folder: string): Promise<number> {
  const entries = fs
    .readdirSync(folder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (entries.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${FALLBACK_MIGRATIONS_TABLE} (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    let appliedCount = 0;

    for (const entry of entries) {
      const filePath = path.join(folder, entry);
      const migrationName = path.basename(entry);

      const { rowCount } = await client.query(
        `SELECT 1 FROM ${FALLBACK_MIGRATIONS_TABLE} WHERE name = $1`,
        [migrationName],
      );

      if (rowCount && rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(filePath, "utf8");
      if (sql.trim().length === 0) {
        await client.query(
          `INSERT INTO ${FALLBACK_MIGRATIONS_TABLE} (name) VALUES ($1)`,
          [migrationName],
        );
        continue;
      }

      let transactionActive = false;
      try {
        await client.query("BEGIN");
        transactionActive = true;
        await client.query(sql);
        await client.query(
          `INSERT INTO ${FALLBACK_MIGRATIONS_TABLE} (name) VALUES ($1)`,
          [migrationName],
        );
        await client.query("COMMIT");
        transactionActive = false;
        appliedCount += 1;
        log(`Applied SQL migration ${migrationName}`, MIGRATIONS_SCOPE);
      } catch (error) {
        if (transactionActive) {
          await client.query("ROLLBACK");
        }
        throw error;
      }
    }

    return appliedCount;
  } finally {
    client.release();
  }
}

async function applyMigrations() {
  const folder = resolveMigrationsFolder();
  if (!folder) {
    return;
  }

  if (hasDrizzleJournal(folder)) {
    const start = Date.now();
    await migrate(db, { migrationsFolder: folder });
    const duration = Date.now() - start;
    log(`Applied database migrations in ${duration}ms`, MIGRATIONS_SCOPE);
    return;
  }

  const start = Date.now();
  const appliedCount = await applySqlMigrations(folder);
  const duration = Date.now() - start;

  if (appliedCount > 0) {
    log(
      `Applied ${appliedCount} SQL migration${appliedCount === 1 ? "" : "s"} in ${duration}ms`,
      MIGRATIONS_SCOPE,
    );
  } else {
    log(`No SQL migrations to apply`, MIGRATIONS_SCOPE);
  }
}

export async function runMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === "true") {
    log("SKIP_DB_MIGRATIONS is true; skipping migrations", MIGRATIONS_SCOPE);
    return;
  }

  if (process.env.REPLIT_DEPLOYMENT) {
    log("REPLIT_DEPLOYMENT detected; skipping migrations in production", MIGRATIONS_SCOPE);
    return;
  }

  if (!process.env.DATABASE_URL) {
    log("DATABASE_URL is not set; skipping migrations", MIGRATIONS_SCOPE);
    return;
  }

  if (migrationsPromise) {
    return migrationsPromise;
  }

  migrationsPromise = applyMigrations().catch((error) => {
    const errorMessage = (error as Error).message;
    log(`Migration failed: ${errorMessage}`, MIGRATIONS_SCOPE);
    throw error;
  });

  try {
    await migrationsPromise;
  } finally {
    migrationsPromise = null;
  }
}

export async function verifyDatabaseConnection(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const { rows } = await pool.query<{ now: string }>("select now() as now");
    log(`Database connection verified at ${rows[0]?.now ?? "unknown time"}`, "db");
  } catch (error) {
    log(`Database connection check failed: ${(error as Error).message}`, "db");
    throw error;
  }
}
