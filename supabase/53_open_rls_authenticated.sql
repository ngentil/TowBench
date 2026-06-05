-- Remove all permission complexity from tow_trucks, depots, and related
-- operational tables. Any authenticated user can read and write everything.
-- Revisit if multi-tenant isolation is needed later.

-- tow_trucks
drop policy if exists "company read"              on tow_trucks;
drop policy if exists "auth write truck"          on tow_trucks;
drop policy if exists "driver own update"         on tow_trucks;
drop policy if exists "company member write truck" on tow_trucks;

create policy "authenticated all" on tow_trucks for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');

-- depots
drop policy if exists "company read"               on depots;
drop policy if exists "auth write depot"           on depots;
drop policy if exists "company member write depot" on depots;

create policy "authenticated all" on depots for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');

-- dispatched_jobs
drop policy if exists "company read"    on dispatched_jobs;
drop policy if exists "dispatch write"  on dispatched_jobs;
drop policy if exists "auth write"      on dispatched_jobs;

create policy "authenticated all" on dispatched_jobs for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');

-- storage_types
drop policy if exists "company read"  on storage_types;
drop policy if exists "admin write"   on storage_types;

create policy "authenticated all" on storage_types for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');
