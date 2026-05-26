alter table company_config
  rename column after_hours_fee to after_hours_fee_weekday;

alter table company_config
  add column if not exists trade_base_fee          numeric(10,2) default 0,
  add column if not exists accident_base_fee       numeric(10,2) default 0,
  add column if not exists trade_per_km_fee        numeric(10,2) default 0,
  add column if not exists accident_per_km_fee     numeric(10,2) default 0,
  add column if not exists after_hours_fee_weekend numeric(10,2) default 0,
  add column if not exists storage_car_undercover  numeric(10,2) default 0,
  add column if not exists storage_bike_undercover numeric(10,2) default 0,
  add column if not exists storage_car_yard        numeric(10,2) default 0,
  add column if not exists storage_bike_yard       numeric(10,2) default 0;
