-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Every Conga round that ends, for the admin's Activity section (lib/campus/conga-stats.ts): signed in or not. A round
-- is kept with the person who played it, or for someone signed out with the random number their browser carries
-- (`visitor`, the lp_v cookie of app/c/seen), which tells one guest from another and says nothing about who they are.
-- Either may be missing (a first round before the browser was given its number). The weekly board stays conga_best.
-- Additive: one new table. Apply after 20261124090000_campus_ext.sql. The game works before it is applied: rounds are
-- just not counted. Rollback is dropping the table.
create table conga_round (
 id bigint generated always as identity primary key,
 person_id uuid references person(id) on delete cascade,
 visitor text check(visitor ~ '^[0-9a-f]{32}$'),
 map text not null check(map ~ '^[a-z0-9-]{1,40}$'),
 line integer not null check(line between 1 and 2001),
 seconds integer not null check(seconds between 0 and 21600),
 at timestamptz not null default now()
);
create index conga_round_at on conga_round(at);
alter table conga_round enable row level security;
revoke all on conga_round from public,anon,authenticated;

reset lock_timeout;
