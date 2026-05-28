-- Docket form data collected by driver at pickup.
-- Run after 39_driver_job_workflow.sql.

-- New workflow step timestamps on dispatched_jobs
alter table dispatched_jobs
  add column if not exists route_confirmed_at timestamptz,
  add column if not exists docket_form_at     timestamptz;

-- Full docket record (one per job, upserted by driver at pickup)
create table if not exists job_dockets (
  id                        uuid primary key default gen_random_uuid(),
  job_id                    uuid unique not null references dispatched_jobs(id) on delete cascade,

  -- Vehicle
  vehicle_make              text,
  vehicle_model             text,
  vehicle_colour            text,
  vehicle_rego              text,
  insurance_co              text,
  client_mobile             text,
  further_instructions      text,
  visual_damage             text,

  -- Trade form
  trade_reason              text, -- 'trade'|'insurance'|'stolen'|'evidence'|'impound'|'tow_safe'
  charge_to                 text,
  claim_no                  text,
  keys_held                 boolean,

  -- Authoriser (array of who was present: 'owner_agent','driver','police','vicroads_officer')
  auth_types                text[],
  auth_police_sgt           text,
  auth_police_number        text,
  auth_police_rank          text,
  auth_police_station       text,

  -- Person 1 details (owner/driver/officer — from OCR or manual)
  client1_name              text,
  client1_address           text,
  client1_licence_no        text,
  client1_licence_photo_url text,

  -- Person 2 details (if both driver + owner present)
  client2_name              text,
  client2_address           text,
  client2_licence_no        text,
  client2_licence_photo_url text,

  -- Signatures (PNG URLs in job-photos bucket)
  sig_authoriser_url        text,  -- person authorising tow
  sig_storage_url           text,  -- person organising storage (accident only)
  sig_pamphlet_url          text,  -- driver confirms VicRoads pamphlet given (accident only)

  -- Accident salvage
  salvage_required          boolean,
  salvage_location          text,
  salvage_position          text,
  salvage_time_min          int,
  salvage_embedded_in       text,
  salvage_equipment         text,
  pamphlet_given            boolean,

  -- Driver-confirmed actual route (may differ from original dispatch)
  route_waypoints           jsonb, -- [{label,lat,lng}]

  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

alter table job_dockets enable row level security;

drop policy if exists "company read job dockets" on job_dockets;
drop policy if exists "driver write job dockets" on job_dockets;

create policy "company read job dockets" on job_dockets for select
  using (
    exists (
      select 1 from dispatched_jobs j
      where j.id = job_dockets.job_id
        and (j.company_id = my_company_id() or my_role() = 'super_admin')
    )
  );

create policy "driver write job dockets" on job_dockets for all
  using (
    exists (
      select 1 from dispatched_jobs j
      where j.id = job_dockets.job_id
        and (
          j.assigned_to = (auth.jwt() ->> 'email')
          or my_role() in ('dispatch', 'admin', 'super_admin')
        )
    )
  )
  with check (
    exists (
      select 1 from dispatched_jobs j
      where j.id = job_dockets.job_id
        and (
          j.assigned_to = (auth.jwt() ->> 'email')
          or my_role() in ('dispatch', 'admin', 'super_admin')
        )
    )
  );
