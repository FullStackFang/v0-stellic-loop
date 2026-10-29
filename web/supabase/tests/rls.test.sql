-- rls.test.sql — member-privacy policies with three users (tasks 2.2).
--
-- Runs as the connection role (postgres) after seed.sql. Everything happens in
-- one transaction that is rolled back at the end, so the seed stays pristine.
-- Users are impersonated with `set role authenticated` + request.jwt.claims.
-- Every assertion is a DO block that raises on failure (psql ON_ERROR_STOP).
--
-- Seeded:  Dana  a0…01 organizes loop A (cs2110-thursdays, 10…0a)
--          Sarah a0…02 member of A (crew_conditional)
--          Josh  a0…03 member of A (going_want_crew)
--          Maya  a0…04 member of A (watching)
-- Added here:
--          Omar  a0…05 organizes loop B (10…0b)
--          Priya a0…06 member of B
--          Sarah also member of B
--          crew A = {Sarah, Josh}, crew B = {Sarah, Priya}
--          Josh: rsvp 'in' for a PAST occurrence of A, 'out' for the NEXT one

\set ON_ERROR_STOP on
\echo == rls.test.sql

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
  v.email, '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', '', false, false
from (values
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'omar@cornell.edu'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'priya@cornell.edu')
) as v (id, email)
on conflict (id) do nothing;

update public.person set first_name = 'Omar'  where id = 'a0000000-0000-4000-8000-000000000005';
update public.person set first_name = 'Priya' where id = 'a0000000-0000-4000-8000-000000000006';

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
values ('10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000005', 'rls-loop-b', 'Loop B', 2, '18:00', 60, 'Uris');

insert into public.loop_secret (loop_id, ics_token)
values ('10000000-0000-4000-8000-00000000000b', 'ics_test_loop_b');

insert into public.occurrence (id, loop_id, starts_at)
values
  ('f0000000-0000-4000-8000-00000000b001', '10000000-0000-4000-8000-00000000000b', now() + interval '2 days'),
  ('f0000000-0000-4000-8000-00000000a0ff', '10000000-0000-4000-8000-00000000000a', now() - interval '7 days');

insert into public.crew (id, loop_id, formed_at, anchored)
values
  ('ca000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', now() - interval '1 day', true),
  ('cb000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000b', now() - interval '1 day', false);

-- crew A: Sarah + Josh (Maya stays watching, uncrewed)
update public.membership
   set crew_id = 'ca000000-0000-4000-8000-000000000001', crewed_at = now() - interval '1 day'
 where id in ('e0000000-0000-4000-8000-00000000a001', 'e0000000-0000-4000-8000-00000000a002');

-- loop B: Sarah + Priya, crew B
insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, crewed_at, crew_id)
values
  ('e0000000-0000-4000-8000-00000000b001', '10000000-0000-4000-8000-00000000000b',
   'a0000000-0000-4000-8000-000000000002', 'crew_conditional', now() - interval '2 days',
   now() - interval '1 day', 'cb000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-00000000b002', '10000000-0000-4000-8000-00000000000b',
   'a0000000-0000-4000-8000-000000000006', 'going_want_crew', now() - interval '2 days',
   now() - interval '1 day', 'cb000000-0000-4000-8000-000000000001');

insert into public.intent_history (membership_id, prev_intent, new_intent, changed_at)
values
  ('e0000000-0000-4000-8000-00000000b001', null, 'crew_conditional', now() - interval '2 days'),
  ('e0000000-0000-4000-8000-00000000b002', null, 'going_want_crew',  now() - interval '2 days');

-- Josh: 'in' for the past occurrence, 'out' for the next one
insert into public.rsvp (occurrence_id, membership_id, status)
values ('f0000000-0000-4000-8000-00000000a0ff', 'e0000000-0000-4000-8000-00000000a002', 'in');

insert into public.rsvp (occurrence_id, membership_id, status)
select o.id, 'e0000000-0000-4000-8000-00000000a002', 'out'
from public.occurrence o
join public.loop l on l.id = o.loop_id
where o.loop_id = '10000000-0000-4000-8000-00000000000a'
  and not o.cancelled
  and o.starts_at + make_interval(mins => l.duration_min) > now()
