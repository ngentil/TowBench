-- Make expires_at optional now that handover notes persist indefinitely
alter table map_notes
  alter column expires_at drop not null;
