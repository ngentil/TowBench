-- Expand user_profiles with all onboarding fields
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS first_name    text,
  ADD COLUMN IF NOT EXISTS last_name     text,
  ADD COLUMN IF NOT EXISTS company_name  text,
  ADD COLUMN IF NOT EXISTS plate         text,
  ADD COLUMN IF NOT EXISTS da_number     text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS state         text DEFAULT 'VIC',
  ADD COLUMN IF NOT EXISTS onboarded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS email         text;

-- Backfill email from auth.users for existing rows
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE au.id = up.id
  AND up.email IS NULL;

-- Registry view — query this via service role key from rvro.org
-- Aggregates identity + activity counts per user
CREATE OR REPLACE VIEW user_registry AS
SELECT
  up.id                AS user_id,
  up.email,
  up.first_name,
  up.last_name,
  up.company_name,
  up.plate,
  up.da_number,
  up.phone,
  up.state,
  up.role,
  up.onboarded_at,
  up.created_at        AS account_created_at,
  (SELECT COUNT(*)   FROM tow_allocation_log WHERE user_id = up.id)  AS allocation_count,
  (SELECT MAX(last_seen) FROM tow_allocation_log WHERE user_id = up.id) AS last_allocation,
  (SELECT COUNT(*)   FROM tow_trucks          WHERE user_id = up.id)  AS truck_count,
  (SELECT COUNT(*)   FROM depots              WHERE user_id = up.id)  AS depot_count,
  (SELECT COUNT(*)   FROM tow_ins             WHERE user_id = up.id)  AS tow_in_count,
  (SELECT COUNT(*)   FROM dispatched_jobs     WHERE user_id = up.id)  AS job_count
FROM user_profiles up;

-- Only service role can read the registry (app users query their own user_profiles via RLS)
REVOKE SELECT ON user_registry FROM anon, authenticated;
GRANT  SELECT ON user_registry TO service_role;
