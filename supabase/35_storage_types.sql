-- Dynamic storage types per company.
-- Replaces the four hardcoded storage fields in company_config.

create table if not exists storage_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  daily_rate numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

alter table storage_types enable row level security;

drop policy if exists "company read storage_types"  on storage_types;
drop policy if exists "admin write storage_types"   on storage_types;

create policy "company read storage_types" on storage_types
  for select using (company_id = my_company_id() or my_role() = 'super_admin');

create policy "admin write storage_types" on storage_types
  for all using  (company_id = my_company_id() or my_role() = 'super_admin')
  with check     (company_id = my_company_id() or my_role() = 'super_admin');
