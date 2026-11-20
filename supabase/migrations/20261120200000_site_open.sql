-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Every page opened in the app, one row each: which part of the site (area: "This week", "Groups", "Front door"...),
-- who opened it when they were signed in (null for a visitor who was not), and when. The page's own address is not
-- kept: some addresses carry a share token. Written by app/c/seen/route.ts, read by the admin's Activity and People
-- sections (lib/campus/stats.ts).
-- The code works before this is applied: nothing is counted, and the admin's sections show no page opens.
-- Rollback: drop table site_open.
create table site_open (
 id bigint generated always as identity primary key,
 person_id uuid references person(id) on delete cascade,
 area text not null check(char_length(area) between 1 and 40),
 opened_at timestamptz not null default now()
);
create index site_open_when on site_open(opened_at desc);
create index site_open_person on site_open(person_id,opened_at) where person_id is not null;
alter table site_open enable row level security;
revoke all on site_open from public,anon,authenticated;

reset lock_timeout;
