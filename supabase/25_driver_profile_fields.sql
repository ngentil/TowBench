-- New driver onboarding fields on tow_trucks
alter table tow_trucks
  add column if not exists da_number              text,
  add column if not exists first_name             text,
  add column if not exists last_name              text,
  add column if not exists licence_address        text,
  add column if not exists licence_photo_url      text,
  add column if not exists approved               boolean not null default false,
  add column if not exists is_vic_certified_plate boolean not null default false;

-- Auto-flag Victorian certified tow plates (format: TOW + exactly 3 alphanumeric chars)
create or replace function flag_vic_tow_plate()
returns trigger language plpgsql as $$
begin
  new.is_vic_certified_plate := (upper(new.plate) ~ '^TOW[A-Z0-9]{3}$');
  return new;
end $$;

drop trigger if exists trg_flag_vic_tow_plate on tow_trucks;
create trigger trg_flag_vic_tow_plate
  before insert or update of plate on tow_trucks
  for each row execute function flag_vic_tow_plate();

-- Backfill existing plates
update tow_trucks set is_vic_certified_plate = (upper(plate) ~ '^TOW[A-Z0-9]{3}$');

-- Lookup a truck by plate (any format, no format restriction).
-- Returns null if the plate is not in the fleet.
create or replace function get_truck_by_plate(p_plate text)
returns jsonb language plpgsql security definer as $$
declare
  v_normalized text;
  v_row        record;
  v_registered boolean;
begin
  v_normalized := upper(regexp_replace(trim(p_plate), '\s+', ''));

  select id, plate, auth_email, approved, company_id, is_vic_certified_plate
  into v_row
  from tow_trucks
  where upper(regexp_replace(trim(plate), '\s+', '')) = v_normalized
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  if v_row.auth_email is not null then
    select exists(select 1 from auth.users where email = v_row.auth_email)
    into v_registered;
  else
    v_registered := false;
  end if;

  return jsonb_build_object(
    'plate',                  v_row.plate,
    'email',                  v_row.auth_email,
    'registered',             v_registered,
    'approved',               v_row.approved,
    'company_id',             v_row.company_id,
    'is_vic_certified_plate', v_row.is_vic_certified_plate
  );
end $$;

grant execute on function get_truck_by_plate(text) to anon;

-- Supabase Storage bucket 'licence-photos' must be created manually in the dashboard:
--   Storage → New bucket → name: licence-photos → private
--   Add policy: authenticated users can upload to path starting with their uid
