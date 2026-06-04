-- Per-user tab order and visibility preferences
alter table user_profiles
  add column if not exists tab_preferences jsonb;
-- Shape: { order: ['allocations','dispatch',...], hidden: ['waze','analytics'] }
