-- Delete ALL users and their data. Clean slate.
-- Run in Supabase SQL Editor (requires service-role / superuser context).
-- ⚠️  IRREVERSIBLE — this wipes every row from every user-owned table.

-- User-owned data (delete before auth.users to avoid FK issues)
delete from dispatched_job_photos;
delete from tow_in_photos;
delete from tow_in_transfers;
delete from dispatched_jobs;
delete from tow_ins;
delete from storage_types;
delete from job_accepted;
delete from tow_allocation_log;
delete from map_notes;
delete from driver_locations;
delete from tow_trucks;
delete from depots;
delete from company_config;
delete from user_profiles;

-- Companies (optional — safe to keep or clear)
delete from companies;

-- Auth users — cascades to anything still referencing auth.users(id)
delete from auth.users;
