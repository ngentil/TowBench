-- Add plate-based auth columns to tow_trucks
ALTER TABLE tow_trucks ADD COLUMN IF NOT EXISTS is_admin   boolean NOT NULL DEFAULT false;
ALTER TABLE tow_trucks ADD COLUMN IF NOT EXISTS auth_email text;

-- Populate auth_email from existing plates (idempotent)
UPDATE tow_trucks
SET auth_email = lower(replace(upper(trim(plate)), ' ', '')) || '@towbench.internal'
WHERE auth_email IS NULL;

CREATE INDEX IF NOT EXISTS tow_trucks_auth_email_idx ON tow_trucks (auth_email);

-- Returns { email, registered } for a valid plate, NULL if plate not found.
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
  v_normalized := upper(trim(regexp_replace(p_plate, '\s+', ' ')));

  IF NOT EXISTS (
    SELECT 1 FROM tow_trucks WHERE upper(trim(plate)) = v_normalized
  ) THEN
    RETURN NULL;
  END IF;

  v_email := lower(replace(v_normalized, ' ', '')) || '@towbench.internal';

  -- Set auth_email on the truck row if not already set
  UPDATE tow_trucks
  SET auth_email = v_email
  WHERE upper(trim(plate)) = v_normalized AND auth_email IS NULL;

  -- Check whether a Supabase Auth user already exists for this plate
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = v_email
  ) INTO v_registered;

  RETURN jsonb_build_object('email', v_email, 'registered', v_registered);
END;
$$;

GRANT EXECUTE ON FUNCTION get_truck_auth_info(text) TO anon;

-- TOW 933 is the only admin truck
UPDATE tow_trucks SET is_admin = true WHERE upper(trim(plate)) = 'TOW 933';
