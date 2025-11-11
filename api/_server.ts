import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../server/routes.js";
import { runMigrations, verifyDatabaseConnection } from "../server/migrations.js";
import { storage } from "../server/storage/index.js";
import { ensureSupportUserFromEnv } from "../server/bootstrap.js";

let app: ReturnType<typeof express> | null = null;
let initPromise: Promise<void> | null = null;

async function init() {
  if (app) return;
  const instance = express();
  instance.use(express.json({ limit: "10mb" }));
  instance.use(express.urlencoded({ extended: false, limit: "10mb" }));
  instance.use(cookieParser());

  await registerRoutes(instance);

  try {
    if (process.env.SKIP_DB_MIGRATIONS !== "true") {
      await runMigrations();
    }
    await verifyDatabaseConnection();
    // Optional: seed/update a support admin user from env (if provided)
    try {
      await ensureSupportUserFromEnv(storage as any);
    } catch (seedErr) {
      console.warn("[api/_server] support user seed skipped:", (seedErr as Error)?.message ?? seedErr);
    }
  } catch (err) {
    const message = (err as Error)?.message ?? 'unknown error';
    console.warn("[api/_server] DB init warning:", message);
  }

  app = instance;
}

export async function getServerApp() {
  if (!initPromise) {
    // Surface environment for debugging without leaking secrets
    const redactedDb = (process.env.DATABASE_URL || '').replace(/:\w+@/, ':***@');
    console.log('[api/_server] init start', {
      nodeEnv: process.env.NODE_ENV,
      hasSessionSecret: Boolean(process.env.SESSION_SECRET),
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      databaseUrlHost: redactedDb ? new URL(redactedDb).host : undefined,
    });

    // Global guards
    process.on('unhandledRejection', (reason: any) => {
      console.error('[api/_server] unhandledRejection', reason?.message || reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('[api/_server] uncaughtException', err?.message || err);
    });

    initPromise = init().catch((e) => {
      initPromise = null;
      console.error('[api/_server] init failed', (e as Error)?.message || e);
      throw e;
    });
  }
  await initPromise;
  if (!app) throw new Error("API not initialized");
  return app;
}
