-- Fix delete_truck to clear FK references in dispatched_jobs before deleting.
-- The truck can't be deleted while dispatched_jobs.truck_id points to it.
-- Nullifying preserves job history but removes the truck link.

create or replace function delete_truck(p_truck_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.role() != 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  update dispatched_jobs set truck_id = null where truck_id = p_truck_id;
  delete from tow_trucks where id = p_truck_id;
end $$;

grant execute on function delete_truck(uuid) to authenticated;
