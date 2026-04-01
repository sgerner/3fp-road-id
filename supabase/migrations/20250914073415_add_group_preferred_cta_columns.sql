-- Add preferred CTA configuration to groups
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS preferred_cta_kind text NOT NULL DEFAULT 'auto' CHECK (preferred_cta_kind IN ('auto','website','email','phone','custom')),
ADD COLUMN IF NOT EXISTS preferred_cta_label varchar(10),
ADD COLUMN IF NOT EXISTS preferred_cta_url text;

-- Optional: simple index to query by kind if needed later
CREATE INDEX IF NOT EXISTS groups_preferred_cta_kind_idx ON groups (preferred_cta_kind);
;
