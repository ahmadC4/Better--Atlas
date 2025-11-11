# Deploying to Vercel

This repository was originally set up to run a bundled Express + Vite app (Replit-friendly).
The repo now includes a Vercel serverless entrypoint so you can deploy the UI and API on Vercel with zero framework migration.

## Overview

- UI: Built with Vite and served as static assets from `dist/public`.
- API: Your existing Express app runs inside a single Vercel Serverless Function at `/api/*` (catch‑all).

Key files added for Vercel:

- `api/[...all].ts` – wraps the Express app as a serverless handler and mounts all existing routes
- `api/health.ts` – lightweight health endpoint
- `vercel.json` – configures build and output directory

No routes/code were removed – local development remains unchanged.

## One‑Time Setup

1. Push this repo to GitHub/GitLab/Bitbucket (or connect your existing repo) and import it to Vercel.
2. In Vercel Project Settings → Build & Output Settings:
   - Build Command: `npm run build`
   - Output Directory: `dist/public`
3. In Vercel Project Settings → Environment Variables, configure values from `.env.example`:
- Required: `SESSION_SECRET`, `DATABASE_URL`
- Recommended: `API_KEY_ENCRYPTION_KEY`
- Optional provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, etc.
- Optional: `SKIP_DB_MIGRATIONS` (defaults to false)

Seeding an admin user (optional during first deploy):

- `SUPPORT_USER_EMAIL` and `SUPPORT_USER_PASSWORD` can be set to automatically create/update a support admin account on cold start. Optionally set `SUPPORT_USER_ROLE` (`super_admin` by default) and `SUPPORT_USER_PLAN` (`pro` by default if available).

Notes:

- Use a managed Postgres (e.g. Neon/Supabase). Ensure `?sslmode=require` if required by your provider.
- Sessions are stored in Postgres via `connect-pg-simple`, so they work across serverless invocations.

## Routing Behavior

- All client routes are served statically from `dist/public`.
- All API requests go to the serverless Express app via `api/[...all].ts`:
  - Examples: `/api/auth/login`, `/api/chats`, `/api/knowledge/*`, etc.
- Health check:
  - `/api/health` verifies DB when `DATABASE_URL` is set and returns `{ status: "ok", now }`.
  - If `DATABASE_URL` is not set, it returns `{ status: "ok" }`.
  - On DB connection errors, it responds `503` with `{ status: "error" }`.

## Local Development

- Full‑stack dev (existing behavior): `npm run dev`
  - Starts the Express server with Vite middleware (HMR enabled)
- Type‑checking: `npm run check`
- Production build (UI + server bundle for non‑Vercel targets): `npm run build`

## Migration Notes

- No Next.js migration is required. The Express API is reused as‑is.
- The server build (`dist/index.js`) is not used on Vercel; only the static UI (`dist/public`) and the serverless function in `api/` are deployed.

## Troubleshooting

- 500 on API routes: Verify `SESSION_SECRET` and `DATABASE_URL` are set in Vercel.
- DB/migration issues: Check logs; set `SKIP_DB_MIGRATIONS=true` temporarily if needed, then run migrations manually and unset.
- Large uploads: Vercel serverless has request size limits; consider signed URLs to S3 if you hit limits.
