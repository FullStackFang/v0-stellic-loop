-- formation.test.sql — formation_input_hash canonical form and apply_formation
-- (ships with group 2; it satisfies tasks.md 5.2's "mismatched hash and forced
-- mid-call error leave zero new crews". The packing itself is tested in Vitest).
--
-- Runs as postgres in one rolled-back transaction. Fixture persons are the
-- same F1..F13 as stats.test.sql (b0000000-0000-4000-8000-0000000000NN).
--
-- Loop H (hash-fixture, 19…01): pins the canonical text that
--   web/lib/formation.ts `formationInputHash` must reproduce:
--   two eligible members, two crews (active sizes 5 and 4), a left member and
--   a watching member that must not appear.
-- Loop E (empty-fixture, 1e…01): no memberships → md5('').
-- Loop F (formation-fixture, 18…01): apply_formation behaviour.

\set ON_ERROR_STOP on
\echo == formation.test.sql

begin;

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

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
values
  ('19000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'hash-fixture', 'Hash fixture', 4, '19:00', 90, 'Olin'),
  ('1e000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'empty-fixture', 'Empty fixture', 4, '19:00', 90, 'Olin'),
  ('18000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'formation-fixture', 'Formation fixture', 4, '19:00', 90, 'Olin');

-- ---------------------------------------------------------------------------
-- Loop H: canonical hash fixture
-- ---------------------------------------------------------------------------

insert into public.crew (id, loop_id, formed_at, anchored)
values
  ('c9000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', now() - interval '7 days', true),   -- x, 5 active
  ('c9000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000001', now() - interval '7 days', false);  -- y, 4 active

insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, crewed_at, crew_id, left_at)
select
  ('e9000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '19000000-0000-4000-8000-000000000001',
  ('b0000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.intent::public.intent,
  v.tapped::timestamptz,
  case when v.crew is null then null else now() - interval '7 days' end,
  case when v.crew is null then null else ('c9000000-0000-4000-8000-' || lpad(v.crew::text, 12, '0'))::uuid end,
  case when v.left_ then now() - interval '1 day' else null end
from (values
  ( 1, 'going_want_crew',  '2026-10-17 09:00:00+00',        null::int, false),  -- eligible "a"
  ( 2, 'crew_conditional', '2026-10-17 09:05:00.000700+00', null,      false),  -- eligible "b"; microseconds truncated to .000
  ( 3, 'crew_conditional', '2026-10-01 09:00:00+00', 1, false),
  ( 4, 'crew_conditional', '2026-10-01 09:00:00+00', 1, false),
  ( 5, 'crew_conditional', '2026-10-01 09:00:00+00', 1, false),
  ( 6, 'crew_conditional', '2026-10-01 09:00:00+00', 1, false),
  ( 7, 'crew_conditional', '2026-10-01 09:00:00+00', 1, false),
  ( 8, 'crew_conditional', '2026-10-01 09:00:00+00', 2, false),
  ( 9, 'crew_conditional', '2026-10-01 09:00:00+00', 2, false),
  (10, 'crew_conditional', '2026-10-01 09:00:00+00', 2, false),
  (11, 'crew_conditional', '2026-10-01 09:00:00+00', 2, false),
  (12, 'crew_conditional', '2026-10-01 09:00:00+00', 2, true),             -- in crew y but left: not active, not eligible
  (13, 'watching',         '2026-10-17 08:00:00+00', null, false)          -- watching: excluded
) as v (n, intent, tapped, crew, left_);

\echo -- formation_input_hash: canonical form
do $$
declare v_expected text; v_actual text;
begin
  -- the literal canonical text, with the fixture ids in place of a, b, x, y
  v_expected := md5(E'm|e9000000-0000-4000-8000-000000000001|going_want_crew|2026-10-17T09:00:00.000Z\nm|e9000000-0000-4000-8000-000000000002|crew_conditional|2026-10-17T09:05:00.000Z\nc|c9000000-0000-4000-8000-000000000001|5\nc|c9000000-0000-4000-8000-000000000002|4');
  v_actual := public.formation_input_hash('19000000-0000-4000-8000-000000000001');
  if v_actual <> v_expected then
    raise exception 'formation_input_hash canonical form mismatch: got %, expected %', v_actual, v_expected;
  end if;

  -- empty loop hashes to md5('')
  v_actual := public.formation_input_hash('1e000000-0000-4000-8000-000000000001');
  if v_actual <> md5('') then
    raise exception 'formation_input_hash of an empty loop should be md5(''''), got %', v_actual;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Loop F: apply_formation
-- ---------------------------------------------------------------------------

insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, left_at)
select
  ('e8000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '18000000-0000-4000-8000-000000000001',
  ('b0000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  v.intent::public.intent,
  now() - make_interval(hours => v.hours_ago),
  case when v.left_ then now() - interval '1 hour' else null end
from (values
  (1, 'going_want_crew',  3, false),
  (2, 'crew_conditional', 2, false),
  (3, 'crew_conditional', 1, false),
  (4, 'crew_conditional', 0, false),
  (5, 'watching',         0, false),
  (6, 'crew_conditional', 5, true)      -- left: ineligible
) as v (n, intent, hours_ago, left_);

\echo -- apply_formation
do $$
declare
  v_loop   uuid := '18000000-0000-4000-8000-000000000001';
  v_hash   text;
  v_hash2  text;
  v_result jsonb;
  v_crew   uuid;
  v_crew2  uuid;
  n        bigint;
  v_t      timestamptz;
  v_snap   text;
  v_snap2  text;
begin
  v_hash := public.formation_input_hash(v_loop);

  -- 1. mismatched hash: nothing saved
  begin
    perform public.apply_formation(v_loop,
      '{"new_crews":[{"membership_ids":["e8000000-0000-4000-8000-000000000001","e8000000-0000-4000-8000-000000000002","e8000000-0000-4000-8000-000000000003","e8000000-0000-4000-8000-000000000004"]}]}'::jsonb,
      'bogus');
    raise exception 'apply_formation accepted a mismatched hash';
  exception when others then
    if sqlerrm <> 'formation_input_changed' then raise; end if;
  end;
  select count(*) into n from public.crew where loop_id = v_loop;
  if n <> 0 then raise exception 'mismatched hash left % crews', n; end if;

  -- 2. error mid-call (first crew is placed, second lists watching F5, left F6,
  --    and the just-placed F1/F2): zero new crews
  begin
    perform public.apply_formation(v_loop,
      '{"new_crews":[{"membership_ids":["e8000000-0000-4000-8000-000000000001","e8000000-0000-4000-8000-000000000002","e8000000-0000-4000-8000-000000000003","e8000000-0000-4000-8000-000000000004"]},{"membership_ids":["e8000000-0000-4000-8000-000000000005","e8000000-0000-4000-8000-000000000006","e8000000-0000-4000-8000-000000000001","e8000000-0000-4000-8000-000000000002"]}]}'::jsonb,
      v_hash);
    raise exception 'apply_formation placed a watching member';
  exception when others then
    if sqlerrm not like 'apply_formation: % not eligible' then raise; end if;
  end;
  select count(*) into n from public.crew where loop_id = v_loop;
  if n <> 0 then raise exception 'mid-call error left % crews', n; end if;
  select count(*) into n from public.membership where loop_id = v_loop and crew_id is not null;
  if n <> 0 then raise exception 'mid-call error left % placed memberships', n; end if;

  -- 3. happy path: one new crew of four, anchored by F1
  v_result := public.apply_formation(v_loop,
    '{"fills":[],"new_crews":[{"membership_ids":["e8000000-0000-4000-8000-000000000001","e8000000-0000-4000-8000-000000000002","e8000000-0000-4000-8000-000000000003","e8000000-0000-4000-8000-000000000004"]}]}'::jsonb,
    v_hash);
  if (v_result ->> 'crews_created')::int <> 1 or (v_result ->> 'placed')::int <> 4 then
    raise exception 'apply_formation result unexpected: %', v_result;
  end if;
  if v_result ->> 'input_hash' <> v_hash then raise exception 'result input_hash differs'; end if;

  select id into v_crew from public.crew where loop_id = v_loop;
  if v_crew is null then raise exception 'no crew created'; end if;
  if not (select anchored from public.crew where id = v_crew) then raise exception 'crew should be anchored (F1 going_want_crew)'; end if;

  select count(*), min(crewed_at) into n, v_t from public.membership where crew_id = v_crew;
  if n <> 4 or v_t is null then raise exception 'expected 4 placed memberships with crewed_at, got %', n; end if;
  select count(*) into n from public.membership where crew_id = v_crew and crewed_at <> v_t;
  if n <> 0 then raise exception 'crewed_at differs within one placement'; end if;

  select count(*) into n from public.membership where loop_id = v_loop and crew_id is null;
  if n <> 2 then raise exception 'watching F5 and left F6 must stay uncrewed, got % uncrewed', n; end if;

  -- 4. same hash again: input changed (pool empty, crew exists)
  begin
    perform public.apply_formation(v_loop, '{"new_crews":[]}'::jsonb, v_hash);
    raise exception 'apply_formation accepted a stale hash';
  exception when others then
    if sqlerrm <> 'formation_input_changed' then raise; end if;
  end;

  -- 5. fill: F7 taps in and joins the existing crew (size 5); anchored stays true
  insert into public.membership (id, loop_id, person_id, intent, tapped_in_at)
  values ('e8000000-0000-4000-8000-000000000007', v_loop, 'b0000000-0000-4000-8000-000000000007', 'crew_conditional', now());
  v_hash2 := public.formation_input_hash(v_loop);
  if v_hash2 = v_hash then raise exception 'hash did not change after a tap-in'; end if;

  v_result := public.apply_formation(v_loop,
    jsonb_build_object('fills', jsonb_build_array(jsonb_build_object('crew_id', v_crew, 'membership_id', 'e8000000-0000-4000-8000-000000000007'))),
    v_hash2);
  if (v_result ->> 'crews_created')::int <> 0 or (v_result ->> 'placed')::int <> 1 then
    raise exception 'fill result unexpected: %', v_result;
  end if;
  select count(*) into n from public.membership where crew_id = v_crew and left_at is null;
  if n <> 5 then raise exception 'expected crew of 5 after fill, got %', n; end if;

  -- 6. an unanchored crew becomes anchored when a going_want_crew member fills it
  insert into public.membership (id, loop_id, person_id, intent, tapped_in_at)
  select ('e8000000-0000-4000-8000-' || lpad(s.i::text, 12, '0'))::uuid, v_loop,
         ('b0000000-0000-4000-8000-' || lpad(s.i::text, 12, '0'))::uuid, 'crew_conditional', now()
  from generate_series(8, 11) as s (i);
  v_result := public.apply_formation(v_loop,
    '{"new_crews":[{"membership_ids":["e8000000-0000-4000-8000-000000000008","e8000000-0000-4000-8000-000000000009","e8000000-0000-4000-8000-000000000010","e8000000-0000-4000-8000-000000000011"]}]}'::jsonb,
    public.formation_input_hash(v_loop));
  select id into v_crew2 from public.crew where loop_id = v_loop and id <> v_crew;
  if (select anchored from public.crew where id = v_crew2) then raise exception 'all-conditional crew must not be anchored'; end if;

  insert into public.membership (id, loop_id, person_id, intent, tapped_in_at)
  values ('e8000000-0000-4000-8000-000000000012', v_loop, 'b0000000-0000-4000-8000-000000000012', 'going_want_crew', now());
  perform public.apply_formation(v_loop,
    jsonb_build_object('fills', jsonb_build_array(jsonb_build_object('crew_id', v_crew2, 'membership_id', 'e8000000-0000-4000-8000-000000000012'))),
    public.formation_input_hash(v_loop));
  if not (select anchored from public.crew where id = v_crew2) then raise exception 'crew must become anchored after a going_want_crew fill'; end if;

  -- 7. a crew from another loop is refused
  insert into public.membership (id, loop_id, person_id, intent, tapped_in_at)
  values ('e8000000-0000-4000-8000-000000000013', v_loop, 'b0000000-0000-4000-8000-000000000013', 'crew_conditional', now());
  begin
    perform public.apply_formation(v_loop,
      '{"fills":[{"crew_id":"c9000000-0000-4000-8000-000000000002","membership_id":"e8000000-0000-4000-8000-000000000013"}]}'::jsonb,
      public.formation_input_hash(v_loop));
    raise exception 'apply_formation accepted a crew from another loop';
  exception when others then
    if sqlerrm not like 'apply_formation: crew % does not belong to loop %' then raise; end if;
  end;
  select crew_id into v_crew from public.membership where id = 'e8000000-0000-4000-8000-000000000013';
  if v_crew is not null then raise exception 'cross-loop fill leaked'; end if;

  -- state now: crew 1 (F1-F4, F7) and crew 2 (F8-F12) have 5 active each;
  -- F13 is eligible. Make F5 eligible too so two fills are possible.
  update public.membership set intent = 'crew_conditional' where id = 'e8000000-0000-4000-8000-000000000005';
  select crew_id into v_crew from public.membership where id = 'e8000000-0000-4000-8000-000000000001';
  select string_agg(id::text || '=' || coalesce(crew_id::text, '-'), ',' order by id) into v_snap
  from public.membership where loop_id = v_loop;

  -- 8. fills that push a crew past 6 active members: raises, nothing saved
  begin
    perform public.apply_formation(v_loop,
      jsonb_build_object('fills', jsonb_build_array(
        jsonb_build_object('crew_id', v_crew, 'membership_id', 'e8000000-0000-4000-8000-000000000005'),
        jsonb_build_object('crew_id', v_crew, 'membership_id', 'e8000000-0000-4000-8000-000000000013'))),
      public.formation_input_hash(v_loop));
    raise exception 'apply_formation accepted a crew of 7';
  exception when others then
    if sqlerrm not like 'apply_formation: crew % would have % active members; the maximum is 6' then raise; end if;
  end;
  select count(*) into n from public.crew where loop_id = v_loop;
  if n <> 2 then raise exception 'oversized fill changed the crew count to %', n; end if;
  select string_agg(id::text || '=' || coalesce(crew_id::text, '-'), ',' order by id) into v_snap2
  from public.membership where loop_id = v_loop;
  if v_snap2 is distinct from v_snap then raise exception 'oversized fill changed crew_ids: % -> %', v_snap, v_snap2; end if;

  -- 9. a new crew of 2 (outside 4..6): raises, nothing saved
  begin
    perform public.apply_formation(v_loop,
      '{"new_crews":[{"membership_ids":["e8000000-0000-4000-8000-000000000005","e8000000-0000-4000-8000-000000000013"]}]}'::jsonb,
      public.formation_input_hash(v_loop));
    raise exception 'apply_formation accepted a new crew of 2';
  exception when others then
    if sqlerrm not like 'apply_formation: a new crew needs 4 to 6 members, got %' then raise; end if;
  end;
  select count(*) into n from public.crew where loop_id = v_loop;
  if n <> 2 then raise exception 'undersized new crew changed the crew count to %', n; end if;
  select string_agg(id::text || '=' || coalesce(crew_id::text, '-'), ',' order by id) into v_snap2
  from public.membership where loop_id = v_loop;
  if v_snap2 is distinct from v_snap then raise exception 'undersized new crew changed crew_ids: % -> %', v_snap, v_snap2; end if;
end $$;

rollback;

\echo == formation.test.sql OK
