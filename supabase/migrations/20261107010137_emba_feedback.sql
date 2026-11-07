create table emba_feedback (
 person_id uuid not null references person(id) on delete cascade,
 activity_id uuid not null references emba_activity(id) on delete cascade,
 version integer not null check(version>0),
 attendance text not null check(attendance in ('attended','not_attended','unspecified')),
 assessment double precision check(assessment between 0 and 1),
 memory_id uuid, basis_version integer,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(person_id,activity_id),
 check ((assessment is null) = (memory_id is null)),
 check ((memory_id is null) = (basis_version is null)),
 foreign key(person_id,memory_id,basis_version) references emba_memory_version(person_id,memory_id,version) on delete cascade
);
create index emba_feedback_memory on emba_feedback(person_id,memory_id,basis_version);
create table emba_feedback_operation (
 person_id uuid references person(id) on delete cascade,
 operation_id uuid not null, request_hash text not null,
 primary key(person_id,operation_id)
);
alter table emba_feedback enable row level security;
alter table emba_feedback_operation enable row level security;
revoke all on emba_feedback,emba_feedback_operation from public,anon,authenticated;
