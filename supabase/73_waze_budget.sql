-- Add budget tracking to waze_cache so OpenWebNinja API usage is tracked server-side.
-- month_key: 'YYYY-MM' string, resets counter each calendar month
-- month_count: how many times OpenWebNinja was actually called this month

ALTER TABLE waze_cache
  ADD COLUMN IF NOT EXISTS month_key    text,
  ADD COLUMN IF NOT EXISTS month_count  integer DEFAULT 0;
