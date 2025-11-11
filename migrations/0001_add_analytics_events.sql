-- Analytics events for detailed API request tracking
CREATE TABLE IF NOT EXISTS analytics_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar NOT NULL UNIQUE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id varchar REFERENCES chats(id) ON DELETE CASCADE,
  project_id varchar REFERENCES projects(id) ON DELETE SET NULL,
  expert_id varchar REFERENCES experts(id) ON DELETE SET NULL,
  template_id varchar REFERENCES output_templates(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  error_code text,
  error_message text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  tokens_estimated boolean NOT NULL DEFAULT false,
  latency_ms integer NOT NULL DEFAULT 0,
  cost_usd text NOT NULL DEFAULT '0',
  created_at timestamp DEFAULT now()
);

-- Indexes for analytics_events
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS analytics_events_provider_idx ON analytics_events(provider);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS analytics_events_project_id_idx ON analytics_events(project_id);

-- Provider pricing for cost calculation
CREATE TABLE IF NOT EXISTS provider_pricing (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_usd_per_1k text NOT NULL,
  output_usd_per_1k text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(provider, model)
);

-- Insert default Groq pricing
INSERT INTO provider_pricing (provider, model, input_usd_per_1k, output_usd_per_1k, enabled) VALUES
  ('groq', 'llama-3.1-8b-instant', '0.00005', '0.00008', true),
  ('groq', 'llama-3.1-70b-versatile', '0.00059', '0.00079', true),
  ('groq', 'llama-3.1-405b-reasoning', '0.00300', '0.00300', true),
  ('groq', 'llama-3.2-1b-preview', '0.00004', '0.00004', true),
  ('groq', 'llama-3.2-3b-preview', '0.00006', '0.00006', true),
  ('groq', 'llama-3.2-11b-vision-preview', '0.00018', '0.00018', true),
  ('groq', 'llama-3.2-90b-vision-preview', '0.00090', '0.00090', true),
  ('groq', 'mixtral-8x7b-32768', '0.00024', '0.00024', true),
  ('groq', 'gemma2-9b-it', '0.00020', '0.00020', true),
  ('groq', 'whisper-large-v3', '0.00011', '0.00011', true)
ON CONFLICT (provider, model) DO NOTHING;
