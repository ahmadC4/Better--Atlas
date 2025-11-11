ALTER TABLE plans ADD COLUMN slug text;

WITH normalized AS (
  SELECT
    id,
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g'))), ''),
      id::text
    ) AS slug_value
  FROM plans
  WHERE slug IS NULL OR slug = ''
)
UPDATE plans AS p
SET slug = n.slug_value
FROM normalized AS n
WHERE p.id = n.id;

ALTER TABLE plans
ALTER COLUMN slug SET NOT NULL;

ALTER TABLE plans
ADD CONSTRAINT plans_slug_lowercase_chk CHECK (slug = lower(slug));

CREATE UNIQUE INDEX plans_slug_unique_idx ON plans (slug);

ALTER TABLE plans ADD COLUMN is_pro_tier boolean NOT NULL DEFAULT false;

UPDATE plans
SET is_pro_tier = true
WHERE lower(slug) IN ('pro', 'enterprise');
