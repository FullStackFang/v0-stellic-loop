create table emba_document (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  loop_id uuid not null,
  current_version integer not null check (current_version > 0),
  deleted_at timestamptz,
  foreign key (org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create index emba_document_loop on emba_document(org_id,loop_id);
create table emba_document_version (
  document_id uuid not null references emba_document(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null check (length(title) between 1 and 200),
  media_type text not null check (media_type in ('text/plain','application/json')),
  body text not null check (octet_length(body) between 1 and 262144),
  uploaded_by uuid not null references person(id),
  state text not null default 'accepted' check (state in ('accepted','extracting','indexing','ready','failed')),
  failed_stage text check (failed_stage in ('extracting','indexing')),
  attempts integer not null default 0,
  extracted jsonb,
  created_at timestamptz not null default now(),
  primary key (document_id,version)
);
alter table emba_document add foreign key (id,current_version) references emba_document_version(document_id,version) deferrable initially deferred;
create table emba_document_operation (
  person_id uuid not null references person(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  document_id uuid not null,
  version integer not null,
  primary key (person_id,operation_id),
  foreign key (document_id,version) references emba_document_version(document_id,version) on delete cascade
);
create table emba_document_passage (
  document_id uuid not null,
  version integer not null,
  ordinal integer not null,
  text text not null,
  location text not null,
  timezone text,
  itinerary_version text,
  claim_key text,
  claim_value text,
  search tsvector generated always as (to_tsvector('simple',text)) stored,
  primary key (document_id,version,ordinal),
  foreign key (document_id,version) references emba_document_version(document_id,version) on delete cascade
);
create index emba_document_passage_search on emba_document_passage using gin(search);
alter table emba_document enable row level security;
alter table emba_document_version enable row level security;
alter table emba_document_operation enable row level security;
alter table emba_document_passage enable row level security;
revoke all on emba_document,emba_document_version,emba_document_operation,emba_document_passage from public,anon,authenticated;
alter table emba_audit drop constraint emba_audit_action_check;
alter table emba_audit add constraint emba_audit_action_check check (action in ('memory:read','memory:write','plan:read','activity:write','lease:grant','lease:revoke','lease:list','audit:read','confirmation:approve','confirmation:consume','knowledge:write','activity:create','activity:revise','activity:commit','activity:finalize','activity:withdraw','activity:dependency-consent','activity:completed','activity:cancelled','activity:read','activity:list','activity:disclosure','activity:names','activity:report','inbox:read','inbox:acknowledge'));
