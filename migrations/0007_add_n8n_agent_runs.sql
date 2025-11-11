CREATE TABLE IF NOT EXISTS "n8n_agents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workflow_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'inactive',
  "webhook_url" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  CONSTRAINT n8n_agents_user_workflow_unique UNIQUE (user_id, workflow_id)
);

CREATE INDEX IF NOT EXISTS "n8n_agents_user_id_idx" ON "n8n_agents" ("user_id");

CREATE TABLE IF NOT EXISTS "n8n_agent_runs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" varchar NOT NULL REFERENCES "n8n_agents"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "http_status" integer,
  "payload_excerpt" text,
  "error_details" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "n8n_agent_runs_agent_id_idx" ON "n8n_agent_runs" ("agent_id");
CREATE INDEX IF NOT EXISTS "n8n_agent_runs_created_at_idx" ON "n8n_agent_runs" ("created_at");
