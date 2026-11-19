-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A group's own picture (openspec loop-group-picture): several animals drawn together as one picture. Each ask makes
-- up to two drawings, which share `ask`; whoever runs the group keeps one (kept_at) and the other is let go
-- (let_go_at). The group's picture is its kept row that is not let go. `picks` is what was picked, so it can be drawn
-- again. `image` is a transparent PNG, the longer side 1024; `small` is the same at 192px for tiles. They are served
-- at /animals/group/<token>/full and /animals/group/<token>.
-- Apply after 20261119200000_campus_school_ask.sql and BEFORE the code that reads these tables is deployed. The code
-- from before keeps working once this is applied. Rollback: put the old code back, then drop the two tables.
create table emba_group_picture (
 token uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 made_by uuid references person(id) on delete set null,
 ask uuid not null,
 picks jsonb not null,
 image bytea not null,
 small bytea not null,
 made_at timestamptz not null default now(),
 kept_at timestamptz,
 let_go_at timestamptz,
 foreign key (org_id, loop_id) references emba_loop(org_id, id) on delete cascade
);
create index emba_group_picture_group on emba_group_picture(org_id,loop_id,kept_at);
create index emba_group_picture_maker on emba_group_picture(made_by);
alter table emba_group_picture enable row level security;
revoke all on emba_group_picture from public,anon,authenticated;

-- Who asked to subscribe to Ink+. There is no payment: asking is recorded, to see who would pay, and nothing is charged.
create table campus_ink_plus (
 person_id uuid primary key references person(id) on delete cascade,
 email text not null,
 asked_at timestamptz not null default now()
);
alter table campus_ink_plus enable row level security;
revoke all on campus_ink_plus from public,anon,authenticated;
