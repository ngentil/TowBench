-- Indexes for key query paths.
-- Run after 40_docket_form.sql in Supabase SQL editor.

-- dispatched_jobs: most queries filter by company_id + status
create index if not exists idx_dispatched_jobs_company_status
  on dispatched_jobs(company_id, status);

-- dispatched_jobs: drivers query their own assigned jobs
create index if not exists idx_dispatched_jobs_assigned_to
  on dispatched_jobs(assigned_to)
  where assigned_to is not null;

-- dispatched_job_photos: always fetched by job_id
create index if not exists idx_dispatched_job_photos_job_id
  on dispatched_job_photos(job_id);

-- driver_locations: realtime subscription and map queries filter by company
create index if not exists idx_driver_locations_company_id
  on driver_locations(company_id);

-- tow_trucks: allocation and dispatch queries filter by company
create index if not exists idx_tow_trucks_company_id
  on tow_trucks(company_id);

-- tow_trucks: driver login and hook lookup by auth_email
create index if not exists idx_tow_trucks_auth_email
  on tow_trucks(auth_email)
  where auth_email is not null;

-- job_accepted: live allocation queries only care about uncleared rows
create index if not exists idx_job_accepted_event_live
  on job_accepted(event_id)
  where released_at is null;

-- job_accepted: company scoped queries
create index if not exists idx_job_accepted_company_id
  on job_accepted(company_id);

-- map_notes: looked up by allocation_id
create index if not exists idx_map_notes_allocation_id
  on map_notes(allocation_id)
  where allocation_id is not null;
