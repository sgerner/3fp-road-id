-- Relax and extend allowed values for preferred_cta_kind
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_preferred_cta_kind_check;
ALTER TABLE groups
  ADD CONSTRAINT groups_preferred_cta_kind_check
  CHECK (preferred_cta_kind IN (
    'auto','website','email','phone','custom',
    'facebook','instagram','strava','x','tiktok'
  ));
;
