-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Every press of "Claim your club" on the organizers page, one row each: the club named, the email given, the plan
-- wanted (free, or imprint: the club's paid plan), where it was pressed, and who pressed it when they were signed in.
-- A field test: nothing is charged and no club is made. The page is open to signed-out visitors, so person_id may be null.
-- Apply after 20261120100000_campus_linkedin_no_profile.sql and BEFORE the code that writes it is deployed. The code
-- from before keeps working once this is applied. Rollback: put the old code back, then drop the table.
create table campus_club_ask (
 id bigint generated always as identity primary key,
 person_id uuid references person(id) on delete set null,
 club text not null check (char_length(club) between 1 and 120),
 email text not null check (char_length(email) <= 320),
 plan text not null check (plan in ('free','imprint')),
 place text not null,
 asked_at timestamptz not null default now()
);
create index campus_club_ask_when on campus_club_ask(asked_at desc);
alter table campus_club_ask enable row level security;
revoke all on campus_club_ask from public,anon,authenticated;