order by o.starts_at
limit 1;

-- ---------------------------------------------------------------------------
-- Structural checks (as postgres)
-- ---------------------------------------------------------------------------

\echo -- structure: v_crew_members columns, view security, RLS enabled, no write policies
do $$
declare
  v_cols  text;
  v_owner text;
  v_opts  text[];
  v_name  text;
  n       int;
begin
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'v_crew_members';
  if v_cols is distinct from 'crew_id,membership_id,first_name,is_you,rsvp_status' then
    raise exception 'v_crew_members columns must be crew_id,membership_id,first_name,is_you,rsvp_status; got %', v_cols;
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'v_crew_members'
    and column_name in ('intent', 'drop_id', 'rsvp_source', 'email', 'person_id', 'token', 'label');
  if n <> 0 then
    raise exception 'v_crew_members exposes a private column (intent / drop_id / rsvp_source / …)';
  end if;

  select pg_get_userbyid(c.relowner), c.reloptions into v_owner, v_opts
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'v_crew_members';
  if v_owner <> 'postgres' then
    raise exception 'v_crew_members owner must be postgres, got %', v_owner;
  end if;
  if v_opts is not null and 'security_invoker=true' = any (v_opts) then
    raise exception 'v_crew_members must be a definer view (security_invoker = false)';
  end if;

  foreach v_name in array array['v_intent_transitions', 'v_crew_stats', 'v_watch_conversion', 'v_drop_stats', 'v_rsvp_source_stats'] loop
    select c.reloptions into v_opts
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = v_name;
    if v_opts is null or not ('security_invoker=true' = any (v_opts)) then
      raise exception '% must be security_invoker = true', v_name;
    end if;
  end loop;

  select count(*) into n
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then
    raise exception '% public tables do not have RLS enabled', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and cmd <> 'SELECT';
  if n <> 0 then
    raise exception '% non-SELECT policies exist in public; authenticated must have zero write policies', n;
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public'
    and tablename in ('campus', 'loop_secret', 'link_preview', 'reminder_send', 'digest_send');
  if n <> 0 then
    raise exception 'campus/loop_secret/link_preview/reminder_send/digest_send must have no policies, found %', n;
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then
    raise exception 'anon has % grants in public; expected none', n;
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT';
  if n <> 0 then
    raise exception 'authenticated has % non-SELECT grants in public; expected none', n;
  end if;

  select count(*) into n from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and table_name in ('campus', 'loop_secret', 'link_preview', 'reminder_send', 'digest_send');
  if n <> 0 then
    raise exception 'authenticated must have no grant on campus/loop_secret/link_preview/reminder_send/digest_send, found %', n;
  end if;

  -- function EXECUTE: anon runs nothing; authenticated runs no public function
  foreach v_name in array array[
    'public.apply_formation(uuid,jsonb,text)',
    'public.formation_input_hash(uuid)',
    'public.auth_hook_before_user_created(jsonb)',
    'public.handle_new_auth_user()',
    'private.is_loop_member(uuid)',
    'private.is_loop_organizer(uuid)',
    'private.organizes_membership(uuid)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'anon can execute %', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'public.apply_formation(uuid,jsonb,text)',
    'public.formation_input_hash(uuid)',
    'public.auth_hook_before_user_created(jsonb)',
    'public.handle_new_auth_user()'
  ] loop
    if has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'authenticated can execute %', v_name;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Sarah: member of A and B
-- ---------------------------------------------------------------------------

\echo -- Sarah (member of A and B)
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';

do $$
declare
  n        bigint;
  v_person uuid;
  v_status public.rsvp_status;
  v_is_you boolean;
  q        text;
