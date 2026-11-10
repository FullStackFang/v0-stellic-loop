create table emba_announcement_key (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  loop_id uuid not null,
  public_key text not null,
  registered_by uuid not null references person(id),
  registered_at timestamptz not null default clock_timestamp(),
  status text not null default 'active' check (status in ('active','retired','revoked','compromised')),
  status_at timestamptz,
  foreign key (org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create index emba_announcement_key_loop on emba_announcement_key(org_id,loop_id);
create table emba_announcement (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  loop_id uuid not null,
  current_version integer not null check (current_version>0),
  foreign key (org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create index emba_announcement_loop on emba_announcement(org_id,loop_id);
create table emba_announcement_version (
  announcement_id uuid not null references emba_announcement(id) on delete cascade,
  version integer not null,
  text text not null,
  envelope jsonb not null,
  signature text not null,
  key_id uuid not null references emba_announcement_key(id),
  primary key (announcement_id,version)
);
alter table emba_announcement add foreign key (id,current_version) references emba_announcement_version(announcement_id,version) deferrable initially deferred;
alter table emba_announcement_key enable row level security;
alter table emba_announcement enable row level security;
alter table emba_announcement_version enable row level security;
revoke all on emba_announcement_key,emba_announcement,emba_announcement_version from public,anon,authenticated;
