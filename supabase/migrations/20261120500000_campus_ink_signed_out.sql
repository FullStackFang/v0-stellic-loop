-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Signing up on the Ink page without an account (openspec loop-ink-tiers): the email given, the plan and the button.
-- When someone later signs in with that email they are given the plan, and claimed_at and person_id say so.
-- And "15 minutes?" may now be sent signed out, with the email given, so its person_id may be empty.
-- Apply after 20261120400000_campus_call_ask.sql and BEFORE the code that writes it is deployed. The code from before
-- keeps working once this is applied. Rollback: put the old code back, then drop the table (and set person_id not
-- null again once no row lacks one).
create table campus_ink_waitlist (
 id bigint generated always as identity primary key,
 email text not null,
 plan text not null check (plan in ('ink','ink_plus')),
 place text not null,
 asked_at timestamptz not null default now(),
 claimed_at timestamptz,
 person_id uuid references person(id) on delete set null
);
create index campus_ink_waitlist_open on campus_ink_waitlist(lower(email)) where claimed_at is null;
alter table campus_ink_waitlist enable row level security;
revoke all on campus_ink_waitlist from public,anon,authenticated;

alter table campus_call_ask alter column person_id drop not null;