begin
  if auth.uid() is distinct from 'a0000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'impersonation failed: auth.uid() = %', auth.uid();
  end if;

  -- own-loop membership query returns only own row
  select count(*) into n
  from public.membership where loop_id = '10000000-0000-4000-8000-00000000000a';
  select person_id into v_person
  from public.membership where loop_id = '10000000-0000-4000-8000-00000000000a' limit 1;
  if n <> 1 or v_person is distinct from 'a0000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'Sarah: membership of loop A should be exactly her own row, got % rows (person %)', n, v_person;
  end if;

  select count(*) into n from public.membership;
  if n <> 2 then raise exception 'Sarah: expected 2 membership rows (A and B), got %', n; end if;

  select count(*) into n from public.loop;
  if n <> 2 then raise exception 'Sarah: expected to see loops A and B, got %', n; end if;

  select count(*) into n from public.occurrence
  where loop_id not in ('10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b');
  if n <> 0 then raise exception 'Sarah: sees % occurrences of loops she is not in', n; end if;

  select count(*) into n from public.occurrence where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 1 then raise exception 'Sarah: expected 1 occurrence of loop B, got %', n; end if;

  select count(*) into n from public.person;
  if n <> 1 then raise exception 'Sarah: expected only her own person row, got %', n; end if;

  -- no member policy on these: zero rows
  select count(*) into n from public.crew;
  if n <> 0 then raise exception 'Sarah: crew must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.intent_history;
  if n <> 0 then raise exception 'Sarah: intent_history must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.rsvp;
  if n <> 0 then raise exception 'Sarah: rsvp must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.attendance;
  if n <> 0 then raise exception 'Sarah: attendance must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public."drop";
  if n <> 0 then raise exception 'Sarah: drop must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_crew_stats;
  if n <> 0 then raise exception 'Sarah: v_crew_stats must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_intent_transitions;
  if n <> 0 then raise exception 'Sarah: v_intent_transitions must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_watch_conversion;
  if n <> 0 then raise exception 'Sarah: v_watch_conversion must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_drop_stats where drop_id is not null;
  if n <> 0 then raise exception 'Sarah: v_drop_stats must expose no drop rows to a member, got %', n; end if;
  -- v_rsvp_source_stats aggregates membership, so a member sees only her own rows
  select coalesce(sum(count), 0) into n from public.v_rsvp_source_stats;
  if n <> 2 then raise exception 'Sarah: v_rsvp_source_stats must count only her own 2 memberships, got %', n; end if;

  -- crewmates through v_crew_members only: crew A (Sarah, Josh) and crew B (Sarah, Priya)
  select count(*) into n from public.v_crew_members;
  if n <> 4 then raise exception 'Sarah: expected 4 v_crew_members rows (2 per crew), got %', n; end if;

  select count(*) into n from public.v_crew_members where crew_id = 'ca000000-0000-4000-8000-000000000001';
  if n <> 2 then raise exception 'Sarah: expected 2 rows for crew A, got %', n; end if;

  select rsvp_status, is_you into v_status, v_is_you from public.v_crew_members
  where membership_id = 'e0000000-0000-4000-8000-00000000a002';
  if v_status <> 'out' or v_is_you then
    raise exception 'Sarah: Josh should show rsvp out (next occurrence only, not the past in) and is_you false; got % / %', v_status, v_is_you;
  end if;

  select rsvp_status, is_you into v_status, v_is_you from public.v_crew_members
  where membership_id = 'e0000000-0000-4000-8000-00000000a001';
  if v_status <> 'no_reply' or not v_is_you then
    raise exception 'Sarah: own row should be no_reply and is_you true; got % / %', v_status, v_is_you;
  end if;

  select count(*) into n from public.v_crew_members where first_name = 'Maya';
  if n <> 0 then raise exception 'Sarah: uncrewed Maya must not appear in v_crew_members'; end if;

  -- tables with no policy at all: permission denied (or, at worst, zero rows)
  foreach q in array array[
    'select count(*) from public.loop_secret',
    'select count(*) from public.link_preview',
    'select count(*) from public.reminder_send',
    'select count(*) from public.digest_send',
    'select count(*) from public.campus'
  ] loop
    begin
      execute q into n;
      if n <> 0 then raise exception 'Sarah: % returned % rows; expected permission denied or 0', q, n; end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  -- writes: member UPDATE of own crew_id affects zero rows
  begin
    update public.membership set crew_id = null, crewed_at = null
    where id = 'e0000000-0000-4000-8000-00000000a001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Sarah: UPDATE of membership.crew_id affected % rows', n; end if;
  exception when insufficient_privilege then
    null;
  end;

  -- writes: member INSERT into loop affects zero rows
  begin
    insert into public.loop (campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place)
    values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
            'sarah-made-this', 'Nope', 1, '10:00', 60, 'Nowhere');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Sarah: INSERT into loop affected % rows', n; end if;
  exception when insufficient_privilege then
    null;
  end;

  -- writes: member cannot touch rsvp or intent_history directly either
  begin
    insert into public.rsvp (occurrence_id, membership_id, status)
    values ('f0000000-0000-4000-8000-00000000b001', 'e0000000-0000-4000-8000-00000000b001', 'in');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Sarah: INSERT into rsvp affected % rows', n; end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    delete from public.membership where id = 'e0000000-0000-4000-8000-00000000a001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Sarah: DELETE of membership affected % rows', n; end if;
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

