-- Add driver details and weekly availability schedule to tow_trucks
ALTER TABLE tow_trucks
  ADD COLUMN IF NOT EXISTS da_number   text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS schedule    jsonb DEFAULT '{}'::jsonb;

-- schedule shape (date → shift):
-- { "2026-05-19": "day", "2026-05-20": "night", "2026-05-21": "both" }
