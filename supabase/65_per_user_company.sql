-- Fix: every new signup was being dropped into the same shared default company
-- (00000000-0000-0000-0000-000000000001). Now each user gets their own company.
-- The company name defaults to their email domain; they can rename it in Branding settings.

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_company_name text;
begin
  -- Use email domain as a friendly default company name
  v_company_name := split_part(new.email, '@', 2);
  if v_company_name = '' or v_company_name is null then
    v_company_name := 'My Company';
  end if;

  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  insert into public.user_profiles (id, company_id, role)
  values (new.id, v_company_id, 'admin')
  on conflict (id) do update
    set company_id = excluded.company_id,
        role       = excluded.role;

  insert into public.company_config (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  return new;
exception when others then
  raise log 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;
