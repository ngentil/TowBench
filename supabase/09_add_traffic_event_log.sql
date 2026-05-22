CREATE TABLE IF NOT EXISTS traffic_event_log (
  event_id      text        PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT NOW(),
  sub_type      text,
  road_name     text,
  suburb        text
);

ALTER TABLE traffic_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read traffic_event_log"
  ON traffic_event_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated insert traffic_event_log"
  ON traffic_event_log FOR INSERT TO authenticated WITH CHECK (true);
