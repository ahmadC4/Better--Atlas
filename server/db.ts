import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema.js";
import fs from 'fs';
import { EMBEDDED_DATABASE_URL } from './db-embedded.js';

function getDatabaseUrl(): string {
  const replitDbPath = '/tmp/replitdb';

  if (fs.existsSync(replitDbPath)) {
    try {
      const url = fs.readFileSync(replitDbPath, 'utf-8').trim();
      if (url) {
        return url;
      }
    } catch (error) {
      console.warn('Failed to read DATABASE_URL from /tmp/replitdb:', error);
    }
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL as string;
  }

  // Construct from discrete PG* env vars if provided
  const host = (process.env.PGHOST || '').trim();
  const database = (process.env.PGDATABASE || '').trim();
  const user = (process.env.PGUSER || '').trim();
  const password = (process.env.PGPASSWORD || '').trim();
  const port = (process.env.PGPORT || '').trim();
  const sslMode = (process.env.PGSSLMODE || '').trim();
  if (host && database) {
    const auth = user ? `${encodeURIComponent(user)}${password ? ':' + encodeURIComponent(password) : ''}@` : '';
    const p = port || '5432';
    const query = sslMode ? `?sslmode=${encodeURIComponent(sslMode)}` : '';
    return `postgresql://${auth}${host}:${p}/${database}${query}`;
  }

  const embedded = (EMBEDDED_DATABASE_URL || '').trim();
  if (embedded) {
    return embedded;
  }

  throw new Error(
    "DATABASE_URL must be set. Provide it via env, /tmp/replitdb, or EMBEDDED_DATABASE_URL in server/db-embedded.ts. Alternatively set PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, and optional PGSSLMODE.",
  );
}

const databaseUrl = getDatabaseUrl();

const sslOption = (() => {
  if (databaseUrl.includes('neon.tech')) return true;
  if (databaseUrl.includes('sslmode=require')) return { rejectUnauthorized: false } as const;
  return undefined;
})();

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslOption as any,
});
export const db = drizzle(pool, { schema });
