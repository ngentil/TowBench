-- Allow admins to generate dispatch codes for their own company
-- (previously only super_admin could issue non-driver codes)
create or replace function generate_invite_code(p_role text, p_company_id uuid default null)
returns text language plpgsql security definer as $$
declare
  v_code        text;
  v_chars       text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i           int;
  v_caller_role text;
begin
  v_caller_role := my_role();
  if v_caller_role = 'super_admin' then
    null; -- unrestricted
  elsif v_caller_role = 'admin' then
    if p_role not in ('driver', 'dispatch') then
      raise exception 'Admins can only issue driver or dispatch codes';
    end if;
    if p_company_id is distinct from my_company_id() then
      raise exception 'Can only issue codes for your own company';
    end if;
  else
    raise exception 'Insufficient permissions to generate invite codes';
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
