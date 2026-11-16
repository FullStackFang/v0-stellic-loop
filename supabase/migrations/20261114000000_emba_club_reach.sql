-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Club reach (change loop-club-reach). Additive: what is waiting for each
-- member, how each team may reach them, the messages Loop sends, a WhatsApp
-- number a member linked, and a content-free log of connector requests. Apply
-- after 20261113000000_emba_group_tree.sql, as one transaction. Rollback is
-- dropping what this file adds and restoring the two route checks.

-- 1. Waiting (design D8b). An event stops waiting for a member who says it is
-- not for them. Interest and a decline are never both held: the service
-- removes one when it writes the other.
create table emba_event_decline (
 event_id uuid not null,
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 at timestamptz not null default clock_timestamp(),
 primary key(event_id,person_id),
 foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id) on delete cascade
);
create index emba_event_decline_person on emba_event_decline(person_id);

-- A mention or an announcement waits until it has been returned to the member once.
create table emba_waiting_shown (
 person_id uuid not null references person(id) on delete cascade,
 record_id uuid not null references emba_team_record(id) on delete cascade,
 at timestamptz not null default clock_timestamp(),
 primary key(person_id,record_id)
);
create index emba_waiting_shown_record on emba_waiting_shown(record_id);

-- 2. Reach (design D3). One choice per member per team. No row means the
-- default: email, for asks and announcements an organizer chose to send.
create table emba_reach_choice (
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 way text not null check(way in ('assistant','email','whatsapp','none')),
 at timestamptz not null default clock_timestamp(),
 primary key(org_id,loop_id,person_id),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);
create index emba_reach_choice_person on emba_reach_choice(person_id);

-- 3. WhatsApp (design D7). A number is linked by the member's own message to
-- Loop's number, and belongs to at most one member. "stop" sets stopped_at.
create table emba_whatsapp_number (
 person_id uuid primary key references person(id) on delete cascade,
 phone text not null unique check(phone ~ '^\+[1-9][0-9]{6,14}$'),
 linked_at timestamptz not null default clock_timestamp(),
 stopped_at timestamptz
);
-- The short code in the pre-filled message a member sends to opt in. It names the member and the team they chose WhatsApp for.
create table emba_whatsapp_optin (
 code text primary key check(code ~ '^[0-9a-f]{12}$'),
 person_id uuid not null references person(id) on delete cascade,
 org_id uuid not null,
 loop_id uuid not null,
 expires_at timestamptz not null default(clock_timestamp()+interval '1 hour'),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);
create index emba_whatsapp_optin_person on emba_whatsapp_optin(person_id);

-- 4. Messages (design D4, D5). This is the outbox and the message log in one:
-- a row is queued in the transaction that causes it, sent by the scheduled
-- route, and kept. One row per member per ask per kind, and one per member per
-- announcement, so a message is never sent twice. No message text is stored:
-- it is written from the ask or announcement when it is sent.
create table emba_reach_message (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 kind text not null check(kind in ('ask_new','ask_reminder','ask_result','announcement')),
 ask_id uuid,
 record_id uuid,
 -- queued: to be sent. sent: accepted by the provider. held: stopped by a daily limit; the item stays waiting.
 -- skipped: the member's choice, an answer, a closed ask or a departure made it unnecessary. failed: retries ran out.
 state text not null default 'queued' check(state in ('queued','sent','held','skipped','failed')),
 -- How it went out. Set when it is sent.
 way text check(way in ('email','whatsapp')),
 attempts integer not null default 0 check(attempts>=0),
 created_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz,
 -- Set while a run is sending the row, so no other run takes it. A claim lapses after ten minutes.
 claimed_at timestamptz,
 -- The provider's own id for the message, used to match a WhatsApp button tap to its ask.
 provider_id text check(provider_id ~ '^[ -~]{1,200}$'),
 -- The personal answer link (messages about an open ask) and the one-tap stop link: 122 random bits each.
 -- The answer token lets its holder answer this one ask as this one member and nothing else.
 answer_token text not null default replace(gen_random_uuid()::text,'-','') check(answer_token ~ '^[0-9a-f]{32}$'),
 stop_token text not null default replace(gen_random_uuid()::text,'-','') check(stop_token ~ '^[0-9a-f]{32}$'),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id),
 foreign key(ask_id,org_id,loop_id) references emba_ask(id,org_id,loop_id) on delete cascade,
 foreign key(record_id,org_id,loop_id) references emba_team_record(id,org_id,loop_id) on delete cascade,
 constraint emba_reach_message_one_subject check((kind='announcement')=(record_id is not null) and (kind<>'announcement')=(ask_id is not null)),
 constraint emba_reach_message_sent check((state='sent')=(sent_at is not null) and (state<>'sent' or way is not null))
);
create unique index emba_reach_message_ask_once on emba_reach_message(person_id,ask_id,kind) where ask_id is not null;
create unique index emba_reach_message_record_once on emba_reach_message(person_id,record_id) where record_id is not null;
create unique index emba_reach_message_answer on emba_reach_message(answer_token);
create unique index emba_reach_message_stop on emba_reach_message(stop_token);
create index emba_reach_message_queue on emba_reach_message(created_at) where state='queued';
create index emba_reach_message_sent_day on emba_reach_message(person_id,sent_at) where state='sent';
create index emba_reach_message_team on emba_reach_message(org_id,loop_id,created_at);
create index emba_reach_message_provider on emba_reach_message(provider_id) where provider_id is not null;

