ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS last_area text;

UPDATE user_preferences
SET last_area = COALESCE(last_area, 'user');

ALTER TABLE user_preferences
ALTER COLUMN last_area SET DEFAULT 'user';
