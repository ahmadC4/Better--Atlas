CREATE TABLE IF NOT EXISTS "output_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "format" text NOT NULL,
  "instructions" text,
  "required_sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "output_templates_category_idx" ON "output_templates" ("category");
CREATE INDEX IF NOT EXISTS "output_templates_is_active_idx" ON "output_templates" ("is_active");
