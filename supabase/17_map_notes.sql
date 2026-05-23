-- Persistent map annotations and shift handover notes
-- allocation_id null → map pin; non-null → note attached to a specific job
create table if not exists map_notes (
  id            uuid        primary key default gen_random_uuid(),
  lat           float8,
  lng           float8,
  note          text        not null,
  allocation_id text,
  expires_at    timestamptz not null,
  created_by    text,
  created_at    timestamptz not null default now()
);

alter table map_notes enable row level security;

create policy "auth read"
  on map_notes for select
  using (auth.role() = 'authenticated');

create policy "auth insert"
  on map_notes for insert
  with check (auth.role() = 'authenticated');

create policy "own delete"
  on map_notes for delete
  using (created_by = auth.jwt() ->> 'email');
