create table if not exists user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id),
  role       text not null check (role in ('driver','dispatch','admin','super_admin')),
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;

-- Own profile: always readable
create policy "own profile read" on user_profiles for select using (id = auth.uid());

-- Dispatch/admin can read all profiles in their company
create policy "company profile read" on user_profiles for select
  using (company_id = (select company_id from user_profiles where id = auth.uid()));

-- Users can only insert their own profile (on signup)
create policy "own insert" on user_profiles for insert with check (id = auth.uid());

grant select, insert on user_profiles to authenticated;

-- Helper: returns the calling user's company_id
create or replace function my_company_id()
returns uuid language sql stable security definer as $$
  select company_id from user_profiles where id = auth.uid()
$$;

-- Helper: returns the calling user's role
create or replace function my_role()
returns text language sql stable security definer as $$
  select role from user_profiles where id = auth.uid()
$$;

-- Create company + admin profile in one call (used during dispatcher admin signup)
create or replace function create_company_and_admin(p_company_name text)
returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
begin
  insert into companies (name) values (trim(p_company_name)) returning id into v_company_id;
  insert into user_profiles (id, company_id, role) values (auth.uid(), v_company_id, 'admin');
  return v_company_id;
end $$;

grant execute on function create_company_and_admin(text) to authenticated;
