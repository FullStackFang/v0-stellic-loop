-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- The face a person picked for the campus screen: one of the 36 animals in public/animals (0 to 35), or -1 for the photo
-- of their sign-in account. A person with no row has not picked, and is shown the animal their id works out to.
-- Additive: one new table. Apply after 20261118100000_campus_listing_link.sql. Rollback is dropping the table.
create table campus_face (
 person_id uuid primary key references person(id) on delete cascade,
 face smallint not null check(face between -1 and 35),
 picked_at timestamptz not null default now()
);
alter table campus_face enable row level security;
revoke all on campus_face from public,anon,authenticated;

reset lock_timeout;
