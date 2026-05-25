-- Extend invite_codes with role and company scope
alter table invite_codes
  add column if not exists role       text not null default 'driver'
    check (role in ('driver','dispatch','admin')),
  add column if not exists company_id uuid references companies(id);

-- Replace validate_invite_code — now returns role + company_id (breaking change, OK)
drop function if exists validate_invite_code(text);
create or replace function validate_invite_code(p_code text)
returns table(valid boolean, role text, company_id uuid)
language sql security definer as $$
  select true, ic.role, ic.company_id
  from invite_codes ic
  where upper(trim(ic.code)) = upper(trim(p_code)) and ic.used_at is null
  union all
  select false, null::text, null::uuid
  limit 1;
$$;

grant execute on function validate_invite_code(text) to anon;

-- Replace generate_invite_code — now accepts role + company_id
drop function if exists generate_invite_code();
create or replace function generate_invite_code(p_role text, p_company_id uuid default null)
returns text language plpgsql security definer as $$
declare
  v_code        text;
  v_chars       text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i           int;
  v_caller_role text;
begin
  v_caller_role := my_role();
  if v_caller_role not in ('super_admin') then
    if p_role != 'driver' then
      raise exception 'Only super_admin can issue dispatch/admin codes';
    end if;
    if p_company_id is distinct from my_company_id() then
      raise exception 'Can only issue codes for your own company';
    end if;
  end if;
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from invite_codes where code = v_code);
  end loop;
  insert into invite_codes (code, role, company_id) values (v_code, p_role, p_company_id);
  return v_code;
end $$;

grant execute on function generate_invite_code(text, uuid) to authenticated;

-- Consume invite code after signup
drop function if exists consume_invite_code(text, text);
create or replace function consume_invite_code(p_code text, p_used_by text)
returns boolean language plpgsql security definer as $$
begin
  update invite_codes
  set used_by = p_used_by, used_at = now()
  where upper(trim(code)) = upper(trim(p_code)) and used_at is null;
  return found;
end $$;

grant execute on function consume_invite_code(text, text) to authenticated;
