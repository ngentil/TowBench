CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, da_last4 text NOT NULL,
  role text NOT NULL DEFAULT 'driver',
  auth_email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
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
