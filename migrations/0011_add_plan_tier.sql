ALTER TABLE plans ADD COLUMN IF NOT EXISTS tier text;

UPDATE plans
SET tier = lower(slug)
WHERE tier IS NULL;

ALTER TABLE plans
  ALTER COLUMN tier SET DEFAULT 'custom';

ALTER TABLE plans
  ALTER COLUMN tier SET NOT NULL;
