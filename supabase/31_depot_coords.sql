alter table depots
  add column if not exists address text,
  add column if not exists lat     numeric(10,7),
  add column if not exists lng     numeric(10,7);

alter table company_config
  add column if not exists allow_accident_twoUp boolean not null default false;
