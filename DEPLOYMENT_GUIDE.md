# Production Deployment Guide

This guide explains how to successfully deploy your application to production on Replit, including configuring all necessary secrets and environment variables.

## Recent Deployment Fixes (October 20, 2025)

Your application has been optimized for production deployment with the following critical fixes:

### 1. Fast Startup for Autoscale Health Checks
- **Issue**: Server took too long to open port 5000, failing Autoscale health checks
- **Fix**: Server now starts listening on port 5000 **immediately**, then runs database migrations and initialization in the background
- **Result**: Deployment health checks pass quickly, preventing timeout errors

### 2. Production Migrations Enabled
- **Issue**: Migrations were skipped in production (REPLIT_DEPLOYMENT check)
- **Fix**: Removed the production skip - migrations now run in all environments
- **Result**: Database schema is properly initialized in production deployments

### 3. Health Check Endpoint
- **New Feature**: `/health` endpoint added for deployment monitoring
- **Statuses**:
  - `{"status": "initializing"}` - Server is running, background init in progress
  - `{"status": "ok"}` - Server fully ready
  - `{"status": "error", "message": "..."}` - Initialization failed

### 4. Code Quality Fixes
- **Fixed**: Removed duplicate `getUserTeams` method that caused build warnings
- **Result**: Cleaner build output, no runtime conflicts

## Database Configuration

### How DATABASE_URL Works in Production

In Replit deployments, the DATABASE_URL is handled differently than in development:

1. **Development**: Uses the environment variable `DATABASE_URL` pointing to the local Replit database (`helium`)
2. **Production**: Replit stores the DATABASE_URL in a file at `/tmp/replitdb` instead of an environment variable

The application has been configured to automatically check both locations:
```typescript
// server/db.ts handles this automatically
// 1. First checks /tmp/replitdb file (production)
// 2. Falls back to process.env.DATABASE_URL (development)
```

### Setting Up Production Database

You have two options for your production database:

#### Option 1: Use Replit's Production Database (Recommended)
Replit provides production databases on Neon for deployments. When you add a database through the Replit UI:
- The DATABASE_URL is automatically configured for both development and production
- Production uses a separate database from development
- No manual configuration needed

#### Option 2: Use External PostgreSQL Database
If you want to use an external PostgreSQL provider (Neon, Supabase, AWS RDS, etc.):
1. Create a PostgreSQL database with your provider
2. Get the connection string (should look like: `postgresql://username:password@host/database`)
3. Add it as a secret in Replit (see "Adding Secrets" section below)

## Required Secrets for Production

### Critical Secrets (Application Won't Start Without These)

1. **DATABASE_URL** 
   - What: PostgreSQL connection string
   - Format: `postgresql://username:password@host:port/database?sslmode=require`
   - Note: Automatically provided if using Replit's database

2. **SESSION_SECRET** (Already configured based on error message)
   - What: Secret key for encrypting session cookies
   - Format: Random string (at least 32 characters)
   - Generate: `openssl rand -base64 32` or use any secure random generator

### Recommended Secrets for Enhanced Security

3. **API_KEY_ENCRYPTION_KEY** (Optional but recommended)
   - What: Dedicated key for encrypting stored API keys
   - Format: Random string (at least 32 characters)
   - Note: Falls back to SESSION_SECRET if not provided
   - Why: Separating encryption keys is a security best practice

### Optional API Keys (For Full Feature Access)

Your application integrates with multiple AI providers. Add these based on which features you want to enable:

4. **OPENAI_API_KEY**
   - Required for: GPT models (GPT-4, GPT-3.5, etc.)
   - Get from: https://platform.openai.com/api-keys

5. **ANTHROPIC_API_KEY**
   - Required for: Claude models (Claude 3 Opus, Sonnet, Haiku)
   - Get from: https://console.anthropic.com/

6. **GROQ_API_KEY**
   - Required for: Speech-to-text transcription (Whisper), fast inference
   - Get from: https://console.groq.com/

