-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Loopd When (docs/superpowers/specs/2026-11-22-loopd-when-design.md): a poll of the hours people can make. Anyone
-- with the link reads it; a signed-in person paints their hours; the one who asked is told when enough of them can
-- make one time, picks it, and sends the invite. Four tables, all hanging off person, so a deleted account takes its
-- polls and answers with it.
-- Apply BEFORE the code that reads it is deployed: nothing that exists today touches these tables. Rollback: put the
-- old code back, then drop the four tables.

-- A poll. Its id is the address: 12 random characters. A series is the chain of polls made by "Ask the group again",
-- named by its first poll's id. Dates and hours are on the clock of `timezone`, the organizer's own when they made it.
create table when_poll (
 id text primary key check(id ~ '^[A-Za-z0-9_-]{12}$'),
 series_id text not null check(series_id ~ '^[A-Za-z0-9_-]{12}$'),
 previous_poll_id text references when_poll(id) on delete set null,
 organizer_id uuid not null references person(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 80 and title=btrim(title)),
 start_date date not null,
 end_date date not null,
 hour_start smallint not null check(hour_start between 0 and 23),
 hour_end smallint not null check(hour_end between 1 and 24),
 timezone text not null check(char_length(timezone) between 1 and 64),
 expected_size smallint not null check(expected_size between 2 and 200),
 deadline timestamptz not null,
 threshold text not null check(threshold in ('majority','two_thirds','everyone')),
 status text not null default 'open' check(status in ('open','sent')),
 -- Set once: when enough people could make one time, or the deadline passed with an answer in. ready_met says which.
 ready_at timestamptz,
 ready_met boolean,
 -- What the organizer picked, and their one line.
 chosen_slot timestamptz,
 note text check(note is null or (char_length(note) between 1 and 200 and note=btrim(note))),
 sent_at timestamptz,
 sent_via text check(sent_via in ('loopd','google')),
 google_event_id text check(google_event_id is null or char_length(google_event_id)<=1024),
 created_at timestamptz not null default clock_timestamp(),
 constraint when_poll_hours check(hour_end>hour_start),
 constraint when_poll_days check(end_date>=start_date and end_date-start_date<=13),
 constraint when_poll_ready check((ready_at is null)=(ready_met is null)),
 constraint when_poll_sent check((status='sent')=(chosen_slot is not null) and (status='sent')=(sent_at is not null) and (status='sent')=(sent_via is not null))
);
create index when_poll_series on when_poll(series_id,created_at);
create index when_poll_organizer on when_poll(organizer_id,created_at);
create index when_poll_open on when_poll(deadline) where status='open';

-- One answer per person per poll: the hours they can make. A draft is last week's answer carried over as a starting
-- point; it is never counted until its person saves it.
create table when_answer (
 poll_id text not null references when_poll(id) on delete cascade,
 person_id uuid not null references person(id) on delete cascade,
 slots timestamptz[] not null default '{}' check(cardinality(slots)<=336),
 draft boolean not null default false,
 reminders_off boolean not null default false,
 -- The address that stops emails about this poll for this person. It grants nothing else.
 stop_token text not null default replace(gen_random_uuid()::text,'-','') check(stop_token ~ '^[0-9a-f]{32}$'),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(poll_id,person_id)
);
create unique index when_answer_stop on when_answer(stop_token);
create index when_answer_person on when_answer(person_id);

-- What is to be emailed. One of each kind per person per poll, whatever races: that is what keeps a second press of
-- "send" from sending a second set.
create table when_message (
 id uuid primary key default gen_random_uuid(),
 poll_id text not null references when_poll(id) on delete cascade,
 person_id uuid not null references person(id) on delete cascade,
 kind text not null check(kind in ('reminder_48','reminder_24','ready','deadline','invite')),
 state text not null default 'queued' check(state in ('queued','sent','failed')),
 attempts smallint not null default 0,
 claimed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz,
 provider_id text check(provider_id ~ '^[ -~]{1,200}$'),
 unique(poll_id,person_id,kind)
);
create index when_message_queued on when_message(created_at) where state='queued';
create index when_message_person on when_message(person_id);

-- What happened, with no content: for three numbers (who opens a poll and answers it, how many polls reach their
-- threshold, how many series ask again). `visitor` is a random value kept in the browser, for poll_opened only.
create table when_event (
 id bigint generated always as identity primary key,
 kind text not null check(kind in ('poll_opened','poll_created','response_saved','reminder_sent','poll_ready','poll_sent','repeat_created')),
 poll_id text not null references when_poll(id) on delete cascade,
 series_id text not null,
 person_id uuid references person(id) on delete set null,
 visitor text check(visitor ~ '^[0-9a-f]{32}$'),
 at timestamptz not null default clock_timestamp()
);
create unique index when_event_opened on when_event(poll_id,visitor) where kind='poll_opened';
create index when_event_kind on when_event(kind,at);
create index when_event_person on when_event(person_id);

alter table when_poll enable row level security;
alter table when_answer enable row level security;
alter table when_message enable row level security;
alter table when_event enable row level security;
revoke all on when_poll,when_answer,when_message,when_event from public,anon,authenticated;
revoke all on sequence when_event_id_seq from public,anon,authenticated;

reset lock_timeout;
