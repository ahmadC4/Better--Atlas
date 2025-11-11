CREATE TABLE IF NOT EXISTS "releases" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" integer NOT NULL,
  "label" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "change_notes" text,
  "system_prompt_id" varchar REFERENCES "system_prompts"("id") ON DELETE SET NULL,
  "expert_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "template_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "output_template_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tool_policy_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT false,
  "published_at" timestamp,
  "published_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "releases_version_key" ON "releases" ("version");
CREATE INDEX IF NOT EXISTS "releases_active_idx" ON "releases" ("is_active");
