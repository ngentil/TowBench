-- Pricing and after-hours config per company
alter table company_config
  add column if not exists base_fee                  numeric(10,2) default 0,
  add column if not exists per_km_fee                numeric(10,2) default 0,
  add column if not exists after_hours_fee           numeric(10,2) default 0,
  add column if not exists after_hours_start_weekday time default '18:00',
  add column if not exists after_hours_end_weekday   time default '06:00',
  add column if not exists after_hours_start_weekend time default '18:00',
  add column if not exists after_hours_end_weekend   time default '06:00';
