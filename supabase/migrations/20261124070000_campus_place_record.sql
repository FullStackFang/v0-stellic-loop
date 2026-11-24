-- A place's record page (openspec campus-venue-record, design D3): /places/<campus>/<place>/record opens with the
-- private key `record_token` (made the first time the admin copies the link, replaced by "New link"), or for anyone
-- once `record_public` is on. Additive and safe to run twice. Rollback: drop the two columns.
set lock_timeout = '5s';
begin;

alter table campus_place add column if not exists record_token text unique check(record_token ~ '^[A-Za-z0-9_-]{16,64}$');
alter table campus_place add column if not exists record_public boolean not null default false;

commit;
