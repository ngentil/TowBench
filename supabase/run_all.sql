-- 06: drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, da_last4 text NOT NULL,
  role text NOT NULL DEFAULT 'driver',
  auth_email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drivers_read"         ON drivers;
DROP POLICY IF EXISTS "drivers_admin_write"  ON drivers;
CREATE POLICY "drivers_read" ON drivers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "drivers_admin_write" ON drivers FOR ALL USING (auth.email() = 'da9261@towbench.internal') WITH CHECK (auth.email() = 'da9261@towbench.internal');
GRANT SELECT, INSERT, UPDATE, DELETE ON drivers TO authenticated;
CREATE OR REPLACE FUNCTION get_driver_auth_email(p_name text, p_da_last4 text)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT auth_email FROM drivers WHERE lower(trim(name)) = lower(trim(p_name)) AND da_last4 = p_da_last4 LIMIT 1;
$$;
INSERT INTO drivers (name, da_last4, role, auth_email)
VALUES ('Nathan Gentil', '9261', 'admin', 'da9261@towbench.internal')
ON CONFLICT (auth_email) DO NOTHING;

-- 07: update RLS for driver-based auth
DROP POLICY IF EXISTS "depots_admin_only"    ON depots;
DROP POLICY IF EXISTS "depots_select"        ON depots;
DROP POLICY IF EXISTS "depots_admin_insert"  ON depots;
DROP POLICY IF EXISTS "depots_admin_update"  ON depots;
DROP POLICY IF EXISTS "depots_admin_delete"  ON depots;
CREATE POLICY "depots_select"       ON depots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "depots_admin_insert" ON depots FOR INSERT WITH CHECK (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "depots_admin_update" ON depots FOR UPDATE USING (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "depots_admin_delete" ON depots FOR DELETE USING (auth.email() = 'da9261@towbench.internal');
DROP POLICY IF EXISTS "tow_trucks_admin_only"    ON tow_trucks;
DROP POLICY IF EXISTS "tow_trucks_select"        ON tow_trucks;
DROP POLICY IF EXISTS "tow_trucks_admin_insert"  ON tow_trucks;
DROP POLICY IF EXISTS "tow_trucks_admin_update"  ON tow_trucks;
DROP POLICY IF EXISTS "tow_trucks_admin_delete"  ON tow_trucks;
CREATE POLICY "tow_trucks_select"       ON tow_trucks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tow_trucks_admin_insert" ON tow_trucks FOR INSERT WITH CHECK (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "tow_trucks_admin_update" ON tow_trucks FOR UPDATE USING (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "tow_trucks_admin_delete" ON tow_trucks FOR DELETE USING (auth.email() = 'da9261@towbench.internal');
DROP POLICY IF EXISTS "tow_log_admin_only"    ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_select"        ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_admin_insert"  ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_admin_update"  ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_admin_delete"  ON tow_allocation_log;
CREATE POLICY "tow_log_select"       ON tow_allocation_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tow_log_admin_insert" ON tow_allocation_log FOR INSERT WITH CHECK (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "tow_log_admin_update" ON tow_allocation_log FOR UPDATE USING (auth.email() = 'da9261@towbench.internal');
CREATE POLICY "tow_log_admin_delete" ON tow_allocation_log FOR DELETE USING (auth.email() = 'da9261@towbench.internal');
