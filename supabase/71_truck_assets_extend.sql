-- Extend truck_tools with full RatBench-equivalent fields
ALTER TABLE truck_tools
  ADD COLUMN IF NOT EXISTS model            text,
  ADD COLUMN IF NOT EXISTS purchase_date    date,
  ADD COLUMN IF NOT EXISTS purchase_price   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty_expiry  date,
  ADD COLUMN IF NOT EXISTS storage_location text;

-- Extend truck_equipment with full RatBench-equivalent fields
ALTER TABLE truck_equipment
  ADD COLUMN IF NOT EXISTS model    text,
  ADD COLUMN IF NOT EXISTS year     int,
  ADD COLUMN IF NOT EXISTS hours    numeric,
  ADD COLUMN IF NOT EXISTS location text;
