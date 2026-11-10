-- Pilot-only deletion ledger; no FK so restoring/removing a person cannot erase it.
-- Retention durations and backup deletion remain approval gates, not guessed TTLs.
create table emba_deletion_tombstone (
 person_id uuid primary key,
 deleted_at timestamptz not null default clock_timestamp()
);
alter table emba_deletion_tombstone enable row level security;
revoke all on emba_deletion_tombstone from public,anon,authenticated;
alter table emba_audit alter column person_id drop not null;
alter table emba_document_version alter column uploaded_by drop not null;
alter table emba_announcement_key alter column registered_by drop not null;
alter table emba_audit drop constraint emba_audit_action_check;
alter table emba_audit add constraint emba_audit_action_check check (action in ('memory:read','memory:write','plan:read','activity:write','lease:grant','lease:revoke','lease:list','audit:read','confirmation:approve','confirmation:consume','knowledge:write','activity:create','activity:revise','activity:commit','activity:finalize','activity:withdraw','activity:dependency-consent','activity:completed','activity:cancelled','activity:read','activity:list','activity:disclosure','activity:names','activity:report','inbox:read','inbox:acknowledge','privacy:export','privacy:delete'));
