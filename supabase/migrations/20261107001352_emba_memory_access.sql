create table emba_memory (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  kind text not null check (kind in ('want','intent')),
  org_id uuid,
  loop_id uuid,
  current_version integer not null check (current_version > 0),
  created_at timestamptz not null default now(),
  unique (person_id,id),
  check ((org_id is null) = (loop_id is null)),
  foreign key (org_id,loop_id) references emba_loop(org_id,id)
);
create index emba_memory_loop on emba_memory(org_id,loop_id);
create table emba_memory_version (
  person_id uuid not null,
  memory_id uuid not null,
  version integer not null check (version > 0),
  text text not null check (length(btrim(text)) between 1 and 240),
  category text not null check (category in ('food','culture','outdoors','social','rest','travel','learning','other')),
  place text check (length(place) between 1 and 120),
  strength double precision not null check (strength between 0 and 1),
  confidence double precision not null check (confidence between 0 and 1),
  evidence_count integer not null default 1 check (evidence_count >= 0),
  status text not null check (status in ('active','needs_review','superseded','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  confirmed_at timestamptz not null default now(),
  primary key (person_id,memory_id,version),
  foreign key (person_id,memory_id) references emba_memory(person_id,id) on delete cascade,
  check ((starts_at is null) = (ends_at is null)),
  check (ends_at > starts_at)
);
alter table emba_memory add foreign key (person_id,id,current_version)
  references emba_memory_version(person_id,memory_id,version) deferrable initially deferred;
create table emba_memory_operation (
  person_id uuid not null references person(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  memory_id uuid not null,
  version integer not null,
  evidence_kind text not null check (evidence_kind in ('explicit','correction')),
  created_at timestamptz not null default now(),
  primary key (person_id,operation_id),
  foreign key (person_id,memory_id,version) references emba_memory_version(person_id,memory_id,version) on delete cascade
);
create index emba_memory_operation_version on emba_memory_operation(person_id,memory_id,version);
create table emba_lease (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 200),
  actions text[] not null check (cardinality(actions) > 0 and actions <@ array['memory:read','memory:write','plan:read','activity:write']),
  org_id uuid,
  loop_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz,
  check ((org_id is null) = (loop_id is null)),
  foreign key (org_id,loop_id) references emba_loop(org_id,id)
);
create index emba_lease_owner_client on emba_lease(person_id,client_id);
create index emba_lease_loop on emba_lease(org_id,loop_id);
create table emba_audit (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  client_id text,
  action text not null check (action in ('memory:read','memory:write','plan:read','activity:write','lease:grant','lease:revoke','lease:list','audit:read','confirmation:approve')),
  resource_id uuid,
  lease_id uuid references emba_lease(id) on delete set null,
  at timestamptz not null default now(),
  outcome text not null default 'allowed' check (outcome in ('allowed','denied'))
);
create index emba_audit_owner on emba_audit(person_id,at);
create index emba_audit_lease on emba_audit(lease_id);
alter table emba_memory enable row level security;
alter table emba_memory_version enable row level security;
alter table emba_memory_operation enable row level security;
alter table emba_lease enable row level security;
alter table emba_audit enable row level security;
revoke all on emba_memory,emba_memory_version,emba_memory_operation,emba_lease,emba_audit from public,anon,authenticated;
