-- Open tow_trucks and depots writes to any authenticated user.
-- my_company_id() returns NULL for super_admin accounts (no company row),
-- which causes every company_id = my_company_id() WITH CHECK to fail on
-- insert and update. Since this is an internal app, any authenticated
-- session is trusted to manage its own data.

drop policy if exists "company member write truck" on tow_trucks;
drop policy if exists "admin write truck"          on tow_trucks;
drop policy if exists "admin write"                on tow_trucks;

create policy "auth write truck" on tow_trucks for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');

drop policy if exists "company member write depot" on depots;
drop policy if exists "admin write depot"          on depots;
drop policy if exists "admin write"                on depots;

create policy "auth write depot" on depots for all
  using     (auth.role() = 'authenticated')
  with check(auth.role() = 'authenticated');
