-- Tracks dispatcher assignments from the live VicRoads feed.
-- Status: in_progress → completed | cancelled

create table if not exists dispatched_jobs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id),
  event_id       text,
  truck_id       uuid references tow_trucks(id),
  from_depot_id  uuid references depots(id),
  to_depot_id    uuid references depots(id),
  pickup_lat     numeric(10,7),
  pickup_lng     numeric(10,7),
  pickup_label   text,
  tow_type       text not null default 'accident',
  distance_km    numeric(10,3),
  duration_min   int,
  tow_fee        numeric(10,2),
  status         text not null default 'in_progress'
                   check (status in ('in_progress','completed','cancelled')),
  dispatched_by  text,
  dispatched_at  timestamptz default now(),
  completed_at   timestamptz,
  created_at     timestamptz default now()
);

alter table dispatched_jobs enable row level security;

drop policy if exists "company read dispatched_jobs"  on dispatched_jobs;
drop policy if exists "admin write dispatched_jobs"   on dispatched_jobs;

create policy "company read dispatched_jobs" on dispatched_jobs
  for select using (company_id = my_company_id() or my_role() = 'super_admin');

create policy "admin write dispatched_jobs" on dispatched_jobs
  for all using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check     (company_id = my_company_id() or my_role() = 'super_admin');

-- Extend tow_ins
alter table tow_ins
  add column if not exists dispatched_job_id uuid references dispatched_jobs(id),
  add column if not exists storage_type_id   uuid references storage_types(id),
  add column if not exists tow_fee           numeric(10,2),
  add column if not exists distance_km       numeric(10,3),
  add column if not exists tow_type          text,
  add column if not exists charge_to         text,
  add column if not exists cancelled         boolean not null default false;
