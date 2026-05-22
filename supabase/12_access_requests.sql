CREATE TABLE IF NOT EXISTS access_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate        text        NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL DEFAULT 'pending'
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Only admins can read / update requests
CREATE POLICY "access_requests_admin" ON access_requests
  FOR ALL
  USING     (EXISTS (SELECT 1 FROM tow_trucks WHERE auth_email = auth.email() AND is_admin = true))
  WITH CHECK(EXISTS (SELECT 1 FROM tow_trucks WHERE auth_email = auth.email() AND is_admin = true));

GRANT SELECT, INSERT, UPDATE, DELETE ON access_requests TO authenticated;

-- Callable by anon so a driver can request before they have an account.
-- Deduplicates: silently does nothing if a pending request for this plate already exists.
CREATE OR REPLACE FUNCTION request_access(p_plate text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO access_requests (plate)
  SELECT upper(regexp_replace(trim(p_plate), '\s+', ''))
  WHERE upper(regexp_replace(trim(p_plate), '\s+', '')) ~ '^TOW[A-Z0-9]{1,3}$'
    AND NOT EXISTS (
      SELECT 1 FROM access_requests
      WHERE plate  = upper(regexp_replace(trim(p_plate), '\s+', ''))
        AND status = 'pending'
    );
$$;
GRANT EXECUTE ON FUNCTION request_access(text) TO anon;
