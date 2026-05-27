-- Truck type / vehicle category field
alter table tow_trucks
  add column if not exists truck_type text;
