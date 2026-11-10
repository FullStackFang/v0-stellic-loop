-- Additive pilot foundation. Legacy sessions and board_person rows grant no roles here.
create table emba_identity (
  issuer text not null check (length(btrim(issuer)) > 0),
  subject text not null check (length(btrim(subject)) > 0),
  person_id uuid not null references person(id) on delete cascade,
  verified_at timestamptz not null,
  revoked_at timestamptz,
  primary key (issuer, subject)
);
create index emba_identity_person on emba_identity(person_id);

create table emba_organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table emba_membership (
  org_id uuid not null references emba_organization(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (org_id, person_id)
);
create index emba_membership_person on emba_membership(person_id, org_id);

create table emba_loop (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references emba_organization(id) on delete cascade,
  path text not null check (length(path) <= 500 and path ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'),
  parent_id uuid,
  -- A parent must have the exact immediate prefix, preventing cycles without
  -- trusting an application-maintained ancestry cache or concurrent triggers.
  parent_path text generated always as (case when strpos(path, '/') > 0 then regexp_replace(path, '/[^/]+$', '') end) stored,
  unique (org_id, path),
  unique (org_id, id),
  unique (org_id, id, path),
  check ((parent_id is null) = (strpos(path, '/') = 0)),
  check (parent_id is distinct from id),
  foreign key (org_id, parent_id, parent_path) references emba_loop(org_id, id, path)
);
create index emba_loop_parent on emba_loop(org_id, parent_id, parent_path);

create table emba_role (
  org_id uuid not null,
  loop_id uuid not null,
  person_id uuid not null,
  role text not null check (role in ('owner','organizer','member','follower')),
  revoked_at timestamptz,
  primary key (org_id, loop_id, person_id),
  foreign key (org_id, loop_id) references emba_loop(org_id, id) on delete cascade,
  foreign key (org_id, person_id) references emba_membership(org_id, person_id) on delete cascade
);
create index emba_role_person on emba_role(org_id, person_id);

create table emba_invitation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  loop_id uuid not null,
  issued_by uuid not null,
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email)) and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  role text not null check (role in ('owner','organizer','member','follower')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references person(id),
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null)),
  check (accepted_at is null or (accepted_at >= created_at and accepted_at < expires_at)),
  foreign key (org_id, loop_id) references emba_loop(org_id, id) on delete cascade,
  foreign key (org_id, issued_by) references emba_membership(org_id, person_id)
);
create index emba_invitation_loop on emba_invitation(org_id, loop_id);
create index emba_invitation_issuer on emba_invitation(org_id, issued_by);
create index emba_invitation_recipient on emba_invitation(accepted_by);

-- Only the server service layer can access pilot records. No Data API policies.
alter table emba_identity enable row level security;
alter table emba_organization enable row level security;
alter table emba_membership enable row level security;
alter table emba_loop enable row level security;
alter table emba_role enable row level security;
alter table emba_invitation enable row level security;
revoke all on emba_identity, emba_organization, emba_membership, emba_loop, emba_role, emba_invitation from public, anon, authenticated;
