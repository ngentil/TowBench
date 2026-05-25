create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);

alter table companies enable row level security;

-- Any authenticated user can read companies (needed for super_admin UI)
create policy "auth read" on companies for select using (auth.role() = 'authenticated');

-- Only super_admin can write (enforced via security definer functions)
create policy "super_admin write" on companies for all
  using (exists (
    select 1 from user_profiles where id = auth.uid() and role = 'super_admin'
  ));

grant select, insert, update on companies to authenticated;

-- Seed default company for existing data
insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'TowBench')
on conflict (id) do nothing;
