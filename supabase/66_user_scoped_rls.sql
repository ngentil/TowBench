-- Replace company-scoped RLS with user-scoped RLS.
-- Each row belongs to the auth.uid() that created it. No company abstraction.
-- Run this in Supabase SQL Editor.

-- ── 1. Add user_id (with server-side default) to each table ──────────────
-- DEFAULT auth.uid() means inserts never need to pass user_id explicitly.

alter table tow_trucks        add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table depots             add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table tow_allocation_log add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table dispatched_jobs    add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table map_notes          add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table driver_locations   add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table company_config     add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table tow_ins            add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table job_accepted       add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table storage_types      add column if not exists user_id uuid references auth.users(id) default auth.uid();
-- storage_types.company_id is NOT NULL — relax it so new rows don't need a company
alter table storage_types alter column company_id drop not null;

-- ── 2. Backfill user_id for existing rows ─────────────────────────────────

update tow_trucks t        set user_id = up.id from user_profiles up where up.company_id = t.company_id        and t.user_id is null;
update depots d            set user_id = up.id from user_profiles up where up.company_id = d.company_id        and d.user_id is null;
update tow_allocation_log l set user_id = up.id from user_profiles up where up.company_id = l.company_id       and l.user_id is null;
update dispatched_jobs j   set user_id = up.id from user_profiles up where up.company_id = j.company_id        and j.user_id is null;
update map_notes m         set user_id = up.id from user_profiles up where up.company_id = m.company_id        and m.user_id is null;
update driver_locations dl set user_id = up.id from user_profiles up where up.company_id = dl.company_id       and dl.user_id is null;
update company_config cc   set user_id = up.id from user_profiles up where up.company_id = cc.company_id       and cc.user_id is null;
update tow_ins ti          set user_id = up.id from user_profiles up where up.company_id = ti.company_id       and ti.user_id is null;
update job_accepted ja     set user_id = au.id from auth.users au   where au.email = ja.accepted_by            and ja.user_id is null;
update storage_types st    set user_id = up.id from user_profiles up where up.company_id = st.company_id         and st.user_id is null;

-- ── 3. Drop every existing policy on affected tables ──────────────────────

do $$ declare
  t   text;
  pol record;
begin
  foreach t in array array[
    'tow_trucks', 'depots', 'tow_allocation_log', 'dispatched_jobs',
    'map_notes', 'driver_locations', 'company_config', 'tow_ins',
    'tow_in_photos', 'dispatched_job_photos',
    'job_accepted', 'user_profiles', 'companies', 'invite_codes',
    'tow_in_transfers', 'storage_types'
  ] loop
    for pol in select policyname from pg_policies where tablename = t loop
      execute format('drop policy if exists %I on %I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- ── 4. New user-scoped RLS policies ──────────────────────────────────────

create policy "own" on tow_trucks         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on depots             for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on tow_allocation_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on dispatched_jobs    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on map_notes          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on driver_locations   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on company_config     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on tow_ins            for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on job_accepted       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on user_profiles      for all using (id       = auth.uid()) with check (id       = auth.uid());

-- tow_in_photos: own via parent tow_in
create policy "own" on tow_in_photos for all
  using     (exists (select 1 from tow_ins ti where ti.id = tow_in_photos.tow_in_id     and ti.user_id = auth.uid()))
  with check (exists (select 1 from tow_ins ti where ti.id = tow_in_photos.tow_in_id    and ti.user_id = auth.uid()));

-- dispatched_job_photos: own via parent dispatched_job
create policy "own" on dispatched_job_photos for all
  using     (exists (select 1 from dispatched_jobs dj where dj.id = dispatched_job_photos.job_id and dj.user_id = auth.uid()))
  with check (exists (select 1 from dispatched_jobs dj where dj.id = dispatched_job_photos.job_id and dj.user_id = auth.uid()));

-- tow_in_transfers: own via parent tow_in
create policy "own" on tow_in_transfers for all
  using     (exists (select 1 from tow_ins ti where ti.id = tow_in_transfers.tow_in_id  and ti.user_id = auth.uid()))
  with check (exists (select 1 from tow_ins ti where ti.id = tow_in_transfers.tow_in_id and ti.user_id = auth.uid()));

-- storage_types: reference data, readable by all authenticated
create policy "own" on storage_types for all
  using     (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 5. Fix handle_new_user ─────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, role)
  values (new.id, 'admin')
  on conflict (id) do nothing;

  insert into public.company_config (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
exception when others then
  raise log 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;

-- Unique: one config row per user
create unique index if not exists company_config_user_id_unique
  on company_config (user_id)
  where user_id is not null;
