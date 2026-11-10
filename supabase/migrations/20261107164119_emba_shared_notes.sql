-- Limited shared-memory slice: unsourced member notes only. No private Want references.
create table emba_group_memory (
 id uuid primary key,
 org_id uuid not null,
 loop_id uuid not null,
 author_id uuid references person(id) on delete set null,
 kind text not null default 'note' check(kind='note'),
 provenance text not null default 'member_submission' check(provenance='member_submission'),
 current_version integer not null check(current_version>0),
 status text not null default 'active' check(status in ('active','withdrawn')),
 foreign key(org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create index emba_group_memory_scope on emba_group_memory(org_id,loop_id,status);
create table emba_group_memory_version (
 record_id uuid not null references emba_group_memory(id) on delete cascade,
 version integer not null check(version>0),
 text text,
 status text not null check(status in ('active','withdrawn')),
 edited_by uuid references person(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(record_id,version),
 check((status='withdrawn' and text is null) or (status='active' and text is not null and length(text) between 1 and 2000 and octet_length(text)<=8000))
);
alter table emba_group_memory add foreign key(id,current_version) references emba_group_memory_version(record_id,version) deferrable initially deferred;
create table emba_group_memory_operation (
 person_id uuid not null references person(id) on delete cascade,
 operation_id uuid not null,
 client_id text,
 request_hash text not null check(length(request_hash)=64),
 record_id uuid not null,
 version integer not null,
 primary key(person_id,operation_id),
 foreign key(record_id,version) references emba_group_memory_version(record_id,version) on delete cascade
);
alter table emba_group_memory enable row level security;
alter table emba_group_memory_version enable row level security;
alter table emba_group_memory_operation enable row level security;
revoke all on emba_group_memory,emba_group_memory_version,emba_group_memory_operation from public,anon,authenticated;
