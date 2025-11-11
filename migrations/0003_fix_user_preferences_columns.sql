DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'about me'
  ) THEN
    EXECUTE 'ALTER TABLE user_preferences RENAME COLUMN "about me" TO about_me';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'bio'
  ) THEN
    EXECUTE 'ALTER TABLE user_preferences RENAME COLUMN bio TO about_me';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'about_me'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN about_me text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'personalization_enabled'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN personalization_enabled text NOT NULL DEFAULT 'false';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'custom_instructions'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN custom_instructions text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'name'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN name text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'occupation'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN occupation text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN profile_image_url text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'memories'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN memories jsonb DEFAULT '[]'::jsonb;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'chat_history_enabled'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN chat_history_enabled text NOT NULL DEFAULT 'true';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'autonomous_code_execution'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN autonomous_code_execution text NOT NULL DEFAULT 'true';
  END IF;
END
$$;

ALTER TABLE user_preferences
  ALTER COLUMN memories SET DEFAULT '[]'::jsonb;

UPDATE user_preferences
SET memories = '[]'::jsonb
WHERE memories IS NULL;

UPDATE user_preferences
SET personalization_enabled = COALESCE(personalization_enabled, 'false');

UPDATE user_preferences
SET chat_history_enabled = COALESCE(chat_history_enabled, 'true');

UPDATE user_preferences
SET autonomous_code_execution = COALESCE(autonomous_code_execution, 'true');
