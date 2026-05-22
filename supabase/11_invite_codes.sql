CREATE TABLE IF NOT EXISTS invite_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_by    text,
  used_at    timestamptz
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_codes_admin" ON invite_codes
  FOR ALL
  USING     (EXISTS (SELECT 1 FROM tow_trucks WHERE auth_email = auth.email() AND is_admin = true))
  WITH CHECK(EXISTS (SELECT 1 FROM tow_trucks WHERE auth_email = auth.email() AND is_admin = true));

GRANT SELECT, INSERT, UPDATE, DELETE ON invite_codes TO authenticated;

-- Validate a code — callable by anon so it works before signUp
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM invite_codes
    WHERE upper(trim(code)) = upper(trim(p_code)) AND used_at IS NULL
  );
$$;
GRANT EXECUTE ON FUNCTION validate_invite_code(text) TO anon;

-- Consume a code after signUp (now authenticated)
CREATE OR REPLACE FUNCTION consume_invite_code(p_code text, p_plate text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE invite_codes
  SET used_by = p_plate, used_at = now()
  WHERE upper(trim(code)) = upper(trim(p_code)) AND used_at IS NULL;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION consume_invite_code(text, text) TO authenticated;

-- Generate a new code — admin only, checked inside function
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code  text;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i     int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tow_trucks WHERE auth_email = auth.email() AND is_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
  END LOOP;
  INSERT INTO invite_codes (code) VALUES (v_code);
  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_invite_code() TO authenticated;
