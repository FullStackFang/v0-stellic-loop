-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Club events and asks (change loop-club-events-and-asks). Additive: events
-- gain a date, a place, a link and a note; members can mark interest; any
-- member can ask the group a question and collect answers; the join link can
-- admit on sign-in. Apply after 20261110020000_emba_team_brief.sql, as one
-- transaction. Rollback is dropping what this file adds.
--
-- "One visible line" means the same as in 20261110010000_emba_team_records.sql.

-- 1. Events gain facts. Every column is optional: an event with no start
-- still works as a label for records.
alter table emba_team_event
 add column starts_at timestamptz,
 add column ends_at timestamptz,
 add column place text check(place is null or (char_length(place) between 1 and 120 and place=btrim(place) and place !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 -- A pointer only, never fetched. Same rule as a filed output's link.
 add column url text check(url is null or (char_length(url)<=500
  and url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(/[]A-Za-z0-9._~:/?#@!$&''()*+,;=%[-]*)?$'
  and url !~ '^https://([^/]*[.])?xn--')),
 add column note text check(note is null or (char_length(note) between 1 and 600 and note=btrim(note) and note !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 -- The share link's token: 122 random bits. It names the event and grants nothing.
 add column share_token text not null default replace(gen_random_uuid()::text,'-','') check(share_token ~ '^[0-9a-f]{32}$'),
 add constraint emba_team_event_end_after_start check(ends_at is null or (starts_at is not null and ends_at>=starts_at));
create unique index emba_team_event_share on emba_team_event(share_token);

-- 2. Interest: one row per member per event means "interested". The route is
-- kept for the operator's pilot numbers and is never shown to members; its
-- values are open so later changes can add routes.
create table emba_event_interest (
 event_id uuid not null,
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 route text not null check(route ~ '^[a-z][a-z_]{1,23}$'),
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 at timestamptz not null default clock_timestamp(),
 primary key(event_id,person_id),
 foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id) on delete cascade,
 constraint emba_event_interest_route_client check((route<>'assistant' or client_id is not null) and (route not in ('site','share_link') or client_id is null))
);
create index emba_event_interest_person on emba_event_interest(person_id);

-- 3. Asks. An ask takes its number from the team's record counter, so "#7"
-- means one thing in a team. Open means: not closed early and before closes_at
-- on the database clock.
create table emba_ask (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 number integer not null check(number>0),
 -- Who asked. Kept when the person leaves; removed when they delete their account.
 asker_id uuid references person(id) on delete set null,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 event_id uuid,
 question text not null check(char_length(question) between 1 and 200 and question=btrim(question) and question !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]'),
 kind text not null check(kind in ('one','many','dates','text')),
 reveal text not null check(reveal in ('named','counts')),
 created_at timestamptz not null default clock_timestamp(),
 closes_at timestamptz not null,
 -- Set when the ask is closed early, or noted as closed after its time. Never cleared.
 closed_at timestamptz,
 share_token text not null default replace(gen_random_uuid()::text,'-','') check(share_token ~ '^[0-9a-f]{32}$'),
 unique(org_id,loop_id,number),
 unique(id,org_id,loop_id),
 foreign key(org_id,loop_id) references emba_team_state(org_id,loop_id),
 foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id),
 constraint emba_ask_closes_within_60_days check(closes_at>created_at and closes_at-created_at<=interval '60 days'),
 constraint emba_ask_closed_after_created check(closed_at is null or closed_at>=created_at)
);
create unique index emba_ask_share on emba_ask(share_token);
create index emba_ask_open on emba_ask(org_id,loop_id,closes_at) where closed_at is null;
create index emba_ask_asker on emba_ask(asker_id);

-- The choices of a pick-one, pick-several or pick-dates ask. For dates the label is YYYY-MM-DD.
create table emba_ask_option (
 ask_id uuid not null references emba_ask(id) on delete cascade,
 position smallint not null check(position between 1 and 10),
 label text not null check(char_length(label) between 1 and 80 and label=btrim(label) and label !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]'),
 primary key(ask_id,position),
 unique(ask_id,label)
);

-- One answer per member per ask; a later answer replaces it in place. An
-- answer whose person is null belonged to someone who deleted their account.
create table emba_ask_answer (
 id uuid primary key default gen_random_uuid(),
 ask_id uuid not null references emba_ask(id) on delete cascade,
 person_id uuid references person(id) on delete set null,
 choices smallint[] not null default '{}',
 body text check(body is null or (char_length(body) between 1 and 400 and body=btrim(body) and body !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 route text not null check(route ~ '^[a-z][a-z_]{1,23}$'),
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 at timestamptz not null default clock_timestamp(),
 constraint emba_ask_answer_one_shape check((body is null)<>(cardinality(choices)=0)),
 constraint emba_ask_answer_route_client check((route<>'assistant' or client_id is not null) and (route not in ('site','share_link') or client_id is null))
);
create unique index emba_ask_answer_one on emba_ask_answer(ask_id,person_id) where person_id is not null;
create index emba_ask_answer_ask on emba_ask_answer(ask_id);
create index emba_ask_answer_person on emba_ask_answer(person_id);

-- 4. One content-free row per accepted write that is not a team record (an
-- assistant's event change, an interest mark, an ask, an answer). Counted with
-- emba_team_operation toward the limit of 30 writes per hour.
create table emba_team_write (
 id bigint generated always as identity primary key,
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 at timestamptz not null default clock_timestamp(),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);
create index emba_team_write_recent on emba_team_write(org_id,loop_id,person_id,at);
create index emba_team_write_person on emba_team_write(person_id);

-- 5. The change sequence can point at an event or an ask instead of a record.
alter table emba_team_change
 alter column record_id drop not null,
 add column event_id uuid,
 add column ask_id uuid,
 add foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id) on delete cascade,
 add foreign key(ask_id,org_id,loop_id) references emba_ask(id,org_id,loop_id) on delete cascade,
 add constraint emba_team_change_one_target check(num_nonnulls(record_id,event_id,ask_id)=1),
 drop constraint emba_team_change_action_check,
 add constraint emba_team_change_action_check check(action in ('filed','corrected','replaced','logged','superseded','withdrawn','claimed','proposed','confirmed','declined','done','released','announced','flagged','recheck','unflagged','overlap','tagged','untagged',
  'event_added','event_changed','event_archived','event_restored','asked','ask_closed')),
 add constraint emba_team_change_action_target check((action like 'event\_%')=(event_id is not null) and (action in ('asked','ask_closed'))=(ask_id is not null));
create index emba_team_change_event on emba_team_change(event_id) where event_id is not null;
create index emba_team_change_ask on emba_team_change(ask_id) where ask_id is not null;
create or replace function emba_team_change_fixed() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.org_id,new.loop_id,new.seq,new.record_id,new.event_id,new.ask_id,new.action,new.other_id,new.at) is distinct from row(old.org_id,old.loop_id,old.seq,old.record_id,old.event_id,old.ask_id,old.action,old.other_id,old.at)
    or (new.actor_id is not null and new.actor_id is distinct from old.actor_id)
    or (new.subject_id is not null and new.subject_id is distinct from old.subject_id) then
  raise exception 'The change log is not edited' using errcode='23514';
 end if;
 return new;
end $$;

-- 6. The join link can admit on sign-in. The default is unchanged: ask first.
alter table emba_group_request_link add column join_mode text not null default 'ask_first' check(join_mode in ('ask_first','admit'));

-- Guards. The services keep these rules; the triggers make a service bug fail
-- loudly instead of storing a contradictory state.

-- An ask keeps its question, kind, closing time and number. It is closed once
-- and never reopened. Its reveal setting is fixed once anyone has answered.
create function emba_ask_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.id,new.org_id,new.loop_id,new.number,new.client_id,new.event_id,new.question,new.kind,new.created_at,new.closes_at,new.share_token)
    is distinct from row(old.id,old.org_id,old.loop_id,old.number,old.client_id,old.event_id,old.question,old.kind,old.created_at,old.closes_at,old.share_token)
    or (new.asker_id is not null and new.asker_id is distinct from old.asker_id)
    or (old.closed_at is not null and new.closed_at is distinct from old.closed_at)
    or (new.reveal<>old.reveal and exists(select 1 from emba_ask_answer where ask_id=new.id)) then
  raise exception 'An ask keeps its question, is closed once, and keeps its reveal setting after the first answer' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_ask_guard before update on emba_ask for each row execute function emba_ask_guard();

-- Checked at commit: the number comes from the team counter, and the options fit the kind.
create function emba_ask_check() returns trigger language plpgsql set search_path=public as $$
declare options integer;
begin
 if new.number>(select record_seq from emba_team_state where org_id=new.org_id and loop_id=new.loop_id) then
  raise exception 'Ask numbers come from the team counter' using errcode='23514';
 end if;
 select count(*) into options from emba_ask_option where ask_id=new.id;
 if (new.kind='text' and options<>0) or (new.kind<>'text' and options not between 2 and 10) then
  raise exception 'An ask has 2 to 10 options, or none when it takes a written answer' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger emba_ask_consistent after insert on emba_ask
 deferrable initially deferred for each row execute function emba_ask_check();

-- Options are fixed once the ask exists.
create function emba_ask_option_guard() returns trigger language plpgsql set search_path=public as $$
begin
 raise exception 'The options of an ask are not edited' using errcode='23514';
end $$;
create trigger emba_ask_option_guard before update on emba_ask_option for each row execute function emba_ask_option_guard();

-- An answer is written only while its ask is open, by the database clock, and
-- fits the ask's kind. The one change allowed afterwards is losing the link to a person.
create function emba_ask_answer_guard() returns trigger language plpgsql set search_path=public as $$
declare a emba_ask; known integer;
begin
 if tg_op='UPDATE' then
  if row(new.id,new.ask_id) is distinct from row(old.id,old.ask_id) or (new.person_id is not null and new.person_id is distinct from old.person_id) then
   raise exception 'An answer stays with its ask and its person' using errcode='23514';
  end if;
  if row(new.choices,new.body,new.route,new.client_id,new.at) is not distinct from row(old.choices,old.body,old.route,old.client_id,old.at) then
   return new;
  end if;
 end if;
 select * into a from emba_ask where id=new.ask_id;
 if a.closed_at is not null or a.closes_at<=clock_timestamp() then
  raise exception 'A closed ask takes no answers' using errcode='23514';
 end if;
 if new.person_id is null then
  raise exception 'An answer is given by a person' using errcode='23514';
 end if;
 if a.kind='text' then
  if new.body is null then raise exception 'This ask takes a written answer' using errcode='23514'; end if;
 else
  if new.body is not null or (a.kind='one' and cardinality(new.choices)<>1) then
   raise exception 'The answer does not fit the kind of ask' using errcode='23514';
  end if;
  select count(distinct c) into known from unnest(new.choices) as c join emba_ask_option o on o.ask_id=new.ask_id and o.position=c;
  if known<>cardinality(new.choices) then
   raise exception 'An answer names each option once, and only options the ask has' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create trigger emba_ask_answer_guard before insert or update on emba_ask_answer for each row execute function emba_ask_answer_guard();

alter table emba_event_interest enable row level security;
alter table emba_ask enable row level security;
alter table emba_ask_option enable row level security;
alter table emba_ask_answer enable row level security;
alter table emba_team_write enable row level security;
revoke all on emba_event_interest,emba_ask,emba_ask_option,emba_ask_answer,emba_team_write from public,anon,authenticated;
revoke all on sequence emba_team_write_id_seq from public,anon,authenticated;
revoke all on function emba_ask_guard(),emba_ask_check(),emba_ask_option_guard(),emba_ask_answer_guard() from public,anon,authenticated;

reset lock_timeout;