-- confirm nothing was written
do $$
declare n bigint; v_crew uuid;
begin
  select crew_id into v_crew from public.membership where id = 'e0000000-0000-4000-8000-00000000a001';
  if v_crew is distinct from 'ca000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'member UPDATE leaked: Sarah crew_id is now %', v_crew;
  end if;
  select count(*) into n from public.loop where slug = 'sarah-made-this';
  if n <> 0 then raise exception 'member INSERT into loop leaked'; end if;
  select count(*) into n from public.rsvp where membership_id = 'e0000000-0000-4000-8000-00000000b001';
  if n <> 0 then raise exception 'member INSERT into rsvp leaked'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Josh: member of A only — nothing about loop B or Sarah's membership in it
-- ---------------------------------------------------------------------------

\echo -- Josh (member of A only)
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';

do $$
declare n bigint;
begin
  select count(*) into n from public.membership where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Josh: membership of loop B must be 0 rows, got %', n; end if;

  select count(*) into n from public.membership;
  if n <> 1 then raise exception 'Josh: expected exactly his own membership row, got %', n; end if;

  select count(*) into n from public.loop where id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Josh: must not see loop B'; end if;

  select count(*) into n from public.loop;
  if n <> 1 then raise exception 'Josh: expected to see only loop A, got % loops', n; end if;

  select count(*) into n from public.occurrence where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Josh: must not see occurrences of loop B'; end if;

  select count(*) into n from public.v_crew_members;
  if n <> 2 then raise exception 'Josh: expected 2 v_crew_members rows (crew A), got %', n; end if;

  select count(*) into n from public.v_crew_members where crew_id = 'cb000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'Josh: v_crew_members leaked crew B'; end if;

  select count(*) into n from public.v_crew_members where first_name = 'Priya';
  if n <> 0 then raise exception 'Josh: v_crew_members leaked Priya (loop B)'; end if;

  select count(*) into n from public.v_crew_members
  where membership_id = 'e0000000-0000-4000-8000-00000000a001' and first_name = 'Sarah';
  if n <> 1 then raise exception 'Josh: should see crewmate Sarah through crew A'; end if;

  select count(*) into n from public.person;
  if n <> 1 then raise exception 'Josh: expected only his own person row, got %', n; end if;

  -- metric views: nothing a member can aggregate beyond his own membership
  select count(*) into n from public.v_crew_stats;
  if n <> 0 then raise exception 'Josh: v_crew_stats must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_intent_transitions;
  if n <> 0 then raise exception 'Josh: v_intent_transitions must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_watch_conversion;
  if n <> 0 then raise exception 'Josh: v_watch_conversion must return 0 rows to a member, got %', n; end if;
  select count(*) into n from public.v_drop_stats;   -- his membership has a drop, and drops are organizer-only
  if n <> 0 then raise exception 'Josh: v_drop_stats must return 0 rows to a member, got %', n; end if;
  select coalesce(sum(count), 0) into n from public.v_rsvp_source_stats
  where loop_id = '10000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'Josh: v_rsvp_source_stats must count only his own membership, got %', n; end if;
  select count(*) into n from public.v_rsvp_source_stats
  where loop_id <> '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Josh: v_rsvp_source_stats leaked another loop, got % rows', n; end if;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Dana: organizer of A — sees A's data, nothing of B
-- ---------------------------------------------------------------------------

\echo -- Dana (organizer of A)
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

