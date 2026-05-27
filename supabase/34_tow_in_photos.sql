-- Photos attached to tow-in records.
-- Storage path: tow-in-photos/{company_id}/{tow_in_id}/{filename}
-- Run this in the Supabase SQL editor.

-- Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('tow-in-photos', 'tow-in-photos', false)
on conflict (id) do nothing;

-- Storage RLS: upload
drop policy if exists "company upload tow photos" on storage.objects;
create policy "company upload tow photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tow-in-photos'
    and split_part(name, '/', 1) = (my_company_id())::text
  );

-- Storage RLS: read
drop policy if exists "company read tow photos" on storage.objects;
create policy "company read tow photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tow-in-photos'
    and split_part(name, '/', 1) = (my_company_id())::text
  );

-- Storage RLS: delete
drop policy if exists "company delete tow photos" on storage.objects;
create policy "company delete tow photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tow-in-photos'
    and split_part(name, '/', 1) = (my_company_id())::text
  );

-- Photo records table
create table if not exists tow_in_photos (
  id         uuid primary key default gen_random_uuid(),
  tow_in_id  uuid not null references tow_ins(id) on delete cascade,
  company_id uuid references companies(id),
  path       text not null,
  file_name  text,
  created_by text,
  created_at timestamptz default now()
);

alter table tow_in_photos enable row level security;

drop policy if exists "company read tow_in_photos"   on tow_in_photos;
drop policy if exists "company insert tow_in_photos" on tow_in_photos;
drop policy if exists "company delete tow_in_photos" on tow_in_photos;

create policy "company read tow_in_photos" on tow_in_photos
  for select using (company_id = my_company_id() or my_role() = 'super_admin');

create policy "company insert tow_in_photos" on tow_in_photos
  for insert with check (company_id = my_company_id() or my_role() = 'super_admin');

create policy "company delete tow_in_photos" on tow_in_photos
  for delete using (company_id = my_company_id() or my_role() = 'super_admin');
