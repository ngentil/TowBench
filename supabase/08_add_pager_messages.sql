CREATE TABLE IF NOT EXISTS pager_messages (
  id            bigserial   PRIMARY KEY,
  agency        text        NOT NULL,
  message       text        NOT NULL,
  incident_type text,
  address       text,
  capcode       text,
  received_at   timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE pager_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read pager_messages"
  ON pager_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role insert pager_messages"
  ON pager_messages FOR INSERT TO service_role WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pager_messages_received_at_idx ON pager_messages (received_at DESC);
