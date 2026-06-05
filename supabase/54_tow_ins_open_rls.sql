-- Open tow_ins, tow_in_photos, and storage to any authenticated user.
-- Also adds separate make and model columns to tow_ins.

-- tow_ins
do $$ declare pol record;
begin for pol in select policyname from pg_policies where tablename = 'tow_ins' loop
  execute format('drop policy if exists %I on tow_ins', pol.policyname);
end loop; end $$;

create policy "authenticated all" on tow_ins for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- tow_in_photos
do $$ declare pol record;
begin for pol in select policyname from pg_policies where tablename = 'tow_in_photos' loop
  execute format('drop policy if exists %I on tow_in_photos', pol.policyname);
end loop; end $$;

create policy "authenticated all" on tow_in_photos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage bucket policies for tow-in-photos
drop policy if exists "company upload tow photos" on storage.objects;
drop policy if exists "company read tow photos"   on storage.objects;
drop policy if exists "company delete tow photos" on storage.objects;

create policy "auth tow photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tow-in-photos');

create policy "auth tow photos select" on storage.objects
  for select to authenticated
  using (bucket_id = 'tow-in-photos');

create policy "auth tow photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tow-in-photos');

-- Separate make / model columns (make_model kept for legacy reads)
alter table tow_ins
  add column if not exists make  text,
  add column if not exists model text;
