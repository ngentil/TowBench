-- Fix FK constraints so records can be deleted without cascade errors.
--
-- dispatched_jobs delete: null out the tow_in reference (keep the tow_in record)
-- tow_ins delete: cascade to photos and transfers

alter table tow_ins
  drop constraint if exists tow_ins_dispatched_job_id_fkey;
alter table tow_ins
  add constraint tow_ins_dispatched_job_id_fkey
    foreign key (dispatched_job_id) references dispatched_jobs(id)
    on delete set null;

alter table tow_in_photos
  drop constraint if exists tow_in_photos_tow_in_id_fkey;
alter table tow_in_photos
  add constraint tow_in_photos_tow_in_id_fkey
    foreign key (tow_in_id) references tow_ins(id)
    on delete cascade;

alter table tow_in_transfers
  drop constraint if exists tow_in_transfers_tow_in_id_fkey;
alter table tow_in_transfers
  add constraint tow_in_transfers_tow_in_id_fkey
    foreign key (tow_in_id) references tow_ins(id)
    on delete cascade;
