-- Persistent geocode cache: address/corner/station-key → lat/lng
-- Shared across all users; no company scoping (geocoding is universal).
-- Populated incrementally by IncidentFeedTab as new addresses are resolved.

create table if not exists geocode_cache (
  key        text primary key,
  lat        float8 not null,
  lng        float8 not null,
  created_at timestamptz default now()
);

alter table geocode_cache enable row level security;

-- Any authenticated user can read or write geocode entries
create policy "auth all" on geocode_cache
  for all
  using     (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
