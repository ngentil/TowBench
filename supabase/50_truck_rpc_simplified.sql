-- Simplified truck RPCs — require only authenticated session.
-- The company check in v49 fails when my_company_id() returns NULL
-- (e.g. super_admin accounts that have no company_id in user_profiles).

create or replace function set_truck_depot(p_truck_id uuid, p_depot_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.role() != 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  update tow_trucks set depot_id = p_depot_id where id = p_truck_id;
end $$;

grant execute on function set_truck_depot(uuid, uuid) to authenticated;

create or replace function delete_truck(p_truck_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.role() != 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  delete from tow_trucks where id = p_truck_id;
end $$;

grant execute on function delete_truck(uuid) to authenticated;
