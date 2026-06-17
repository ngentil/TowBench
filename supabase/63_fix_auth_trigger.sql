-- Fix "Database error saving new user": Supabase now requires security definer
-- functions to declare set search_path = '' so they can't be exploited via
-- search path injection. Without it, the trigger runs in the auth schema
-- and can't see public.companies or public.user_profiles.
--
-- Run this in Supabase SQL Editor to fix new user signup.

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.companies (id, name)
  values ('00000000-0000-0000-0000-000000000001', 'TowBench')
  on conflict (id) do nothing;

  insert into public.user_profiles (id, company_id, role)
  values (new.id, '00000000-0000-0000-0000-000000000001', 'admin')
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Log but don't block signup — profile can be created on first login
  raise log 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;
