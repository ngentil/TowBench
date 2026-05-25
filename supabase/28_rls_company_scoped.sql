-- Rebuild RLS policies for multi-tenant company isolation.
-- Depends on my_company_id() and my_role() from 23_user_profiles.sql.

-- ── tow_trucks ─────────────────────────────────────────────────────────────
alter table tow_trucks enable row level security;

drop policy if exists "tow_trucks_admin_only" on tow_trucks;
drop policy if exists "tow_trucks_rls_read"   on tow_trucks;
drop policy if exists "tow_trucks_rls_write"  on tow_trucks;

create policy "company read" on tow_trucks for select
  using (company_id = my_company_id() or my_role() = 'super_admin');

create policy "admin write" on tow_trucks for all
  using (my_role() in ('admin','super_admin') and
         (company_id = my_company_id() or my_role() = 'super_admin'))
  with check (my_role() in ('admin','super_admin') and
              (company_id = my_company_id() or my_role() = 'super_admin'));

-- Drivers can update their own truck row (to set auth_email, da_number etc. on signup)
create policy "driver own update" on tow_trucks for update
  using (auth_email = auth.email() and my_role() = 'driver');

-- ── depots ─────────────────────────────────────────────────────────────────
alter table depots enable row level security;
drop policy if exists "depots_admin_only" on depots;

create policy "company read"  on depots for select using (company_id = my_company_id() or my_role() = 'super_admin');
create policy "admin write"   on depots for all    using (my_role() in ('admin','super_admin'));

-- ── tow_allocation_log ────────────────────────────────────────────────────
alter table tow_allocation_log enable row level security;
drop policy if exists "tow_log_admin_only" on tow_allocation_log;

create policy "company read"   on tow_allocation_log for select using (company_id = my_company_id() or my_role() = 'super_admin');
create policy "dispatch write" on tow_allocation_log for all    using (my_role() in ('dispatch','admin','super_admin'));

-- ── job_accepted ──────────────────────────────────────────────────────────
-- Global read: allocation status is cross-company (lock visible to all)
drop policy if exists "auth read"  on job_accepted;
drop policy if exists "own insert" on job_accepted;
drop policy if exists "own update" on job_accepted;

create policy "global read"   on job_accepted for select using (auth.role() = 'authenticated');
create policy "driver insert" on job_accepted for insert with check (accepted_by = auth.email());

-- Dispatcher/admin release is handled via dispatch_unassign_job() security definer function

-- ── map_notes ────────────────────────────────────────────────────────────
alter table map_notes enable row level security;

drop policy if exists "auth read"      on map_notes;
drop policy if exists "auth insert"    on map_notes;
drop policy if exists "own update"     on map_notes;

create policy "company read"   on map_notes for select using (company_id = my_company_id() or my_role() = 'super_admin');
create policy "auth insert"    on map_notes for insert with check (auth.role() = 'authenticated');
create policy "own update"     on map_notes for update using (created_by = auth.email());

-- ── driver_locations ────────────────────────────────────────────────────
-- Global read within company; own write
drop policy if exists "auth read"   on driver_locations;
drop policy if exists "own insert"  on driver_locations;
drop policy if exists "own update"  on driver_locations;
drop policy if exists "own delete"  on driver_locations;

create policy "company read"  on driver_locations for select using (company_id = my_company_id() or my_role() = 'super_admin');
create policy "own insert"    on driver_locations for insert with check (driver_email = auth.email());
create policy "own update"    on driver_locations for update using  (driver_email = auth.email());
create policy "own delete"    on driver_locations for delete using  (driver_email = auth.email());

-- ── company_config ────────────────────────────────────────────────────────
drop policy if exists "public read" on company_config;
drop policy if exists "admin write" on company_config;

create policy "company read" on company_config for select
  using (company_id = my_company_id() or my_role() = 'super_admin');
create policy "admin write"  on company_config for all
  using (my_role() in ('admin','super_admin'));

-- ── Dispatcher allocation functions ───────────────────────────────────────

-- Allocate a job directly to a driver by truck plate (dispatch/admin only)
create or replace function dispatch_allocate_job(p_event_id text, p_plate text)
returns void language plpgsql security definer as $$
declare
  v_truck_email text;
  v_company_id  uuid;
begin
  if my_role() not in ('dispatch', 'admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select auth_email, company_id
  into v_truck_email, v_company_id
  from tow_trucks
  where upper(regexp_replace(trim(plate), '\s+', '')) =
        upper(regexp_replace(trim(p_plate), '\s+', ''))
    and (company_id = my_company_id() or my_role() = 'super_admin')
  limit 1;

  if v_truck_email is null then
    raise exception 'Truck not found in your company';
  end if;

  insert into job_accepted (event_id, accepted_by, company_id)
  values (p_event_id, v_truck_email, v_company_id);
end $$;

grant execute on function dispatch_allocate_job(text, text) to authenticated;

-- Unassign (release globally) an accepted job (dispatch/admin only)
create or replace function dispatch_unassign_job(p_job_accepted_id uuid)
returns void language plpgsql security definer as $$
declare
  v_job_company_id uuid;
begin
  if my_role() not in ('dispatch', 'admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select company_id into v_job_company_id
  from job_accepted where id = p_job_accepted_id;

  if v_job_company_id is distinct from my_company_id() and my_role() != 'super_admin' then
    raise exception 'Not authorized to unassign this job';
  end if;

  update job_accepted set released_at = now() where id = p_job_accepted_id;
end $$;

grant execute on function dispatch_unassign_job(uuid) to authenticated;
