-- stats.test.sql — fixtures for v_crew_stats, v_watch_conversion, v_drop_stats,
-- v_intent_transitions (task 2.5).
--
-- Fixtures are created as postgres inside one transaction (rolled back at the
-- end) and the views are read as Dana (organizer) through RLS, which is how the
-- dashboard will read them. Every assertion is a DO block that raises.
--
-- Fixture persons F1..F13: b0000000-0000-4000-8000-0000000000NN, fixtureNN@cornell.edu
--
-- Loop S (stats-fixture, 15…01), occurrences:
--   O1 now-21d, O2 now-14d, O3 now-7d, O4 now-3d CANCELLED (marked), O5 now+4d FUTURE (marked),
--   O6 now-25d (only mark: latecomer F9, before F9's crewed_at → must not be counted for C2)
--   crew C1 (anchored, 4 members F1-F4 crewed now-28d, all drop DS1)
--     O1: F1 present/rsvp in, F2 present, F3 present, F4 absent/rsvp in
--     O2: F1-F4 present
--     → present 7 / denominator 8, met 2, said_in 2, said_in_and_came 1, single_drop
--   crew C2 (not anchored, F5-F8 crewed now-28d, F9 crewed now-17d = latecomer; F8, F9 no drop)
--     O1: F5 F6 F7 present, F8 absent/rsvp out        (F9 not yet crewed)
--     O2: F5 F6 F7 F8 present, F9 absent
--     O4 (cancelled) and O5 (future): marks that must be ignored
--     O6 (before F9 crewed): F9 present — outside F9's window, must not count O6 (0004)
--     → present 7 / denominator 9, met 2, said_in 0, mixed
--   crew C3 (F10-F12 crewed now-28d with DS1; F13 crewed now-28d, no drop, LEFT now-10d)
--     O1: all four present
--     O2: F10 F11 F13 present, F12 absent
--     O3: F10 F11 F12 present                         (after F13 left)
--     → present 10 / denominator 11, met 3 → reached_third, single_drop (active only)
-- Loop W (watch-fixture, 16…01): 1 converted of 3 eligible, 1 pending
-- Loop D (drop-fixture, 17…01): DD1 5 taps, DD2 0 taps, no-drop 2

\set ON_ERROR_STOP on
\echo == stats.test.sql

begin;

-- ---------------------------------------------------------------------------
-- Fixture persons
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  ('b0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'fixture' || i || '@cornell.edu', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', '', false, false
from generate_series(1, 13) as s (i)
on conflict (id) do nothing;

update public.person p
   set first_name = 'F' || s.i
  from generate_series(1, 13) as s (i)
 where p.id = ('b0000000-0000-4000-8000-' || lpad(s.i::text, 12, '0'))::uuid;

-- ---------------------------------------------------------------------------
-- Loop S: crews, occurrences, attendance, rsvp
-- ---------------------------------------------------------------------------

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
values ('15000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'stats-fixture', 'Stats fixture', 4, '19:00', 90, 'Olin');

insert into public."drop" (id, loop_id, token, label, kind)
values ('d5000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001',
        'drop_stats_ds1', 'DS1 GroupMe', 'group_chat');

insert into public.occurrence (id, loop_id, starts_at, cancelled)
values
  ('f5000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', now() - interval '21 days', false),
  ('f5000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', now() - interval '14 days', false),
  ('f5000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', now() - interval '7 days',  false),
  ('f5000000-0000-4000-8000-000000000004', '15000000-0000-4000-8000-000000000001', now() - interval '3 days',  true),
  ('f5000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000001', now() + interval '4 days',  false),
  ('f5000000-0000-4000-8000-000000000006', '15000000-0000-4000-8000-000000000001', now() - interval '25 days', false);

insert into public.crew (id, loop_id, formed_at, anchored)
values
  ('c5000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', now() - interval '28 days', true),
  ('c5000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', now() - interval '28 days', false),
  ('c5000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', now() - interval '28 days', false);

-- (member n, crew n, crewed days ago, left days ago or null, drop or null)
insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, crewed_at, crew_id, left_at, drop_id)
select
  ('e5000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '15000000-0000-4000-8000-000000000001',
  ('b0000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  'crew_conditional',
  now() - interval '30 days',
  now() - make_interval(days => v.crewed_days_ago),
  ('c5000000-0000-4000-8000-' || lpad(v.crew::text, 12, '0'))::uuid,
  case when v.left_days_ago is null then null else now() - make_interval(days => v.left_days_ago) end,
  case when v.has_drop then 'd5000000-0000-4000-8000-000000000001'::uuid else null end
from (values
  ( 1, 1, 28, null::int, true),
  ( 2, 1, 28, null, true),
  ( 3, 1, 28, null, true),
  ( 4, 1, 28, null, true),
  ( 5, 2, 28, null, true),
  ( 6, 2, 28, null, true),
  ( 7, 2, 28, null, true),
  ( 8, 2, 28, null, false),
  ( 9, 2, 17, null, false),       -- latecomer: crewed after O1, before O2
  (10, 3, 28, null, true),
  (11, 3, 28, null, true),
  (12, 3, 28, null, true),
  (13, 3, 28, 10,   false)        -- left after O2, before O3
) as v (n, crew, crewed_days_ago, left_days_ago, has_drop);

-- attendance: (occurrence n, member n, status)
insert into public.attendance (occurrence_id, membership_id, status)
select
  ('f5000000-0000-4000-8000-' || lpad(v.o::text, 12, '0'))::uuid,
  ('e5000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.status::public.attendance_status
from (values
  -- C1
  (1,  1, 'present'), (1,  2, 'present'), (1,  3, 'present'), (1,  4, 'absent'),
  (2,  1, 'present'), (2,  2, 'present'), (2,  3, 'present'), (2,  4, 'present'),
  -- C2
  (1,  5, 'present'), (1,  6, 'present'), (1,  7, 'present'), (1,  8, 'absent'),
  (2,  5, 'present'), (2,  6, 'present'), (2,  7, 'present'), (2,  8, 'present'), (2, 9, 'absent'),
  (4,  5, 'present'), (4,  6, 'present'), (4,  7, 'present'), (4,  8, 'present'), (4, 9, 'present'),  -- cancelled
  (5,  5, 'present'), (5,  6, 'present'), (5,  7, 'present'),                                        -- future
  (6,  9, 'present'),                                        -- before F9's crewed_at: must not count O6
  -- C3
  (1, 10, 'present'), (1, 11, 'present'), (1, 12, 'present'), (1, 13, 'present'),
  (2, 10, 'present'), (2, 11, 'present'), (2, 12, 'absent'),  (2, 13, 'present'),
  (3, 10, 'present'), (3, 11, 'present'), (3, 12, 'present')
) as v (o, n, status);

-- rsvp: (occurrence n, member n, status)
insert into public.rsvp (occurrence_id, membership_id, status)
select
  ('f5000000-0000-4000-8000-' || lpad(v.o::text, 12, '0'))::uuid,
  ('e5000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.status::public.rsvp_status
from (values
  (1, 1, 'in'),       -- said in, came
  (1, 4, 'in'),       -- said in, absent
  (1, 8, 'out'),      -- out and absent: in the denominator, not the numerator
  (4, 5, 'in'),       -- cancelled occurrence: ignored
  (5, 5, 'in')        -- future occurrence: ignored
) as v (o, n, status);

-- ---------------------------------------------------------------------------
-- Loop W: watching conversion
-- ---------------------------------------------------------------------------

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
values ('16000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'watch-fixture', 'Watch fixture', 2, '18:00', 60, 'Uris');

insert into public.membership (id, loop_id, person_id, intent, tapped_in_at)
select
  ('e6000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '16000000-0000-4000-8000-000000000001',
  ('b0000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.intent::public.intent,
  now() - make_interval(days => v.entered_days_ago)
from (values
  (1, 'crew_conditional', 20),   -- entered watching 20d ago, upgraded 10d later → converted
  (2, 'watching',         20),   -- entered watching 20d ago, still watching   → eligible, not converted
  (3, 'going_want_crew',  20),   -- entered watching 20d ago, upgraded 18d later → eligible, too late
  (4, 'watching',          3)    -- entered watching 3d ago                      → pending
) as v (n, intent, entered_days_ago);

insert into public.intent_history (membership_id, prev_intent, new_intent, changed_at)
select
  ('e6000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.prev::public.intent, v.new::public.intent, now() - make_interval(days => v.days_ago)
from (values
  (1, null::text, 'watching',         20),
  (1, 'watching', 'crew_conditional', 10),
  (2, null,       'watching',         20),
  (3, null,       'watching',         20),
  (3, 'watching', 'going_want_crew',   2),
  (4, null,       'watching',          3)
) as v (n, prev, new, days_ago);

-- ---------------------------------------------------------------------------
-- Loop D: drop stats
-- ---------------------------------------------------------------------------

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
values ('17000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'drop-fixture', 'Drop fixture', 3, '17:00', 60, 'Mann');

insert into public."drop" (id, loop_id, token, label, kind)
values
  ('d7000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'drop_dd1', 'Donlon 2F GroupMe', 'group_chat'),
  ('d7000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000001', 'drop_dd2', 'Library pin',       'pin');

insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, drop_id, rsvp_source)
select
  ('e7000000-0000-4000-8000-' || lpad(s.i::text, 12, '0'))::uuid,
  '17000000-0000-4000-8000-000000000001',
  ('b0000000-0000-4000-8000-' || lpad(s.i::text, 12, '0'))::uuid,
  'watching',
  now() - interval '1 day',
  case when s.i <= 5 then 'd7000000-0000-4000-8000-000000000001'::uuid else null end,
  case when s.i <= 3 then 'luma'::public.rsvp_source else null end   -- 3 luma, 4 unanswered
from generate_series(1, 7) as s (i);

-- ---------------------------------------------------------------------------
-- Read as Dana (organizer of S, W, D) through RLS
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

\echo -- v_crew_stats
do $$
declare r public.v_crew_stats%rowtype; n bigint;
begin
  if auth.uid() is distinct from 'a0000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'impersonation failed: auth.uid() = %', auth.uid();
  end if;

  select count(*) into n from public.v_crew_stats where loop_id = '15000000-0000-4000-8000-000000000001';
  if n <> 3 then raise exception 'expected 3 crew rows for loop S, got %', n; end if;

  -- C1: 3-and-4-present → 7 of 8; said In 2, came 1; anchored; single drop
  select * into r from public.v_crew_stats where crew_id = 'c5000000-0000-4000-8000-000000000001';
  if r.present <> 7 or r.denominator <> 8 then
    raise exception 'C1 show-up: expected 7 of 8, got % of %', r.present, r.denominator;
  end if;
  if r.met_count <> 2 or r.reached_third then
    raise exception 'C1: expected met_count 2 and reached_third false, got % / %', r.met_count, r.reached_third;
  end if;
  if r.said_in <> 2 or r.said_in_and_came <> 1 then
    raise exception 'C1: expected said_in 2 and said_in_and_came 1, got % / %', r.said_in, r.said_in_and_came;
  end if;
  if not r.anchored then raise exception 'C1: expected anchored'; end if;
  if not r.single_drop then raise exception 'C1: expected single_drop'; end if;
  if r.active_members <> 4 then raise exception 'C1: expected 4 active members, got %', r.active_members; end if;

  -- C2: latecomer adds only O2; Out-and-absent in denominator; cancelled + future ignored; mixed
  select * into r from public.v_crew_stats where crew_id = 'c5000000-0000-4000-8000-000000000002';
  if r.present <> 7 or r.denominator <> 9 then
    raise exception 'C2 show-up: expected 7 of 9 (latecomer only in O2, Out-and-absent counted), got % of %', r.present, r.denominator;
  end if;
  if r.met_count <> 2 or r.reached_third then
    raise exception 'C2: expected met_count 2 (cancelled and future occurrences excluded), got %', r.met_count;
  end if;
  if r.said_in <> 0 or r.said_in_and_came <> 0 then
    raise exception 'C2: expected said_in 0 (out, and marks on cancelled/future ignored), got % / %', r.said_in, r.said_in_and_came;
  end if;
  if r.anchored then raise exception 'C2: expected not anchored'; end if;
  if r.single_drop then raise exception 'C2: expected mixed (one member without a drop)'; end if;
  if r.active_members <> 5 then raise exception 'C2: expected 5 active members, got %', r.active_members; end if;

  -- C3: left member's past attendance kept; unmarked-for-C1/C2 O3 counts for C3; reached third
  select * into r from public.v_crew_stats where crew_id = 'c5000000-0000-4000-8000-000000000003';
  if r.present <> 10 or r.denominator <> 11 then
    raise exception 'C3 show-up: expected 10 of 11 (left member kept for O1, O2; excluded from O3), got % of %', r.present, r.denominator;
  end if;
  if r.met_count <> 3 or not r.reached_third then
    raise exception 'C3: expected met_count 3 and reached_third, got % / %', r.met_count, r.reached_third;
  end if;
  if not r.single_drop then raise exception 'C3: expected single_drop (only active members count)'; end if;
  if r.active_members <> 3 then raise exception 'C3: expected 3 active members, got %', r.active_members; end if;

  -- pooled show-up across the loop: 24 of 28
  select sum(present), sum(denominator) into r.present, r.denominator
  from public.v_crew_stats where loop_id = '15000000-0000-4000-8000-000000000001';
  if r.present <> 24 or r.denominator <> 28 then
    raise exception 'pooled show-up: expected 24 of 28, got % of %', r.present, r.denominator;
  end if;
end $$;

\echo -- unmarked week excluded (O3 has no marks for C1 or C2)
do $$
declare n bigint;
begin
  -- If O3 were counted for C1, denominator would be 12; it is 8 (asserted above).
  -- Also assert directly that nothing on O3 belongs to C1/C2.
  select count(*) into n
  from public.attendance a
  join public.membership m on m.id = a.membership_id
  where a.occurrence_id = 'f5000000-0000-4000-8000-000000000003'
    and m.crew_id in ('c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'fixture broken: O3 has marks for C1/C2'; end if;
end $$;

\echo -- mark before crewed_at does not count the occurrence (0004)
do $$
declare r public.v_crew_stats%rowtype; n bigint;
begin
  -- Fixture sanity: O6's only mark is F9's, and O6 starts before F9's crewed_at.
  select count(*) into n
  from public.attendance a
  join public.membership m on m.id = a.membership_id
  join public.occurrence o on o.id = a.occurrence_id
  where a.occurrence_id = 'f5000000-0000-4000-8000-000000000006'
    and m.id = 'e5000000-0000-4000-8000-000000000009'
    and o.starts_at < m.crewed_at;
  if n <> 1 then raise exception 'fixture broken: expected F9''s out-of-window mark on O6, found %', n; end if;
  select count(*) into n from public.attendance where occurrence_id = 'f5000000-0000-4000-8000-000000000006';
  if n <> 1 then raise exception 'fixture broken: O6 should carry only F9''s mark, found %', n; end if;

  -- If O6 were counted for C2, F5-F8 (crewed 28d ago) would add 4 unmarked pairs → denominator 13.
  select * into r from public.v_crew_stats where crew_id = 'c5000000-0000-4000-8000-000000000002';
  if r.denominator <> 9 or r.present <> 7 then
    raise exception 'C2: an out-of-window mark counted O6 — expected 7 of 9, got % of %', r.present, r.denominator;
  end if;
  if r.met_count <> 2 then
    raise exception 'C2: expected met_count unchanged at 2, got %', r.met_count;
  end if;
end $$;

\echo -- v_watch_conversion
do $$
declare r public.v_watch_conversion%rowtype;
begin
  select * into r from public.v_watch_conversion where loop_id = '16000000-0000-4000-8000-000000000001';
  if r.loop_id is null then raise exception 'v_watch_conversion: no row for loop W'; end if;
  if r.converted <> 1 or r.eligible <> 3 or r.pending <> 1 then
    raise exception 'watch conversion: expected 1 of 3 plus 1 pending, got % of % plus % pending',
      r.converted, r.eligible, r.pending;
  end if;
end $$;

\echo -- v_intent_transitions
do $$
declare n bigint;
begin
  select transitions into n from public.v_intent_transitions
  where loop_id = '16000000-0000-4000-8000-000000000001' and prev_intent is null and new_intent = 'watching';
  if n <> 4 then raise exception 'transitions (none → watching): expected 4, got %', n; end if;

  select transitions into n from public.v_intent_transitions
  where loop_id = '16000000-0000-4000-8000-000000000001' and prev_intent = 'watching' and new_intent = 'crew_conditional';
  if n <> 1 then raise exception 'transitions (watching → crew_conditional): expected 1, got %', n; end if;

  select transitions into n from public.v_intent_transitions
  where loop_id = '16000000-0000-4000-8000-000000000001' and prev_intent = 'watching' and new_intent = 'going_want_crew';
  if n <> 1 then raise exception 'transitions (watching → going_want_crew): expected 1, got %', n; end if;

  select count(*) into n from public.v_intent_transitions where loop_id = '16000000-0000-4000-8000-000000000001';
  if n <> 3 then raise exception 'transitions: expected 3 distinct pairs for loop W, got %', n; end if;
end $$;

\echo -- v_drop_stats
do $$
declare n bigint;
begin
  select taps into n from public.v_drop_stats where drop_id = 'd7000000-0000-4000-8000-000000000001';
  if n <> 5 then raise exception 'drop DD1: expected 5 taps, got %', n; end if;

  select taps into n from public.v_drop_stats where drop_id = 'd7000000-0000-4000-8000-000000000002';
  if n is distinct from 0 then raise exception 'drop DD2: expected a row with 0 taps, got %', n; end if;

  select taps into n from public.v_drop_stats
  where loop_id = '17000000-0000-4000-8000-000000000001' and drop_id is null;
  if n <> 2 then raise exception 'no-drop row for loop D: expected 2, got %', n; end if;

  select count(*) into n from public.v_drop_stats where loop_id = '17000000-0000-4000-8000-000000000001';
  if n <> 3 then raise exception 'loop D: expected 3 rows (2 drops + no-drop), got %', n; end if;
end $$;

\echo -- v_rsvp_source_stats
do $$
declare n bigint;
begin
  select s.count into n from public.v_rsvp_source_stats s
  where s.loop_id = '17000000-0000-4000-8000-000000000001' and s.rsvp_source = 'luma';
  if n is distinct from 3 then raise exception 'rsvp_source luma: expected 3, got %', n; end if;

  select s.count into n from public.v_rsvp_source_stats s
  where s.loop_id = '17000000-0000-4000-8000-000000000001' and s.rsvp_source is null;
  if n is distinct from 4 then raise exception 'rsvp_source null: expected 4, got %', n; end if;

  select count(*) into n from public.v_rsvp_source_stats where loop_id = '17000000-0000-4000-8000-000000000001';
  if n <> 2 then raise exception 'rsvp_source: expected 2 rows for loop D, got %', n; end if;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

rollback;

\echo == stats.test.sql OK
