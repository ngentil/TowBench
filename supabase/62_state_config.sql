-- Add state field to company_config for multi-state routing
alter table company_config
  add column if not exists state text not null default 'vic'
    check (state in ('vic', 'nsw', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'));
