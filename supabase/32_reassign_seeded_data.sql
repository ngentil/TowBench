-- Reassign rows seeded with the placeholder company ID to the real company.
-- Safe to run multiple times (no-op if already reassigned).
do $$
declare
  v_company_id uuid;
  v_placeholder uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Prefer a company that already has an admin profile
  select up.company_id into v_company_id
  from user_profiles up
  where up.role in ('admin', 'super_admin')
    and up.company_id is not null
  limit 1;

  -- Fallback: any company that isn't the placeholder
  if v_company_id is null then
    select id into v_company_id from companies where id != v_placeholder limit 1;
  end if;

  if v_company_id is null then
    raise notice 'No real company found — skipping reassignment.';
    return;
  end if;

  update depots       set company_id = v_company_id where company_id = v_placeholder;
  update tow_trucks   set company_id = v_company_id where company_id = v_placeholder;
  update company_config set company_id = v_company_id where company_id = v_placeholder;

  raise notice 'Seeded rows reassigned to company %', v_company_id;
end $$;
