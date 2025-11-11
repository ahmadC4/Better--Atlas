ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS pinned_team_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
