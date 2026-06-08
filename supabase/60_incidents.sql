-- VicEmergency incidents — polled every 5 min by Netlify scheduled function
create table if not exists vicemergency_incidents (
  id text primary key,
  received_at timestamptz not null default now(),
  name text,
  title text,
  category1 text,
  category2 text,
  severity text,
  status text,
  source_org text,
  description text,
  updated_ms bigint,
  created_ms bigint,
  location_suburb text,
  location_region text,
  latitude numeric,
  longitude numeric,
  raw jsonb
);

alter table vicemergency_incidents enable row level security;
create policy "Public read vicemergency_incidents"
  on vicemergency_incidents for select using (true);
alter publication supabase_realtime add table vicemergency_incidents;

create index if not exists idx_vicemergency_received_at on vicemergency_incidents(received_at desc);
create index if not exists idx_vicemergency_category on vicemergency_incidents(category1);


-- VicPagers raw dispatch messages — written by browser sessions (and optionally mini-PC listener)
create table if not exists vicpagers_messages (
  id bigint primary key,
  received_at timestamptz not null default now(),
  timestamp bigint,
  message text,
  type text,
  agency text,
  alias text,
  address_capcode text,
  incident_id text,
  source text,
  parsed_address text,
  parsed_event_type text,
  parsed_description text,
  parsed_map_ref text,
  parsed_six_figure text,
  parsed_alarm_level text,
  parsed_corner text,
  parsed_message_category text,
  parsed_is_cancellation boolean default false,
  raw_parsed jsonb,
  created_at timestamptz default now()
);

alter table vicpagers_messages enable row level security;
create policy "Public read vicpagers_messages"
  on vicpagers_messages for select using (true);
create policy "Auth insert vicpagers_messages"
  on vicpagers_messages for insert to authenticated with check (true);
alter publication supabase_realtime add table vicpagers_messages;

create index if not exists idx_vicpagers_received_at on vicpagers_messages(received_at desc);
create index if not exists idx_vicpagers_incident_id on vicpagers_messages(incident_id);
create index if not exists idx_vicpagers_type on vicpagers_messages(type);
