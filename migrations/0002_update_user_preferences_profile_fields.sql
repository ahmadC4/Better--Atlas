DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_preferences'
      AND column_name = 'bio'
  ) THEN
    EXECUTE 'ALTER TABLE user_preferences RENAME COLUMN bio TO about_me';
  END IF;
END
$$;
