-- Simple auth: any authenticated user gets full access.
-- Auto-create a user_profiles row (admin role, default company) for every new signup.

-- Trigger function
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Ensure default company exists
  insert into companies (id, name)
  values ('00000000-0000-0000-0000-000000000001', 'TowBench')
  on conflict (id) do nothing;

  insert into user_profiles (id, company_id, role)
  values (new.id, '00000000-0000-0000-0000-000000000001', 'admin')
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: give every existing auth user a profile if they don't have one
insert into user_profiles (id, company_id, role)
select u.id, '00000000-0000-0000-0000-000000000001', 'admin'
from auth.users u
where not exists (select 1 from user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Upgrade any existing profiles to admin so nothing is locked out
update user_profiles
set role = 'admin',
    company_id = '00000000-0000-0000-0000-000000000001'
where company_id is null or role not in ('admin', 'super_admin');
