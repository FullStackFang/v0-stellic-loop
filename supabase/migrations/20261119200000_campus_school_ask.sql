-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Loop is for people at a school. A person who signs in with an email at none of the schools has no campus; the page
-- they see instead (app/c/week.tsx, NoSchool) takes the name of their school, to see where to open next and to tell
-- them when it does. One row per person: naming another school replaces the first. `email` is the verified email they
-- signed in with. Nothing sends these emails yet.
-- Until this is applied the page still opens, with the box; pressing "Add my school" says it did not go through.
-- Rollback: drop table campus_school_ask.
create table campus_school_ask (
 person_id uuid primary key references person(id) on delete cascade,
 school text not null check(length(school) between 2 and 120),
 email text,
 asked_at timestamptz not null default now()
);
alter table campus_school_ask enable row level security;
revoke all on campus_school_ask from public,anon,authenticated;

reset lock_timeout;
