DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
        CREATE TYPE user_plan AS ENUM ('free', 'pro', 'enterprise');
    END IF;
END $$;

UPDATE users
SET plan = 'free'
WHERE plan IS NULL OR plan NOT IN ('free', 'pro', 'enterprise');

ALTER TABLE users
    ALTER COLUMN plan DROP DEFAULT;

ALTER TABLE users
    ALTER COLUMN plan TYPE user_plan
    USING CASE
        WHEN plan IN ('free', 'pro', 'enterprise') THEN plan::user_plan
        ELSE 'free'::user_plan
    END;

ALTER TABLE users
    ALTER COLUMN plan SET DEFAULT 'free'::user_plan;

ALTER TABLE users
    ALTER COLUMN plan SET NOT NULL;
