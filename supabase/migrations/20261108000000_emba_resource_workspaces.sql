-- Private workspace description is owner-authored metadata, not an affiliation claim.
alter table emba_organization add column description text not null default ''
  check (length(description) <= 1000);

-- Store searchable extracted text only; uploaded PDF bytes are discarded.
alter table emba_document_version drop constraint emba_document_version_media_type_check;
alter table emba_document_version add constraint emba_document_version_media_type_check
  check (media_type in ('text/plain','text/markdown','application/pdf','application/json'));

create table emba_group_request_link (
  org_id uuid not null,
  loop_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  public_label text not null check (length(public_label) <= 120),
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (org_id, loop_id),
  foreign key (org_id, loop_id) references emba_loop(org_id, id) on delete cascade
);
create table emba_group_membership_request (
  org_id uuid not null,
  loop_id uuid not null,
  person_id uuid not null references person(id) on delete cascade,
  state text not null check (state in ('pending','approved','declined')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references person(id),
  primary key (org_id, loop_id, person_id),
  foreign key (org_id, loop_id) references emba_loop(org_id, id) on delete cascade
);
alter table emba_group_request_link enable row level security;
alter table emba_group_membership_request enable row level security;
revoke all on emba_group_request_link, emba_group_membership_request from public, anon, authenticated;
