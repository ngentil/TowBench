-- Switch to real email auth: store real emails in tow_trucks.auth_email
-- Run AFTER 10_plate_auth.sql

-- Set TOW933 admin email to real address
UPDATE tow_trucks
SET auth_email = 'nathan.gentil@gmail.com'
WHERE upper(regexp_replace(trim(plate), '\s+', '')) = 'TOW933';

-- Update get_truck_auth_info to use stored real emails and return is_admin flag
CREATE OR REPLACE FUNCTION get_truck_auth_info(p_plate text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_normalized text;
  v_email      text;
  v_is_admin   boolean;
  v_registered boolean;
BEGIN
  v_normalized := upper(regexp_replace(trim(p_plate), '\s+', ''));

  IF v_normalized !~ '^TOW[A-Z0-9]{1,3}$' THEN
    RETURN NULL;
  END IF;

  -- Look up the real stored email for this plate
  SELECT auth_email, is_admin
  INTO v_email, v_is_admin
  FROM tow_trucks
  WHERE upper(regexp_replace(trim(plate), '\s+', '')) = v_normalized
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE email = v_email
    ) INTO v_registered;
  ELSE
    v_registered := false;
  END IF;

  RETURN jsonb_build_object(
    'email',      v_email,
    'registered', v_registered,
    'is_admin',   coalesce(v_is_admin, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_truck_auth_info(text) TO anon;

-- Link a plate to a real email after signup (updates fleet row if it exists)
CREATE OR REPLACE FUNCTION link_plate_to_email(p_plate text, p_email text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tow_trucks
  SET auth_email = lower(trim(p_email))
  WHERE upper(regexp_replace(trim(plate), '\s+', '')) = upper(trim(p_plate));
$$;

GRANT EXECUTE ON FUNCTION link_plate_to_email(text, text) TO authenticated;
