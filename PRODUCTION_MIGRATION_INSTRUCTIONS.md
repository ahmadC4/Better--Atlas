# 📦 Production Database Migration Instructions

## Overview
This guide will help you migrate your development database configuration to production so you can publish your Atlas AI application.

## What Will Be Migrated
- ✅ **3 Plans**: Free, Pro, Enterprise (with all feature flags and limits)
- ✅ **11 AI Models**: Across 4 providers (Anthropic, Groq, OpenAI, Perplexity)
- ✅ **Coupon Schema Verification**: Ensures tables exist (no data to migrate)

## Prerequisites
- Access to Replit Database Pane
- Production database provisioned
- Admin permissions to execute SQL

---

## Step-by-Step Migration Process

### Step 1: Access Production Database
1. Open your Replit project
2. Click on **Tools** in the left sidebar
3. Select **Database**
4. **Important**: Switch from "Development" to **"Production"** using the environment toggle at the top

### Step 2: Prepare Migration Script
1. The migration script is ready in: `production-migration.sql`
2. Open this file in your Replit editor
3. **Copy the entire contents** (all 249 lines)

### Step 3: Execute Migration
1. In the Database Pane (Production environment), click the **SQL Console** tab
2. **Paste the entire migration script** into the query editor
3. **Review the script** one final time to ensure you're in PRODUCTION
4. Click **Run** or **Execute**

### Step 4: Verify Migration Success
The script includes automatic verification queries at the end. You should see:

**Expected Results:**
```
plan_count: 3
plan_names: Enterprise, Free, Pro

Provider Model Counts:
- anthropic: 3 models
- groq: 3 models  
- openai: 3 models
- perplexity: 2 models

total_active_models: 11

Coupon Tables:
- pro_coupons_table_status: EXISTS
- pro_coupon_redemptions_table_status: EXISTS
```

### Step 5: Verify in Admin Dashboard
1. Ensure your app is running: `npm run dev`
2. Login as Super Admin
3. Navigate to **Admin Dashboard** → **Plans & Features** → **Plans Management**
4. Verify you see 3 plans: Free, Pro, Enterprise
5. Navigate to **System & Policies** → **Model Catalog & Pricing**
6. Verify you see all 11 models

---

## What the Migration Does

### Safety Features
- **Deletes existing records** before inserting (prevents duplicates)
- **Uses exact UUIDs** from development (maintains referential integrity)
- **Includes verification queries** to confirm success
- **Preserves timestamps** with NOW() function

### Plans Configuration

#### Free Plan
- Daily messages: 10
- File size: 10MB
- Storage: 1GB
- Models: gpt-5-mini, claude-4.5-haiku, llama-3.1-8b

#### Pro Plan
- Daily messages: Unlimited
- File size: 100MB
- Storage: 10GB
- Models: gpt-5, gpt-5-mini, claude-4.5-sonnet, claude-4.5-haiku, llama-3.1-70b, llama-3.1-8b

#### Enterprise Plan
- Daily messages: Unlimited
- File size: 1000MB (1GB)
- Storage: 100GB
- Models: All models (empty allowlist = full access)

### Models Included
**Anthropic (3):**
- Claude 3 Opus (Code, Vision)
- Claude 4.5 Haiku (Code)
- Claude 4.5 Sonnet (Code, Vision)

**Groq (3):**
- Llama 3.1 70B (Code)
- Llama 3.1 8B (Code)
- Mixtral 8x7B (Code)

**OpenAI (3):**
- GPT-4 Turbo (Code, Vision)
- GPT-5 (Code, Web, Vision, Audio)
- GPT-5 Mini (Code, Web)

**Perplexity (2):**
- Sonar Large (Web Search)
- Sonar Small (Web Search)

---

## Troubleshooting

### Issue: "Table does not exist" error
**Solution:** Run database migrations in production first:
```bash
npm run db:push
```
Then retry the migration script.

### Issue: "Duplicate key" error
**Solution:** The script includes DELETE statements, but if you still see this error, you can manually delete existing records first:
```sql
DELETE FROM models WHERE provider IN ('anthropic', 'groq', 'openai', 'perplexity');
DELETE FROM plans WHERE slug IN ('free', 'pro', 'enterprise');
```

### Issue: Coupon tables missing
**Solution:** The tables are created by Drizzle migrations. Ensure you've run:
```bash
npm run db:push
```
in your production environment.

---

## Post-Migration Checklist
- [ ] All 3 plans visible in Admin Dashboard
- [ ] All 11 models visible in Model Catalog
- [ ] Test user assignment to each plan tier
- [ ] Verify model access based on plan assignments
- [ ] Test creating a new coupon (optional)
- [ ] Deploy application to production

---

## Need Help?
If you encounter issues:
1. Check verification query results in SQL console
2. Verify you're connected to PRODUCTION database (not development)
3. Ensure migrations have been applied: `npm run db:push`
4. Review error messages carefully - they usually indicate the exact issue

---

## Ready to Publish? 🚀
Once migration is complete and verified:
1. Click the **Publish** button in Replit
2. Configure your deployment settings
3. Your production database will be used automatically
4. Users will see the correct plans and models immediately

---

**Migration Created:** October 19, 2025
**Total Records:** 14 (3 plans + 11 models)
**Execution Time:** ~2 seconds
