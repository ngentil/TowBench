-- Comprehensive fix for company_config schema and data.
-- Safe to run multiple times.

-- 1. Ensure company_id column exists with unique constraint
alter table company_config
  add column if not exists company_id uuid references companies(id);

do $$ begin
  -- Add unique constraint only if it doesn't exist
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'company_config'
      and constraint_type = 'UNIQUE'
      and constraint_name like '%company_id%'
  ) then
    alter table company_config add constraint company_config_company_id_key unique (company_id);
  end if;
end $$;

-- 2. Ensure the default company exists
insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'TowBench')
on conflict (id) do nothing;

-- 3. Link any unlinked company_config rows to the default company
update company_config
set company_id = '00000000-0000-0000-0000-000000000001'
where company_id is null;

-- 4. Remove duplicate company_config rows, keep the one with most data (highest id)
delete from company_config
where id not in (
  select max(id) from company_config group by company_id
);

-- 5. Ensure a company_config row exists for the default company
insert into company_config (company_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (company_id) do nothing;

-- 6. Add all pricing columns
alter table company_config
  add column if not exists trade_base_fee          numeric(10,2) default 0,
  add column if not exists accident_base_fee       numeric(10,2) default 0,
  add column if not exists trade_per_km_fee        numeric(10,2) default 0,
  add column if not exists accident_per_km_fee     numeric(10,2) default 0,
  add column if not exists after_hours_fee_weekday numeric(10,2) default 0,
  add column if not exists after_hours_fee_weekend numeric(10,2) default 0,
  add column if not exists after_hours_start_weekday time        default '18:00',
  add column if not exists after_hours_end_weekday   time        default '06:00',
  add column if not exists after_hours_start_weekend time        default '18:00',
  add column if not exists after_hours_end_weekend   time        default '06:00',
  add column if not exists allow_accident_twoup    boolean       default false;

-- 7. Rename old after_hours_fee column if it still exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'company_config' and column_name = 'after_hours_fee'
  ) then
    alter table company_config rename column after_hours_fee to after_hours_fee_old;
  end if;
end $$;
