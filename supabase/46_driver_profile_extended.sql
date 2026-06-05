-- Extended personal/credential fields for tow truck drivers
alter table tow_trucks
  add column if not exists phone                     text,
  add column if not exists date_of_birth             date,
  add column if not exists home_address              text,
  add column if not exists drivers_licence_number    text,
  add column if not exists drivers_licence_expiry    date,
  add column if not exists drivers_licence_photo_url text,
  add column if not exists da_expiry                 date,
  add column if not exists emergency_contact_name    text,
  add column if not exists emergency_contact_phone   text;

-- Profile data for non-driver users (dispatch / admin) who have no tow_trucks row
alter table user_profiles
  add column if not exists profile_data jsonb;
