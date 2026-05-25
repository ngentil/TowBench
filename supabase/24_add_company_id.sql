-- Add company_id to all tenant-scoped tables
alter table tow_trucks         add column if not exists company_id uuid references companies(id);
alter table depots             add column if not exists company_id uuid references companies(id);
alter table tow_allocation_log add column if not exists company_id uuid references companies(id);
alter table job_accepted       add column if not exists company_id uuid references companies(id);
alter table map_notes          add column if not exists company_id uuid references companies(id);
alter table driver_locations   add column if not exists company_id uuid references companies(id);
alter table company_config     add column if not exists company_id uuid references companies(id) unique;

-- Migrate existing rows to default company
update tow_trucks         set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
update depots             set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
update tow_allocation_log set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
update company_config     set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
