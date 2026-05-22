-- Fix tow_allocation_log RLS so any authenticated user can write the live feed log.
-- Previously INSERT/UPDATE were locked to the old fake admin email, causing logAllocations()
-- to silently fail for all real email logins — nothing was ever persisted to the DB.

DROP POLICY IF EXISTS "tow_log_admin_insert" ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_admin_update" ON tow_allocation_log;
DROP POLICY IF EXISTS "tow_log_admin_delete" ON tow_allocation_log;

CREATE POLICY "tow_log_insert" ON tow_allocation_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "tow_log_update" ON tow_allocation_log
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "tow_log_delete" ON tow_allocation_log
  FOR DELETE USING (auth.email() = 'nathan.gentil@gmail.com');