do $$
declare n bigint; q text;
begin
  select count(*) into n from public.membership where loop_id = '10000000-0000-4000-8000-00000000000a';
  if n <> 3 then raise exception 'Dana: expected 3 memberships in loop A, got %', n; end if;

  select count(*) into n from public.membership where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Dana: must see 0 memberships of loop B, got %', n; end if;

  select count(*) into n from public.loop;
  if n <> 2 then raise exception 'Dana: expected to see her two loops (A and kickoff), got %', n; end if;

  select count(*) into n from public.loop where id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Dana: must not see loop B'; end if;

  select count(*) into n from public.v_rsvp_source_stats where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Dana: v_rsvp_source_stats leaked loop B'; end if;

  select count(*) into n from public.intent_history;
  if n <> 3 then raise exception 'Dana: expected 3 intent_history rows (loop A), got %', n; end if;

  select count(*) into n from public.crew;
  if n <> 1 then raise exception 'Dana: expected 1 crew (A), got %', n; end if;

  select count(*) into n from public."drop";
  if n <> 2 then raise exception 'Dana: expected 2 drops of loop A, got %', n; end if;

  select count(*) into n from public.rsvp;
  if n <> 2 then raise exception 'Dana: expected 2 rsvp rows (Josh, loop A), got %', n; end if;

  select count(*) into n from public.occurrence where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Dana: must not see occurrences of loop B'; end if;

  select count(*) into n from public.v_crew_stats;
  if n <> 1 then raise exception 'Dana: v_crew_stats should show 1 crew (A), got %', n; end if;

  select count(*) into n from public.v_crew_stats where loop_id <> '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Dana: v_crew_stats leaked another loop'; end if;

  select count(*) into n from public.v_intent_transitions where loop_id <> '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Dana: v_intent_transitions leaked another loop'; end if;

  select count(*) into n from public.v_watch_conversion where loop_id <> '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Dana: v_watch_conversion leaked another loop'; end if;

  select count(*) into n from public.v_drop_stats where loop_id <> '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Dana: v_drop_stats leaked another loop'; end if;

  select count(*) into n from public.v_drop_stats where drop_id is not null;
  if n <> 2 then raise exception 'Dana: v_drop_stats should list 2 drops, got %', n; end if;

  select taps into n from public.v_drop_stats where drop_id = 'd0000000-0000-4000-8000-000000000001';
  if n <> 2 then raise exception 'Dana: Donlon GroupMe drop should have 2 taps, got %', n; end if;

  select taps into n from public.v_drop_stats
  where loop_id = '10000000-0000-4000-8000-00000000000a' and drop_id is null;
  if n <> 1 then raise exception 'Dana: no-drop row should be 1 (Maya), got %', n; end if;

  -- organizer is not a member: no crewmates view
  select count(*) into n from public.v_crew_members;
  if n <> 0 then raise exception 'Dana: v_crew_members should be empty for a non-member organizer, got %', n; end if;

  -- members'' person rows are read via the service role, not RLS
  select count(*) into n from public.person;
  if n <> 1 then raise exception 'Dana: expected only her own person row, got %', n; end if;

  foreach q in array array[
    'select count(*) from public.loop_secret',
    'select count(*) from public.link_preview',
    'select count(*) from public.reminder_send',
    'select count(*) from public.digest_send'
  ] loop
    begin
      execute q into n;
      if n <> 0 then raise exception 'Dana: % returned % rows; expected permission denied or 0', q, n; end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  -- organizer has no direct write either
  begin
    update public.occurrence set cancelled = true where loop_id = '10000000-0000-4000-8000-00000000000a';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Dana: UPDATE of occurrence affected % rows', n; end if;
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

do $$
declare n bigint;
begin
  select count(*) into n from public.occurrence
  where loop_id = '10000000-0000-4000-8000-00000000000a' and cancelled;
  if n <> 0 then raise exception 'organizer UPDATE leaked: % occurrences cancelled', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Omar: organizer of B — sees B, nothing of A
-- ---------------------------------------------------------------------------

\echo -- Omar (organizer of B)
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000005';