-- 5. How an answer or an interest mark arrived gains routes: a personal link,
-- a tap on the card inside an assistant, and a WhatsApp button. An assistant's
-- route, by the model or by the card, always names the assistant.
alter table emba_event_interest
 drop constraint emba_event_interest_route_client,
 add constraint emba_event_interest_route_client check((route not in ('assistant','assistant_card') or client_id is not null) and (route not in ('site','share_link','personal_link','whatsapp') or client_id is null));
alter table emba_ask_answer
 drop constraint emba_ask_answer_route_client,
 add constraint emba_ask_answer_route_client check((route not in ('assistant','assistant_card') or client_id is not null) and (route not in ('site','share_link','personal_link','whatsapp') or client_id is null));

-- 6. The connector request log (design D8). It records that a tool was called
-- and by what route. It has no column that could hold an argument or a result.
create table emba_connector_session (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references person(id) on delete cascade,
 client_id text not null check(client_id ~ '^[ -~]{1,200}$'),
 -- The name and version the assistant stated when it connected.
 host_name text check(host_name ~ '^[ -~]{1,80}$'),
 host_version text check(host_version ~ '^[ -~]{1,40}$'),
 at timestamptz not null default clock_timestamp()
);
create index emba_connector_session_person on emba_connector_session(person_id,at);
create table emba_connector_call (
 id bigint generated always as identity primary key,
 at timestamptz not null default clock_timestamp(),
 person_id uuid not null references person(id) on delete cascade,
 client_id text not null check(client_id ~ '^[ -~]{1,200}$'),
 -- Null when the assistant keeps no session.
 session_id uuid references emba_connector_session(id) on delete cascade,
 tool text not null check(tool ~ '^[a-z][a-z_]{1,39}$'),
 via text not null check(via in ('model','card')),
 -- The first tool call of its session. Always false without a session.
 first_in_session boolean not null default false
);
create index emba_connector_call_session on emba_connector_call(session_id);
create index emba_connector_call_person on emba_connector_call(person_id,at);

-- 7. The one step of the connecting funnel no other table shows: the member opened the connect page (design D8a).
create table emba_connect_view (
 person_id uuid primary key references person(id) on delete cascade,
 at timestamptz not null default clock_timestamp()
);

alter table emba_event_decline enable row level security;
alter table emba_waiting_shown enable row level security;
alter table emba_reach_choice enable row level security;
alter table emba_whatsapp_number enable row level security;
alter table emba_whatsapp_optin enable row level security;
alter table emba_reach_message enable row level security;
alter table emba_connector_session enable row level security;
alter table emba_connector_call enable row level security;
alter table emba_connect_view enable row level security;
revoke all on emba_event_decline,emba_waiting_shown,emba_reach_choice,emba_whatsapp_number,emba_whatsapp_optin,emba_reach_message,emba_connector_session,emba_connector_call,emba_connect_view from public,anon,authenticated;
revoke all on sequence emba_connector_call_id_seq from public,anon,authenticated;

reset lock_timeout;
