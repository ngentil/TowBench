-- Temporary availability override and relief driver support for tow_trucks
ALTER TABLE tow_trucks
  ADD COLUMN IF NOT EXISTS override_active      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason      text,
  ADD COLUMN IF NOT EXISTS override_return_date date,
  ADD COLUMN IF NOT EXISTS relief_driver_name   text,
  ADD COLUMN IF NOT EXISTS relief_da_number     text,
  ADD COLUMN IF NOT EXISTS relief_schedule      jsonb DEFAULT '{}'::jsonb;
