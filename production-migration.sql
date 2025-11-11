-- ============================================================================
-- PRODUCTION DATABASE MIGRATION SCRIPT
-- ============================================================================
-- Purpose: Migrate plans, models, and coupon schema from development to production
-- Date: October 19, 2025
-- 
-- INSTRUCTIONS:
-- 1. Open Replit Database Pane
-- 2. Switch to PRODUCTION database
-- 3. Copy and paste this entire script
-- 4. Execute the script
-- 5. Verify data in production
-- ============================================================================

-- ============================================================================
-- SECTION 1: PLANS (Free, Pro, Enterprise)
-- ============================================================================

-- Safety check: Delete existing plans if they exist (to avoid conflicts)
DELETE FROM plans WHERE slug IN ('free', 'pro', 'enterprise');

-- Insert Free Plan
INSERT INTO plans (
  id, name, tier, description,
  allow_experts, allow_templates, allow_models,
  allow_kb_system, allow_kb_org, allow_kb_team, allow_kb_user,
  allow_memory, allow_agents, allow_api_access,
  show_experts_upsell, show_templates_upsell, show_api_upsell,
  daily_message_limit, max_file_size_mb, storage_quota_gb,
  models_allowed, experts_allowed, templates_allowed,
  price_monthly_usd, price_annual_usd,
  is_active, slug, is_pro_tier,
  created_at, updated_at
) VALUES (
  '61ad484a-8e68-48c2-9ab0-0202c126e815',
  'Free',
  'free',
  'Basic plan with limited features',
  false, false, true,  -- allow_experts, allow_templates, allow_models
  true, false, false, true,  -- KB permissions: system, org, team, user
  false, false, false,  -- allow_memory, allow_agents, allow_api_access
  true, true, true,  -- show upsells
  10, 10, 1,  -- daily_message_limit, max_file_size_mb, storage_quota_gb
  '["gpt-5-mini", "claude-4.5-haiku", "llama-3.1-8b"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  0, 0,  -- price_monthly_usd, price_annual_usd
  true, 'free', false,  -- is_active, slug, is_pro_tier
  NOW(), NOW()
);

-- Insert Pro Plan
INSERT INTO plans (
  id, name, tier, description,
  allow_experts, allow_templates, allow_models,
  allow_kb_system, allow_kb_org, allow_kb_team, allow_kb_user,
  allow_memory, allow_agents, allow_api_access,
  show_experts_upsell, show_templates_upsell, show_api_upsell,
  daily_message_limit, max_file_size_mb, storage_quota_gb,
  models_allowed, experts_allowed, templates_allowed,
  price_monthly_usd, price_annual_usd,
  is_active, slug, is_pro_tier,
  created_at, updated_at
) VALUES (
  '4b685e76-c8be-4481-ac46-2542047fb3d7',
  'Pro',
  'pro',
  'Professional plan with advanced features',
  true, true, true,  -- allow_experts, allow_templates, allow_models
  true, true, false, true,  -- KB permissions: system, org, team, user
  true, false, false,  -- allow_memory, allow_agents, allow_api_access
  false, false, false,  -- show upsells
  NULL, 100, 10,  -- daily_message_limit (unlimited), max_file_size_mb, storage_quota_gb
  '["gpt-5", "gpt-5-mini", "claude-4.5-sonnet", "claude-4.5-haiku", "llama-3.1-70b", "llama-3.1-8b"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  20, 200,  -- price_monthly_usd, price_annual_usd
  true, 'pro', false,  -- is_active, slug, is_pro_tier
  NOW(), NOW()
);

