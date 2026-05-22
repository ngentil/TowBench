-- Add plate-based auth columns to tow_trucks
ALTER TABLE tow_trucks ADD COLUMN IF NOT EXISTS is_admin   boolean NOT NULL DEFAULT false;
ALTER TABLE tow_trucks ADD COLUMN IF NOT EXISTS auth_email text;

-- Populate auth_email from existing plates (idempotent)
UPDATE tow_trucks
SET auth_email = lower(regexp_replace(upper(trim(plate)), '\s+', '')) || '@towbench.internal'
WHERE auth_email IS NULL;

CREATE INDEX IF NOT EXISTS tow_trucks_auth_email_idx ON tow_trucks (auth_email);

-- Validates plate format and checks if an auth user already exists.
-- Does NOT require the plate to exist in tow_trucks — any TOW-format plate can register.
-- Runs as SECURITY DEFINER so anon can call it pre-login.
CREATE OR REPLACE FUNCTION get_truck_auth_info(p_plate text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_normalized text;
  v_email      text;
  v_registered boolean;
BEGIN
  v_normalized := upper(regexp_replace(trim(p_plate), '\s+', ''));

  -- Validate format: TOW followed by 1-3 alphanumeric characters
  IF v_normalized !~ '^TOW[A-Z0-9]{1,3}$' THEN
    RETURN NULL;
  END IF;

  v_email := lower(v_normalized) || '@towbench.internal';

  -- Check whether a Supabase Auth user already exists for this plate
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = v_email
  ) INTO v_registered;

  RETURN jsonb_build_object('email', v_email, 'registered', v_registered);
END;
$$;

GRANT EXECUTE ON FUNCTION get_truck_auth_info(text) TO anon;

-- TOW933 is the only admin truck
UPDATE tow_trucks SET is_admin = true WHERE upper(regexp_replace(trim(plate), '\s+', '')) = 'TOW933';

-- Driver name column (set by driver on first login)
ALTER TABLE tow_trucks ADD COLUMN IF NOT EXISTS driver_name text;

-- Allows an authenticated driver to update their own name
CREATE OR REPLACE FUNCTION set_driver_name(p_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tow_trucks SET driver_name = trim(p_name) WHERE auth_email = auth.email();
$$;

GRANT EXECUTE ON FUNCTION set_driver_name(text) TO authenticated;
