import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cookieParser from "cookie-parser";

// Reuse the existing Express routes from the server codebase
import { registerRoutes } from "../server/routes.js";
import { runMigrations, verifyDatabaseConnection } from "../server/migrations.js";

let app: ReturnType<typeof express> | null = null;
let initPromise: Promise<void> | null = null;

async function initApp() {
  if (app) return;

  const instance = express();
  instance.use(express.json({ limit: "10mb" }));
  instance.use(express.urlencoded({ extended: false, limit: "10mb" }));
  instance.use(cookieParser());

  // Mount all API routes and middleware
  await registerRoutes(instance);

  // Best-effort: ensure DB schema exists in serverless cold start
  try {
    if (process.env.SKIP_DB_MIGRATIONS !== "true") {
      await runMigrations();
    }
    await verifyDatabaseConnection();
  } catch (err) {
    console.warn("Serverless DB init warning:", (err as Error)?.message);
  }

  app = instance;
  console.log("Vercel serverless API initialized");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!initPromise) {
    initPromise = initApp().catch((err) => {
      // Surface initialization failures once, then allow subsequent requests to retry init
      initPromise = null;
      console.error("Failed to initialize serverless API:", err);
      // Best-effort error response
      res.status(500).json({ message: "API initialization failed", detail: (err as Error)?.message });
    }) as Promise<void>;
  }

  // Ensure the app is ready before handling the request
  await initPromise;
  if (!app) {
    // If initialization failed above, app might still be null
    return; // response already sent with error
  }

  // Delegate handling to the Express app
  (app as any)(req, res);
}