-- Insert Enterprise Plan
INSERT INTO plans (
  id, name, tier, description,
  allow_experts, allow_templates, allow_models,
  allow_kb_system, allow_kb_org, allow_kb_team, allow_kb_user,
  allow_memory, allow_agents, allow_api_access,
  show_experts_upsell, show_templates_upsell, show_api_upsell,
  daily_message_limit, max_file_size_mb, storage_quota_gb,
  models_allowed, experts_allowed, templates_allowed,
  price_monthly_usd, price_annual_usd,
  is_active, slug, is_pro_tier,
  created_at, updated_at
) VALUES (
  '9f791bf3-6762-4226-9b02-c410e146cb94',
  'Enterprise',
  'enterprise',
  'Enterprise plan with all features and teams',
  true, true, true,  -- allow_experts, allow_templates, allow_models
  true, true, true, true,  -- KB permissions: system, org, team, user (full access)
  true, true, true,  -- allow_memory, allow_agents, allow_api_access
  false, false, false,  -- show upsells
  NULL, 1000, 100,  -- daily_message_limit (unlimited), max_file_size_mb, storage_quota_gb
  '[]'::jsonb,  -- Empty array = all models allowed
  '[]'::jsonb,
  '[]'::jsonb,
  100, 1000,  -- price_monthly_usd, price_annual_usd
  true, 'enterprise', false,  -- is_active, slug, is_pro_tier
  NOW(), NOW()
);


-- ============================================================================
-- SECTION 2: AI MODELS (11 models across 4 providers)
-- ============================================================================

-- Safety check: Delete existing models if they exist (to avoid conflicts)
DELETE FROM models WHERE id IN (
  '30d96dcd-820e-4ceb-83f1-af9195931729',
  '38036003-a72d-435f-af18-e1261a556512',
  'f67aa0a0-1303-4693-b512-b4796226e030',
  '8c4d59cb-9445-4777-9503-8e439749bc39',
  '2cb1056c-25d0-4185-9804-89333e72ccc8',
  '79bf7302-3f4a-48ee-a9cb-e3169976c027',
  '3df76f3c-aa19-40e1-bf87-515a46ff092e',
  'edd6a8e6-28fc-4634-b74b-cd9be2b8803a',
  '9838b04a-16ea-40f6-a92a-36277e0d887e',
  '45915059-64aa-46dc-b239-903d4fe42a53',
  'fe0bf43c-6c00-4121-b4bd-4a31b630c679'
);

-- Anthropic Models (3)
INSERT INTO models (id, provider, model_id, display_name, description, capabilities, base_pricing, context_window, max_output_tokens, is_active, created_at, updated_at)
VALUES 
  ('30d96dcd-820e-4ceb-83f1-af9195931729', 'anthropic', 'claude-3-opus', 'Claude 3 Opus', 'Previous generation top-tier Claude model',
   '{"web": false, "code": true, "audio": false, "vision": true, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.015, "output_per_1k_usd": 0.075}'::jsonb,
   200000, 4096, true, NOW(), NOW()),
   
  ('38036003-a72d-435f-af18-e1261a556512', 'anthropic', 'claude-4.5-haiku', 'Claude 4.5 Haiku', 'Fast and cost-effective Claude model',
   '{"web": false, "code": true, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.00025, "output_per_1k_usd": 0.00125}'::jsonb,
   200000, 8192, true, NOW(), NOW()),
   
  ('f67aa0a0-1303-4693-b512-b4796226e030', 'anthropic', 'claude-4.5-sonnet', 'Claude 4.5 Sonnet', 'Most intelligent Claude model with advanced analysis',
   '{"web": false, "code": true, "audio": false, "vision": true, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.003, "output_per_1k_usd": 0.015}'::jsonb,
   200000, 8192, true, NOW(), NOW());

-- Groq Models (3)
INSERT INTO models (id, provider, model_id, display_name, description, capabilities, base_pricing, context_window, max_output_tokens, is_active, created_at, updated_at)
VALUES 
  ('8c4d59cb-9445-4777-9503-8e439749bc39', 'groq', 'llama-3.1-70b', 'Llama 3.1 70B', 'Large open-source model with fast inference',
   '{"web": false, "code": true, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.00059, "output_per_1k_usd": 0.00079}'::jsonb,
   131072, 8192, true, NOW(), NOW()),
   
  ('2cb1056c-25d0-4185-9804-89333e72ccc8', 'groq', 'llama-3.1-8b', 'Llama 3.1 8B', 'Smaller Llama model with very fast inference',
   '{"web": false, "code": true, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.00005, "output_per_1k_usd": 0.00008}'::jsonb,
   131072, 8192, true, NOW(), NOW()),
   
  ('79bf7302-3f4a-48ee-a9cb-e3169976c027', 'groq', 'mixtral-8x7b', 'Mixtral 8x7B', 'Mixture of experts model with good performance',
   '{"web": false, "code": true, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.00024, "output_per_1k_usd": 0.00024}'::jsonb,
   32768, 8192, true, NOW(), NOW());

