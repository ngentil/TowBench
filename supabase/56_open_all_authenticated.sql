-- Open every table to any authenticated user — read and write.
-- Run once in Supabase SQL Editor.

do $$ declare
  t text;
  pol record;
begin
  foreach t in array array[
    'tow_trucks', 'depots', 'dispatched_jobs', 'storage_types',
    'tow_ins', 'tow_in_photos', 'tow_in_transfers',
    'company_config', 'companies', 'user_profiles',
    'invite_codes', 'tow_allocation_log', 'driver_locations',
    'job_accepted', 'map_notes'
  ] loop
    for pol in
      select policyname from pg_policies where tablename = t
    loop
      execute format('drop policy if exists %I on %I', pol.policyname, t);
    end loop;
    execute format(
      'create policy "auth all" on %I for all
       using (auth.role() = ''authenticated'')
       with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- Storage: tow-in-photos bucket
drop policy if exists "auth tow photos insert" on storage.objects;
drop policy if exists "auth tow photos select" on storage.objects;
drop policy if exists "auth tow photos delete" on storage.objects;
drop policy if exists "auth tow photos update" on storage.objects;

create policy "auth storage all" on storage.objects
  for all to authenticated
  using     (bucket_id in ('tow-in-photos', 'licence-photos'))
  with check (bucket_id in ('tow-in-photos', 'licence-photos'));
