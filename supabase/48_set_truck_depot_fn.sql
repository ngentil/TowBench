-- Security definer function to update a truck's depot assignment.
-- Bypasses RLS (which only allows admin/super_admin to write tow_trucks)
-- while still enforcing company membership in the function body.
-- Called from the Depots tab assign/unassign UI for all roles.

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
