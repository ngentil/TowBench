-- Auto-purge tow allocation log entries older than 365 days
-- Requires pg_cron extension — enable in Supabase Dashboard → Database → Extensions → pg_cron

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Run daily at 03:00 UTC — deletes anything last seen more than 365 days ago
SELECT cron.schedule(
  'tow-log-purge-365d',
  '0 3 * * *',
  $$DELETE FROM tow_allocation_log WHERE last_seen < now() - interval '365 days'$$
);
