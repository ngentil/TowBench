-- Company white-label config (single row)
create table if not exists company_config (
  id           uuid  primary key default gen_random_uuid(),
  company_name text  not null default 'TowBench',
  accent_color text  not null default '#e8670a',
  logo_url     text,
  updated_at   timestamptz default now()
);

alter table company_config enable row level security;

-- Everyone can read the config (needed at app load before auth)
create policy "public read"
  on company_config for select
  using (true);

-- Only admins can write
create policy "admin write"
  on company_config for all
  using (
    exists (
      select 1 from tow_trucks
      where email = auth.jwt() ->> 'email'
        and is_admin = true
    )
  );

-- Seed the default row if none exists
insert into company_config (company_name)
select 'TowBench'
where not exists (select 1 from company_config);
