-- Ensure all pricing columns exist in company_config.
-- Safe to run multiple times (all use IF NOT EXISTS / DO NOTHING).

-- Original columns from migration 27 (may already exist)
alter table company_config
  add column if not exists base_fee                  numeric(10,2) default 0,
  add column if not exists per_km_fee                numeric(10,2) default 0,
  add column if not exists after_hours_start_weekday time         default '18:00',
  add column if not exists after_hours_end_weekday   time         default '06:00',
  add column if not exists after_hours_start_weekend time         default '18:00',
  add column if not exists after_hours_end_weekend   time         default '06:00';

-- Rename after_hours_fee → after_hours_fee_weekday only if the old column still exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'company_config' and column_name = 'after_hours_fee'
  ) then
    alter table company_config rename column after_hours_fee to after_hours_fee_weekday;
  end if;
end $$;

-- Extended pricing columns from migration 30
alter table company_config
  add column if not exists trade_base_fee          numeric(10,2) default 0,
  add column if not exists accident_base_fee       numeric(10,2) default 0,
  add column if not exists trade_per_km_fee        numeric(10,2) default 0,
  add column if not exists accident_per_km_fee     numeric(10,2) default 0,
  add column if not exists after_hours_fee_weekday numeric(10,2) default 0,
  add column if not exists after_hours_fee_weekend numeric(10,2) default 0,
  add column if not exists allow_accident_twoup    boolean       default false;

-- Ensure there is at least one company so the fallback lookup works
insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'TowBench')
on conflict (id) do nothing;

-- Ensure there is a company_config row for that company
insert into company_config (company_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (company_id) do nothing;