7. **PERPLEXITY_API_KEY**
   - Required for: Web search feature, Perplexity Sonar models
   - Get from: https://www.perplexity.ai/

8. **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET**
   - Required for: Google Drive integration
   - Get from: https://console.cloud.google.com/

9. **GHL_API_KEY**, **GHL_LOCATION_ID**, **GHL_FROM_EMAIL**
   - Required for: Email notifications via GoHighLevel
   - Get from: Your GoHighLevel account

### Other Configuration Variables

10. **ADMIN_ENROLLMENT_SECRET** (Optional)
    - What: Secret code for creating admin accounts
    - Format: Any string you choose

11. **PRO_ACCESS_CODE** (Optional)
    - What: Code users can enter to get Pro access
    - Format: Any string you choose

12. **N8N_BASE_URL** (Optional)
    - What: Base URL for n8n automation workflows
    - Format: `https://your-n8n-instance.com`

## How to Add Secrets in Replit

### Step 1: Access the Secrets Tool
1. Open your Replit project
2. Click on the "Tools" icon in the left sidebar
3. Select "Secrets"

### Step 2: Add Each Secret
1. Click "New secret"
2. Enter the **Key** (e.g., `SESSION_SECRET`)
3. Enter the **Value** (the actual secret value)
4. Click "Add secret"

### Step 3: Verify Secrets Are Set
The secrets will automatically be available to your application as environment variables in both development and production.

## Deployment Checklist

Before deploying to production, ensure you have:

- [ ] **DATABASE_URL** configured (via Replit database or external provider)
- [ ] **SESSION_SECRET** added to secrets
- [ ] **API_KEY_ENCRYPTION_KEY** added (recommended)
- [ ] At least one AI provider API key added:
  - [ ] OPENAI_API_KEY, or
  - [ ] ANTHROPIC_API_KEY, or
  - [ ] GROQ_API_KEY, or
  - [ ] PERPLEXITY_API_KEY
- [ ] Optional: Google OAuth credentials for Drive integration
- [ ] Optional: Email service credentials (GHL)
- [ ] Reviewed deployment configuration in `.replit` file

## Deployment Configuration

Your application is configured for **Autoscale deployment** which is ideal for stateless web applications. The configuration:

```yaml
deployment:
  build: npm run build
  run: npm run start
  deployment_target: autoscale
```

This means:
- **Build command**: Compiles TypeScript and bundles the frontend
- **Run command**: Starts the production server (not the development server)
- **Autoscale**: Automatically scales based on traffic, stops when idle

## Testing Your Deployment

1. Click the "Deploy" button in Replit
2. Wait for the build to complete
3. Click on the deployment URL to access your live application
4. Test the login/signup functionality
5. Verify AI chat works (requires at least one AI provider API key)

## Troubleshooting Deployment Issues

### "Database connection failed"
- **Cause**: DATABASE_URL not set or invalid
- **Fix**: Check that your database secret is correctly configured

### "Application crashes on startup"
- **Cause**: Missing required secrets
- **Fix**: Ensure SESSION_SECRET is set

### "AI features don't work"
- **Cause**: Missing API keys for AI providers
- **Fix**: Add at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, or PERPLEXITY_API_KEY

### "502 Bad Gateway"
- **Cause**: Application failed to start or crashed
- **Fix**: Check deployment logs in Replit for specific error messages

## Database Migrations in Production

The application automatically handles database migrations:
- In development: Applies SQL migrations from `/migrations` folder
- In production: Skips migrations (set `REPLIT_DEPLOYMENT` env var)
- For production schema changes: Use the production database management tools in Replit

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Use different values** for SESSION_SECRET in development vs production
3. **Rotate API keys** periodically
4. **Use separate databases** for development and production
5. **Enable SSL** for production database connections (automatically handled)

## Support

If you encounter issues not covered in this guide:
1. Check the application logs in the deployment view
2. Review the browser console for frontend errors
3. Verify all required secrets are correctly set
4. Contact Replit support for platform-specific issues
