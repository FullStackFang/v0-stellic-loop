-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- "15 minutes?" on the Ink page, after signing up (openspec loop-ink-tiers, public/demo/mockups-ink-join.html): a
-- student or an organizer says when a short Zoom call would suit them, and the founder writes back to set it up. One
-- row each time it is sent: who, their email, which they are, up to four days and times as they typed them (their own
-- local time, 'YYYY-MM-DDTHH:MM'), and a note. Nothing is booked.
-- Apply BEFORE the code that writes it is deployed. The code from before keeps working once this is applied; the
-- admin page reads it only if it is there. Rollback: put the old code back, then drop the table.
create table campus_call_ask (
 id bigint generated always as identity primary key,
 person_id uuid not null references person(id) on delete cascade,
 email text not null,
 role text not null check (role in ('student','organizer')),
 times text[] not null default '{}' check (cardinality(times) <= 4),
 note text not null default '' check (length(note) <= 200),
 asked_at timestamptz not null default now()
);
create index campus_call_ask_when on campus_call_ask(asked_at desc);
alter table campus_call_ask enable row level security;
revoke all on campus_call_ask from public,anon,authenticated;
