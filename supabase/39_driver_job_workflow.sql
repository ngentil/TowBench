-- Driver job workflow for trade tows.
-- Run in Supabase SQL editor after 38_assigned_to.sql.

-- Step timestamps + docket + dropoff location
alter table dispatched_jobs
  add column if not exists accepted_at          timestamptz,
  add column if not exists en_route_pickup_at   timestamptz,
  add column if not exists arrived_pickup_at    timestamptz,
  add column if not exists pre_photos_at        timestamptz,
  add column if not exists en_route_dropoff_at  timestamptz,
  add column if not exists arrived_dropoff_at   timestamptz,
  add column if not exists post_photos_at       timestamptz,
  add column if not exists docket_required      boolean not null default false,
  add column if not exists docket_number        text,
  add column if not exists dropoff_label        text,
  add column if not exists dropoff_lat          numeric(10,7),
  add column if not exists dropoff_lng          numeric(10,7);

-- Allow drivers to advance their own job's workflow steps
drop policy if exists "driver update own dispatched_job" on dispatched_jobs;
create policy "driver update own dispatched_job" on dispatched_jobs
  for update
  using  (assigned_to = (auth.jwt() ->> 'email'))
  with check (assigned_to = (auth.jwt() ->> 'email'));

-- Job photos
create table if not exists dispatched_job_photos (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references dispatched_jobs(id) on delete cascade,
  phase      text not null check (phase in ('pre_inspection', 'post_inspection')),
  photo_type text not null default 'vehicle' check (photo_type in ('vehicle', 'docket')),
  photo_url  text not null,
  created_at timestamptz default now()
);
alter table dispatched_job_photos enable row level security;

drop policy if exists "company read job photos"  on dispatched_job_photos;
drop policy if exists "driver insert job photos" on dispatched_job_photos;

create policy "company read job photos" on dispatched_job_photos for select
  using (
    exists (
      select 1 from dispatched_jobs j
      where j.id = dispatched_job_photos.job_id
        and (j.company_id = my_company_id() or my_role() = 'super_admin')
    )
  );

create policy "driver insert job photos" on dispatched_job_photos for insert
  with check (
    exists (
      select 1 from dispatched_jobs j
      where j.id = dispatched_job_photos.job_id
        and (
          j.assigned_to = (auth.jwt() ->> 'email')
          or my_role() in ('dispatch', 'admin', 'super_admin')
        )
    )
  );

-- Storage bucket 'job-photos': create manually in Supabase Dashboard.
-- Set as public bucket so getPublicUrl works without signed URLs.
-- Storage > New bucket > Name: job-photos > Public: ON
