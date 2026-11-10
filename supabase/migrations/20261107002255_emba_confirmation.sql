-- Confirmation is an additional gate, never a replacement for current authority.
-- Only a digest of the reviewed structured action payload is durable.
create table emba_confirmation (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 200),
  action text not null check (action in ('commitment','identity_disclosure','publication')),
  target_id text not null check (length(target_id) between 1 and 200),
  expected_version bigint not null check (expected_version > 0),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  check (expires_at = created_at + interval '10 minutes'),
  check (consumed_at is null or (consumed_at >= created_at and consumed_at < expires_at))
);
create index emba_confirmation_person on emba_confirmation(person_id,created_at);
alter table emba_confirmation enable row level security;
revoke all on emba_confirmation from public,anon,authenticated;

alter table emba_audit drop constraint emba_audit_action_check;
alter table emba_audit add constraint emba_audit_action_check check (action in (
  'memory:read','memory:write','plan:read','activity:write',
  'lease:grant','lease:revoke','lease:list','audit:read',
  'confirmation:approve','confirmation:consume'
));
