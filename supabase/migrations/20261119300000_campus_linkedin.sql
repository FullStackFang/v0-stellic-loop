-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A person adds the address of their LinkedIn profile to unlock schools their email does not say they are at
-- (lib/campus/linkedin.ts). Nothing is read from LinkedIn: the address is kept as typed, in one spelling, and the
-- schools are the ones the person ticked. One row per person, and one person per profile.
-- `schools` are school slugs beyond the one the person is placed at: their animals are in the person's picker and
-- their campuses are places the person may look at. A person whose email is at no school is placed at the first
-- school they tick (campus_person), which is what lets them in. `email` is the verified email they signed in with.
-- Until this is applied everything else works as before; pressing "Unlock" says it did not go through.
-- Rollback: drop table campus_linkedin.
create table campus_linkedin (
 person_id uuid primary key references person(id) on delete cascade,
 profile text not null unique check(profile ~ '^https://www\.linkedin\.com/in/[^/?#[:space:]]{3,100}$'),
 schools text[] not null default '{}',
 email text,
 added_at timestamptz not null default now()
);
alter table campus_linkedin enable row level security;
revoke all on campus_linkedin from public,anon,authenticated;

reset lock_timeout;
