-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Trip (change loop-trip). Additive: a member's stated travel for a team;
-- ideas that members propose and that become plans; calendar invites and a
-- calendar feed. Apply after 20261114000000_emba_club_reach.sql, as one
-- transaction. Rollback is dropping what this file adds and restoring the
-- four checks it widens.
--
-- "One visible line" means the same as in 20261110010000_emba_team_records.sql.

-- 1. Travel (design D2). One entry per member per team, written only by that
-- member. A side (arrival or departure) is a day, with a time when the member
-- gave one, and optionally a place and a flight number. `timed` is false when
-- only the day was stated: the instant is then midnight in the team's timezone.
create table emba_travel (
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 arrives_at timestamptz,
 arrives_timed boolean not null default true,
 arrives_place text check(arrives_place is null or (char_length(arrives_place) between 1 and 120 and arrives_place=btrim(arrives_place) and arrives_place !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 arrives_flight text check(arrives_flight ~ '^[A-Z0-9][A-Z0-9 ]{1,10}[A-Z0-9]$'),
 departs_at timestamptz,
 departs_timed boolean not null default true,
 departs_place text check(departs_place is null or (char_length(departs_place) between 1 and 120 and departs_place=btrim(departs_place) and departs_place !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 departs_flight text check(departs_flight ~ '^[A-Z0-9][A-Z0-9 ]{1,10}[A-Z0-9]$'),
 stay text check(stay is null or (char_length(stay) between 1 and 120 and stay=btrim(stay) and stay !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 -- The assistant that saved it; null when it was saved on the site.
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 changed_at timestamptz not null default clock_timestamp(),
 primary key(org_id,loop_id,person_id),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id),
 constraint emba_travel_has_a_day check(arrives_at is not null or departs_at is not null),
 constraint emba_travel_arrival_needs_day check(arrives_at is not null or (arrives_place is null and arrives_flight is null)),
 constraint emba_travel_departure_needs_day check(departs_at is not null or (departs_place is null and departs_flight is null))
);
create index emba_travel_person on emba_travel(person_id);

-- 2. Ideas and plans (design D3). An idea is an event a member proposes. It
-- becomes a plan once it has the people it needs, a start time and a place.
-- A cancelled or lapsed row is also archived, so it leaves every list, frees
-- its tag and stays in the team's history. `sequence` numbers the versions of
-- the calendar entry; `invites_at` is set once the event sends invites.
alter table emba_team_event
 drop constraint emba_team_event_name_check,
 add constraint emba_team_event_name_check check(char_length(name) between 1 and 120
  and name !~ '[[:cntrl:]\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]'),
 add column state text not null default 'fixed' check(state in ('fixed','idea','planned','cancelled','lapsed')),
 -- Who proposed it. Null on a fixed event, and on a plan whose proposer has left: owners and organizers then look after it.
 add column proposer_id uuid references person(id) on delete set null,
 -- How many people it needs, the proposer counted.
 add column needed smallint check(needed between 2 and 20),
 add column offered_days date[] not null default '{}' check(cardinality(offered_days)<=10),
 -- The day those who are in chose, while the idea still has no start time.
 add column day date,
 -- The one ask Loop opened to settle the day. Never cleared, so there is never a second.
 add column day_ask_id uuid references emba_ask(id),
 add column invites_at timestamptz,
 add column sequence integer not null default 0 check(sequence>=0),
 add constraint emba_team_event_idea_has_number check((state='fixed')=(needed is null)),
 add constraint emba_team_event_ended_is_archived check(state not in ('cancelled','lapsed') or archived_at is not null),
 add constraint emba_team_event_plan_is_complete check(state<>'planned' or (starts_at is not null and place is not null));
create index emba_team_event_ideas on emba_team_event(org_id,loop_id) where state='idea';
create index emba_team_event_proposer on emba_team_event(proposer_id) where proposer_id is not null;

-- A fixed event stays fixed and an idea never becomes one. An idea becomes a
-- plan, lapses or is cancelled; a plan stays a plan until it is cancelled; a
-- cancelled or lapsed row is never revived.
create function emba_team_event_state_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if (old.state='fixed')<>(new.state='fixed')
    or (old.state in ('cancelled','lapsed') and new.state<>old.state)
    or (old.state='planned' and new.state not in ('planned','cancelled'))
    or new.sequence<old.sequence
    or (old.day_ask_id is not null and new.day_ask_id is distinct from old.day_ask_id) then
  raise exception 'An idea becomes a plan once, a cancelled or lapsed one is not revived, and it has one day ask' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_event_state_guard before update on emba_team_event for each row execute function emba_team_event_state_guard();

-- The ask Loop opens to settle an idea's day goes only to the members who are in on it.
alter table emba_ask
 add column only_in boolean not null default false,
 add constraint emba_ask_only_in_has_event check(not only_in or event_id is not null);

-- The change sequence reports an idea proposed, made a plan, cancelled or lapsed.
alter table emba_team_change
 drop constraint emba_team_change_action_check,
 add constraint emba_team_change_action_check check(action in ('filed','corrected','replaced','logged','superseded','withdrawn','claimed','proposed','confirmed','declined','done','released','announced','flagged','recheck','unflagged','overlap','tagged','untagged',
  'event_added','event_changed','event_archived','event_restored','event_proposed','event_planned','event_cancelled','event_lapsed','asked','ask_closed'));

-- 3. Calendar invites (design D5) go through the outbox. An invite row is one
-- version of one member's calendar entry: a later row for the same member and
-- event carries a higher sequence and replaces the entry in their calendar.
alter table emba_reach_message
 drop constraint emba_reach_message_kind_check,
 add constraint emba_reach_message_kind_check check(kind in ('ask_new','ask_reminder','ask_result','announcement','invite','invite_cancel')),
 add column event_id uuid,
 add column sequence integer check(sequence>=0),
 add foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id) on delete cascade,
 drop constraint emba_reach_message_one_subject,
 add constraint emba_reach_message_one_subject check(num_nonnulls(record_id,ask_id,event_id)=1 and (kind='announcement')=(record_id is not null)
  and (kind in ('invite','invite_cancel'))=(event_id is not null) and (event_id is null)=(sequence is null));
create unique index emba_reach_message_event_once on emba_reach_message(person_id,event_id,sequence) where event_id is not null;

-- 4. The calendar feed (design D6). One private address per member per team:
-- the token is 122 random bits. Replacing it is deleting the row and adding another.
create table emba_calendar_feed (
 token text primary key default replace(gen_random_uuid()::text,'-','') check(token ~ '^[0-9a-f]{32}$'),
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 unique(org_id,loop_id,person_id),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);
create index emba_calendar_feed_person on emba_calendar_feed(person_id);

alter table emba_travel enable row level security;
alter table emba_calendar_feed enable row level security;
revoke all on emba_travel,emba_calendar_feed from public,anon,authenticated;
revoke all on function emba_team_event_state_guard() from public,anon,authenticated;

reset lock_timeout;
