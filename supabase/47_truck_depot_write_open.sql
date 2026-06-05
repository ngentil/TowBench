-- Broaden write access on tow_trucks and depots so that any company member
-- (driver, dispatch, admin) can manage their own company's vehicles and depots.
-- Previously only admin/super_admin could write — this blocked the self-service
-- fleet management UI after we removed the isAdmin UI gate.

-- tow_trucks
drop policy if exists "admin write truck" on tow_trucks;  -- from 33_rls_depot_truck_write.sql
drop policy if exists "admin write"       on tow_trucks;  -- from 28_rls_company_scoped.sql

create policy "company member write truck" on tow_trucks for all
  using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check (company_id = my_company_id() or my_role() = 'super_admin');

-- depots
drop policy if exists "admin write depot" on depots;      -- from 33_rls_depot_truck_write.sql
drop policy if exists "admin write"       on depots;      -- from 28_rls_company_scoped.sql

create policy "company member write depot" on depots for all
  using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check (company_id = my_company_id() or my_role() = 'super_admin');
