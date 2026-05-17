-- Persistent log of tow allocations seen in the live feed
-- Upserted on every poll — gives 24hr history even when the live feed rotates

-- UPDATE THIS EMAIL before running (same address as 01_create_towing_tables.sql)

CREATE TABLE IF NOT EXISTS tow_allocation_log (
  event_id    text PRIMARY KEY,            -- properties.eventId
  road_name   text,
  suburb      text,
  status      text,
  description text,
  data        jsonb NOT NULL,              -- full feature object
  event_created_at  timestamptz,           -- properties.created (actual event time)
  first_seen  timestamptz DEFAULT now(),   -- when we first captured it
  last_seen   timestamptz DEFAULT now()    -- last time seen in the live feed
);

ALTER TABLE tow_allocation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tow_log_admin_only" ON tow_allocation_log
  FOR ALL USING (auth.email() = 'YOUR_ADMIN_EMAIL_HERE')
  WITH CHECK (auth.email() = 'YOUR_ADMIN_EMAIL_HERE');

CREATE INDEX IF NOT EXISTS tow_allocation_log_event_created ON tow_allocation_log (event_created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON tow_allocation_log TO authenticated;
