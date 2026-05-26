-- Add write (insert/update/delete) policies for depots and tow_trucks.
-- The tables had RLS enabled but only select policies, blocking all edits.

drop policy if exists "admin write depot" on depots;
create policy "admin write depot"
  on depots for all
  using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check (company_id = my_company_id() or my_role() = 'super_admin');

drop policy if exists "admin write truck" on tow_trucks;
create policy "admin write truck"
  on tow_trucks for all
  using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check (company_id = my_company_id() or my_role() = 'super_admin');
