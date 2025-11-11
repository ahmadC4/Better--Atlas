CREATE TABLE IF NOT EXISTS tool_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    tool_name text NOT NULL,
    is_enabled boolean NOT NULL DEFAULT true,
    safety_note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tool_policies_provider_tool_name_idx
    ON tool_policies (provider, tool_name);

CREATE INDEX IF NOT EXISTS tool_policies_provider_idx
    ON tool_policies (provider);
