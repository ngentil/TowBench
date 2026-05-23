-- Job acceptance tracking: drivers accept active allocations, 60-min reminder
create table if not exists job_accepted (
  id          uuid        primary key default gen_random_uuid(),
  event_id    text        not null,
  accepted_by text        not null,   -- driver email
  accepted_at timestamptz not null default now(),
  released_at timestamptz
);

-- Enforce: only one active acceptance per job (where released_at is null)
create unique index if not exists job_accepted_active_unique
  on job_accepted (event_id)
  where released_at is null;

alter table job_accepted enable row level security;

create policy "auth read"
  on job_accepted for select
  using (auth.role() = 'authenticated');

create policy "own insert"
  on job_accepted for insert
  with check (accepted_by = auth.jwt() ->> 'email');

create policy "own update"
  on job_accepted for update
  using (accepted_by = auth.jwt() ->> 'email');
