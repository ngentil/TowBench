-- Fix create_company_and_admin to handle the case where handle_new_user()
-- already inserted a default profile row. Use upsert so it overwrites
-- the default company assignment with the real one.
-- Also adds set search_path = '' for Supabase security compliance.

create or replace function create_company_and_admin(p_company_name text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  insert into public.companies (name) values (trim(p_company_name)) returning id into v_company_id;
  insert into public.user_profiles (id, company_id, role)
  values (auth.uid(), v_company_id, 'admin')
  on conflict (id) do update
    set company_id = excluded.company_id,
        role       = excluded.role;
  -- Ensure a company_config row exists for this new company
  insert into public.company_config (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;
  return v_company_id;
end $$;
