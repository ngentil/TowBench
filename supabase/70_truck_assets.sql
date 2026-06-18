-- Truck asset catalogue + assignment tables
-- Tools, equipment, and consumables assigned to tow_trucks

CREATE TABLE IF NOT EXISTS truck_tools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  brand       text,
  category    text,
  condition   text DEFAULT 'Good',
  serial_no   text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE truck_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON truck_tools FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON truck_tools TO authenticated;
GRANT ALL ON truck_tools TO service_role;
CREATE INDEX idx_truck_tools_user ON truck_tools (user_id);

CREATE TABLE IF NOT EXISTS truck_equipment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  brand       text,
  category    text,
  serial_no   text,
  status      text DEFAULT 'Active',
  notes       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE truck_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON truck_equipment FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON truck_equipment TO authenticated;
GRANT ALL ON truck_equipment TO service_role;
CREATE INDEX idx_truck_equipment_user ON truck_equipment (user_id);

CREATE TABLE IF NOT EXISTS truck_consumables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  brand       text,
  category    text,
  unit        text DEFAULT 'each',
  notes       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE truck_consumables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON truck_consumables FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON truck_consumables TO authenticated;
GRANT ALL ON truck_consumables TO service_role;
CREATE INDEX idx_truck_consumables_user ON truck_consumables (user_id);

CREATE TABLE IF NOT EXISTS truck_asset_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  truck_id    uuid NOT NULL REFERENCES tow_trucks(id) ON DELETE CASCADE,
  asset_type  text NOT NULL CHECK (asset_type IN ('tool','equipment','consumable')),
  asset_id    uuid NOT NULL,
  asset_name  text NOT NULL,
  notes       text,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (truck_id, asset_type, asset_id)
);
ALTER TABLE truck_asset_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON truck_asset_assignments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON truck_asset_assignments TO authenticated;
GRANT ALL ON truck_asset_assignments TO service_role;
CREATE INDEX idx_truck_asset_assignments_truck ON truck_asset_assignments (truck_id);
