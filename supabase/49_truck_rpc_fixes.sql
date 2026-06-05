-- Security definer RPCs for truck operations that non-admin users need.
-- These bypass RLS while enforcing company membership in the function body.
-- Supersedes 47 and 48 — run this one if you haven't run those.

-- Assign or remove a truck from a depot (pass NULL to unassign)
create or replace function set_truck_depot(p_truck_id uuid, p_depot_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from tow_trucks
    where id = p_truck_id
      and (company_id = my_company_id() or my_role() = 'super_admin')
  ) then
    raise exception 'Truck not found in your company';
  end if;
  update tow_trucks set depot_id = p_depot_id where id = p_truck_id;
end $$;

grant execute on function set_truck_depot(uuid, uuid) to authenticated;

-- Delete a truck
create or replace function delete_truck(p_truck_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from tow_trucks
    where id = p_truck_id
      and (company_id = my_company_id() or my_role() = 'super_admin')
  ) then
    raise exception 'Truck not found in your company';
  end if;
  delete from tow_trucks where id = p_truck_id;
end $$;

grant execute on function delete_truck(uuid) to authenticated;
