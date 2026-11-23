-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Loopd When: answering with only a name. Someone with the link and no account types a name and saves their hours.
-- They are a person like any other (so answers, counts and invites work as they do), marked here as a guest and
-- found again by a random key kept in their browser; only its hash is stored. Signing in later moves their answers
-- to their account and removes the guest. An email a guest types is kept on that one answer, for that poll's invite
-- only.
-- Apply BEFORE the code that reads it is deployed. Rollback: put the old code back, then drop the column and the table
-- (guest people stay as plain people with answers; delete them first if they should go:
-- delete from person where id in (select person_id from when_guest)).
create table when_guest (
 person_id uuid primary key references person(id) on delete cascade,
 key_hash text not null check(key_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
create unique index when_guest_key on when_guest(key_hash);

alter table when_answer
 add column invite_email text check(invite_email is null or (char_length(invite_email) between 3 and 254 and invite_email=lower(btrim(invite_email))));

alter table when_guest enable row level security;
revoke all on when_guest from public,anon,authenticated;

reset lock_timeout;
