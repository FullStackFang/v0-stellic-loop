create table emba_activity (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, loop_id uuid not null,
 creator_id uuid references person(id) on delete set null, revision integer not null default 1,
 state text not null default 'open' check(state in ('draft','open','finalized','completed','cancelled')),
 degraded boolean not null default false, event_version integer not null default 0,
 foreign key(org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create table emba_activity_revision (
 activity_id uuid references emba_activity(id) on delete cascade, revision integer not null check(revision>0),
 title text not null, place text not null, timezone text not null, starts_at timestamptz not null,
 ends_at timestamptz not null, deadline timestamptz not null,
 primary key(activity_id,revision), check(ends_at>starts_at), check(deadline<=starts_at)
);
create table emba_commitment (
 activity_id uuid not null, revision integer not null, person_id uuid references person(id) on delete cascade,
 min_others integer not null check(min_others>=0), requires uuid[] not null default '{}',
 status text not null check(status in ('active','withdrawn','suspended','satisfied','unresolved')),
 disclose_name boolean not null default false,
 primary key(activity_id,revision,person_id),
 foreign key(activity_id,revision) references emba_activity_revision(activity_id,revision) on delete cascade
);
create table emba_activity_operation (
 activity_id uuid references emba_activity(id) on delete cascade, person_id uuid references person(id) on delete cascade,
 operation_id uuid not null, request_hash text not null, primary key(activity_id,person_id,operation_id)
);
create table emba_dependency_consent (
 activity_id uuid not null, revision integer not null, target_id uuid references person(id) on delete cascade,
 requester_id uuid references person(id) on delete cascade, allowed boolean not null,
 primary key(activity_id,revision,target_id,requester_id), check(target_id<>requester_id),
 foreign key(activity_id,revision) references emba_activity_revision(activity_id,revision) on delete cascade
);
-- Resolution has no mutable participant identifiers; individual current outcomes live in commitments.
create table emba_resolution (
 activity_id uuid not null, revision integer not null, finalized_at timestamptz not null default clock_timestamp(),
 primary key(activity_id,revision),
 foreign key(activity_id,revision) references emba_activity_revision(activity_id,revision) on delete cascade
);
create table emba_resolution_outcome (
 activity_id uuid not null, revision integer not null,
 person_id uuid references person(id) on delete set null, satisfied boolean not null,
 unique(activity_id,revision,person_id),
 foreign key(activity_id,revision) references emba_resolution(activity_id,revision) on delete cascade
);
create table emba_activity_report (
 activity_id uuid primary key references emba_activity(id) on delete cascade, report jsonb not null
);
create table emba_inbox (
 id uuid primary key default gen_random_uuid(), person_id uuid references person(id) on delete cascade,
 activity_id uuid references emba_activity(id) on delete cascade, revision integer not null, event_version integer not null,
 kind text not null, created_at timestamptz not null default clock_timestamp(), acknowledged_at timestamptz,
 unique(person_id,activity_id,revision,event_version)
);
create table emba_outbox (
 inbox_id uuid primary key references emba_inbox(id) on delete cascade,
 delivered_at timestamptz, attempts integer not null default 0
);
create table emba_inbox_cursor (
 id uuid primary key default gen_random_uuid(),person_id uuid references person(id) on delete cascade,
 client_id text,before_created timestamptz not null,before_id uuid not null,
 expires_at timestamptz not null default(clock_timestamp()+interval '1 hour')
);
do $$ declare t text; begin
 foreach t in array array['emba_activity','emba_activity_revision','emba_commitment','emba_activity_operation','emba_dependency_consent','emba_resolution','emba_resolution_outcome','emba_activity_report','emba_inbox','emba_outbox','emba_inbox_cursor'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public, anon, authenticated',t);
 end loop;
end $$;