do $$
declare n bigint;
begin
  select count(*) into n from public.membership where loop_id = '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Omar: must see 0 memberships of loop A, got %', n; end if;
  select count(*) into n from public.membership where loop_id = '10000000-0000-4000-8000-00000000000b';
  if n <> 2 then raise exception 'Omar: expected 2 memberships in loop B, got %', n; end if;
  select count(*) into n from public.loop;
  if n <> 1 then raise exception 'Omar: expected only loop B, got %', n; end if;
  select count(*) into n from public.crew;
  if n <> 1 then raise exception 'Omar: expected only crew B, got %', n; end if;
  select count(*) into n from public."drop";
  if n <> 0 then raise exception 'Omar: must not see loop A drops, got %', n; end if;
  select count(*) into n from public.rsvp;
  if n <> 0 then raise exception 'Omar: must not see loop A rsvps, got %', n; end if;

  -- metric views: only loop B
  select count(*) into n from public.v_crew_stats;
  if n <> 1 then raise exception 'Omar: v_crew_stats should show 1 crew (B), got %', n; end if;
  select count(*) into n from public.v_crew_stats where loop_id <> '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Omar: v_crew_stats leaked another loop'; end if;
  select count(*) into n from public.v_intent_transitions;
  if n = 0 then raise exception 'Omar: v_intent_transitions should show loop B transitions'; end if;
  select count(*) into n from public.v_intent_transitions where loop_id <> '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Omar: v_intent_transitions leaked another loop'; end if;
  select count(*) into n from public.v_watch_conversion where loop_id <> '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Omar: v_watch_conversion leaked another loop'; end if;
  select count(*) into n from public.v_drop_stats where loop_id <> '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Omar: v_drop_stats leaked another loop'; end if;
  select count(*) into n from public.v_rsvp_source_stats;
  if n = 0 then raise exception 'Omar: v_rsvp_source_stats should show loop B'; end if;
  select count(*) into n from public.v_rsvp_source_stats where loop_id <> '10000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'Omar: v_rsvp_source_stats leaked another loop'; end if;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- Maya leaves loop A: a left member no longer reads the loop or its occurrences
-- ---------------------------------------------------------------------------

\echo -- Maya (left loop A)
update public.membership set left_at = now() where id = 'e0000000-0000-4000-8000-00000000a003';

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';

do $$
declare n bigint;
begin
  if auth.uid() is distinct from 'a0000000-0000-4000-8000-000000000004'::uuid then
    raise exception 'impersonation failed: auth.uid() = %', auth.uid();
  end if;
  select count(*) into n from public.loop where id = '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Maya (left): must not read loop A, got % rows', n; end if;
  select count(*) into n from public.occurrence where loop_id = '10000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'Maya (left): must not read occurrences of loop A, got % rows', n; end if;
end $$;

reset role;
reset request.jwt.claims;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- anon: zero rows (permission denied) on every table and view
-- The DO block runs as postgres and switches to anon inside each probe, so it
-- does not depend on anon being allowed to run DO blocks at all.
-- ---------------------------------------------------------------------------

\echo -- anon
do $$
declare q text; n bigint;
begin
  foreach q in array array[
    'select count(*) from public.campus',
    'select count(*) from public.person',
    'select count(*) from public.loop',
    'select count(*) from public.loop_secret',
    'select count(*) from public."drop"',
    'select count(*) from public.occurrence',
    'select count(*) from public.crew',
    'select count(*) from public.membership',
    'select count(*) from public.intent_history',
    'select count(*) from public.rsvp',
    'select count(*) from public.attendance',
    'select count(*) from public.link_preview',
    'select count(*) from public.reminder_send',
    'select count(*) from public.digest_send',
    'select count(*) from public.v_crew_members',
    'select count(*) from public.v_intent_transitions',
    'select count(*) from public.v_crew_stats',
    'select count(*) from public.v_watch_conversion',
    'select count(*) from public.v_drop_stats',
    'select count(*) from public.v_rsvp_source_stats'
  ] loop
    begin
      execute 'set local role anon';
      execute q into n;
      if n <> 0 then raise exception 'anon: % returned % rows; expected permission denied or 0', q, n; end if;
    exception when insufficient_privilege then
      null;   -- the sub-transaction rollback also reverts the set local role
    end;
  end loop;
  execute 'reset role';
end $$;

reset role;

rollback;

\echo == rls.test.sql OK
