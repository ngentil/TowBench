-- Wipe user-auth data; keep allocation history and truck records.
-- Run this BEFORE running 22+ migrations.
-- After this, manually delete all users in Supabase dashboard → Authentication → Users.

delete from driver_locations;
delete from job_accepted;
delete from map_notes;
delete from invite_codes;
delete from access_requests;

-- Clear auth links on trucks but keep all fleet records
update tow_trucks set auth_email = null, is_admin = false, driver_name = null;
