-- An @place (openspec loop-group-event-links, design D12): a name people give a spot, such as "collegetown" or
-- "donlon-2f". Nobody curates them: one exists from the first plan posted with it.
create table campus_tag (
 id uuid primary key default gen_random_uuid(),
 campus_id uuid not null references campus(id) on delete cascade,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$'),
 created_by uuid references person(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(campus_id,slug)
);
alter table campus_listing add column tag_id uuid references campus_tag(id) on delete set null;
create index campus_listing_tag on campus_listing(tag_id) where tag_id is not null;
alter table campus_tag enable row level security;
revoke all on campus_tag from public,anon,authenticated;
