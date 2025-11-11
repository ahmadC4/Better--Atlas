import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import { runMigrations, verifyDatabaseConnection } from "./migrations.js";
import { ensureActiveReleaseHasTemplates } from "./release-init.js";
import { storage } from "./storage/index.js";
import { ensureSupportUserFromEnv } from "./bootstrap.js";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Health check endpoint - responds immediately for Autoscale health checks
let isReady = false;
let initError: Error | null = null;

app.get('/health', (_req: Request, res: Response) => {
  if (initError) {
    res.status(503).json({ status: 'error', message: initError.message });
  } else if (isReady) {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(200).json({ status: 'initializing' });
  }
});

// Session middleware is configured in localAuth.ts via setupAuth()

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  let server: any;
  
  try {
    // Register routes first (without waiting for DB)
    server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message, detail: err instanceof Error ? err.message : undefined });
      if (status >= 500) {
        console.error("Unhandled error:", err);
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    
    // Start listening IMMEDIATELY - critical for Autoscale health checks
    server.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );

    // Run expensive initialization in background after server is listening
    (async () => {
      try {
        log('Starting background initialization...');
        await runMigrations();
        await verifyDatabaseConnection();
        await ensureActiveReleaseHasTemplates();
        // Seed/update support user from env if provided
        try {
          await ensureSupportUserFromEnv(storage as any);
        } catch (seedErr) {
          log(`Support user seed skipped: ${(seedErr as Error).message}`);
        }
        isReady = true;
        log('Background initialization complete - server ready');
      } catch (error) {
        initError = error as Error;
        log(`Background initialization failed: ${(error as Error).message}`);
        // Don't exit - let health check report the error
      }
    })();

  } catch (error) {
    console.error("Failed to start Atlas AI server:", error);
    process.exit(1);
  }
})();
