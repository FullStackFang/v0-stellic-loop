-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A person's claim to run a club that is listed on their school's CampusGroups site (lib/campus/club-claim.ts).
-- One row a person and club. `state`: approved (the club is theirs), waiting (for the admin to check), refused.
-- `how`: 'officer list' when Loopd found their name on the club's public officer page, 'admin' when the admin
-- decided it. `seen` is the officer list as it was read, so the admin can see why. Nothing here gives access to
-- anything yet: it is the record that the organizer's home will ask.
-- Apply after 20261120200000_campus_club_ask.sql and BEFORE the code that writes it is deployed. The code from before
-- keeps working once this is applied. Rollback: put the old code back, then drop the table.
create table campus_club_claim (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references person(id) on delete cascade,
 email text check (char_length(email) <= 320),
 club_url text not null check (char_length(club_url) <= 300),
 club_name text not null check (char_length(club_name) between 1 and 200),
 role text check (char_length(role) <= 120),
 state text not null check (state in ('approved','waiting','refused')),
 how text not null check (how in ('officer list','admin')),
 seen text check (char_length(seen) <= 4000),
 note text check (char_length(note) <= 600),
 asked_at timestamptz not null default now(),
 decided_at timestamptz,
 unique (person_id, club_url)
);
create index campus_club_claim_state on campus_club_claim(state, asked_at);
alter table campus_club_claim enable row level security;
revoke all on campus_club_claim from public,anon,authenticated;
