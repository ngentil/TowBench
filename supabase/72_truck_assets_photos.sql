-- Add photos (base64 data URLs stored as jsonb array) to asset catalogue tables
ALTER TABLE truck_tools        ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]';
ALTER TABLE truck_equipment    ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]';
ALTER TABLE truck_consumables  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]';
