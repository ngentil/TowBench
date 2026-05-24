-- Driver GPS locations: upserted by each driver, read by all authenticated users
create table driver_locations (
  driver_email  text        primary key,
  lat           float8      not null,
  lng           float8      not null,
  heading       float8,
  accuracy      float8,
  updated_at    timestamptz not null default now()
);

alter table driver_locations enable row level security;

create policy "auth read"
  on driver_locations for select
  using (auth.role() = 'authenticated');

create policy "own insert"
  on driver_locations for insert
  with check (driver_email = auth.jwt() ->> 'email');

create policy "own update"
  on driver_locations for update
  using (driver_email = auth.jwt() ->> 'email');

create policy "own delete"
  on driver_locations for delete
  using (driver_email = auth.jwt() ->> 'email');

-- Realtime publication
alter publication supabase_realtime add table driver_locations;