-- OpenAI Models (3)
INSERT INTO models (id, provider, model_id, display_name, description, capabilities, base_pricing, context_window, max_output_tokens, is_active, created_at, updated_at)
VALUES 
  ('3df76f3c-aa19-40e1-bf87-515a46ff092e', 'openai', 'gpt-4-turbo', 'GPT-4 Turbo', 'Previous generation with vision capabilities',
   '{"web": false, "code": true, "audio": false, "vision": true, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.01, "output_per_1k_usd": 0.03}'::jsonb,
   128000, 4096, true, NOW(), NOW()),
   
  ('edd6a8e6-28fc-4634-b74b-cd9be2b8803a', 'openai', 'gpt-5', 'GPT-5', 'Most capable OpenAI model with advanced reasoning',
   '{"web": true, "code": true, "audio": true, "vision": true, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.015, "output_per_1k_usd": 0.06}'::jsonb,
   128000, 16384, true, NOW(), NOW()),
   
  ('9838b04a-16ea-40f6-a92a-36277e0d887e', 'openai', 'gpt-5-mini', 'GPT-5 Mini', 'Smaller, faster, and more cost-effective GPT-5 variant',
   '{"web": true, "code": true, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.0003, "output_per_1k_usd": 0.0015}'::jsonb,
   128000, 16384, true, NOW(), NOW());

-- Perplexity Models (2)
INSERT INTO models (id, provider, model_id, display_name, description, capabilities, base_pricing, context_window, max_output_tokens, is_active, created_at, updated_at)
VALUES 
  ('45915059-64aa-46dc-b239-903d4fe42a53', 'perplexity', 'sonar-large', 'Sonar Large', 'Advanced model with web search capabilities',
   '{"web": true, "code": false, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.001, "output_per_1k_usd": 0.001}'::jsonb,
   127000, 4096, true, NOW(), NOW()),
   
  ('fe0bf43c-6c00-4121-b4bd-4a31b630c679', 'perplexity', 'sonar-small', 'Sonar Small', 'Fast search-enabled model',
   '{"web": true, "code": false, "audio": false, "vision": false, "streaming": true}'::jsonb,
   '{"input_per_1k_usd": 0.0002, "output_per_1k_usd": 0.0002}'::jsonb,
   127000, 4096, true, NOW(), NOW());

-- ============================================================================
-- SECTION 3: COUPON TABLES VERIFICATION
-- ============================================================================
-- Note: Coupon tables should already exist from Drizzle migrations.
-- If they don't exist in production, run: npm run db:push
-- These tables are: pro_coupons, pro_coupon_redemptions
-- 
-- No coupon data exists in development, so no records to migrate.
-- ============================================================================

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify plans were inserted
SELECT COUNT(*) as plan_count, 
       STRING_AGG(name, ', ' ORDER BY name) as plan_names
FROM plans
WHERE slug IN ('free', 'pro', 'enterprise');

-- Verify models were inserted
SELECT provider, COUNT(*) as model_count
FROM models
WHERE is_active = true
GROUP BY provider
ORDER BY provider;

-- Verify total model count
SELECT COUNT(*) as total_active_models
FROM models
WHERE is_active = true;

-- Verify coupon tables exist
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pro_coupons') 
    THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as pro_coupons_table_status,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pro_coupon_redemptions') 
    THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as pro_coupon_redemptions_table_status;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Expected results:
-- - 3 plans (Free, Pro, Enterprise)
-- - 11 active models (3 Anthropic, 3 Groq, 3 OpenAI, 2 Perplexity)
-- - Coupon tables should exist (created by Drizzle migrations)
-- ============================================================================
