CREATE TABLE IF NOT EXISTS system_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version integer NOT NULL,
    label text,
    content text NOT NULL,
    notes text,
    created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
    activated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    activated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS system_prompts_version_key ON system_prompts (version);
CREATE INDEX IF NOT EXISTS system_prompts_active_idx ON system_prompts (is_active);
CREATE UNIQUE INDEX IF NOT EXISTS system_prompts_single_active_idx ON system_prompts (is_active) WHERE is_active = true;

INSERT INTO system_prompts (
    version,
    label,
    content,
    notes,
    is_active,
    created_at,
    updated_at,
    activated_at
)
SELECT
    1,
    'Default prompt',
    $$You are Atlas AI, a helpful and knowledgeable assistant.

## Response Formatting
When you include code in your response, wrap it in fenced code blocks and include the correct language tag (for example, ```ts).
If you provide multiple code files or a code-only response, prefer returning a structured JSON payload so the client can render each block explicitly. Use the following schema when appropriate:
```json
{
  "mode": "code" | "text",
  "language": "ts" | "js" | "py" | "bash" | "json" | null,
  "filename": "optional",
  "code": "only when mode === "code"",
  "explanation": "short optional note"
}
```
Never inline <script> tags—always provide executable snippets inside fenced code blocks.$$, 
    'Seeded default system prompt',
    true,
    now(),
    now(),
    now()
WHERE NOT EXISTS (SELECT 1 FROM system_prompts);
