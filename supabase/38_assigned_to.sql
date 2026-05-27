-- Store which driver (auth_email) a dispatched job is assigned to
alter table dispatched_jobs
  add column if not exists assigned_to text;
