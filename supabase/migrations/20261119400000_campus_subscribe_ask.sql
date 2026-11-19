-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Every press of "Subscribe", one row each: who, the email they gave, which plan (ink or ink_plus), and where in the
-- app they pressed it (place: "own animal", "group picture", "save picture"). campus_custom_face and campus_ink_plus
-- still say who HAS a plan, one row a person; this table is the record of each time anyone asked, and where.
-- Apply after 20261119300000_group_picture.sql and BEFORE the code that writes it is deployed. The code from before
-- keeps working once this is applied. Rollback: put the old code back, then drop the table.
create table campus_subscribe_ask (
 id bigint generated always as identity primary key,
 person_id uuid not null references person(id) on delete cascade,
 email text not null,
 plan text not null check (plan in ('ink','ink_plus')),
 place text not null,
 asked_at timestamptz not null default now()
);
create index campus_subscribe_ask_when on campus_subscribe_ask(asked_at desc);
create index campus_subscribe_ask_person on campus_subscribe_ask(person_id);
alter table campus_subscribe_ask enable row level security;
revoke all on campus_subscribe_ask from public,anon,authenticated;
