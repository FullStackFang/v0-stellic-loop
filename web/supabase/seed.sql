-- seed.sql — Cornell campus, one organizer, three members, one loop (no crews yet).
--
-- Idempotent: every insert is `on conflict do nothing`, so it is safe to run
-- after `supabase db reset` (which may also run it) and again by hand.
--
-- Users are inserted into auth.users directly so the trigger from
-- 0003_auth.sql creates the person rows exactly as a real sign-up would; a
-- DO block at the end fails loudly if it did not. Magic links for these
-- accounts work through auth.admin.generateLink (they have no password).
--
-- Fixed ids (tests rely on them):
--   campus  Cornell          c0000000-0000-4000-8000-000000000001
--   person  Dana  (organizer) a0000000-0000-4000-8000-000000000001  dana@cornell.edu
--   person  Sarah (member)    a0000000-0000-4000-8000-000000000002  sarah@cornell.edu
--   person  Josh  (member)    a0000000-0000-4000-8000-000000000003  josh@med.cornell.edu
--   person  Maya  (member)    a0000000-0000-4000-8000-000000000004  maya@cornell.edu
--   loop    cs2110-thursdays  10000000-0000-4000-8000-00000000000a  (weekly, Thu 19:00 ET, 90 min)
--   loop    kickoff           10000000-0000-4000-8000-00000000000c  (one-off, Nov 3 2026 18:00 ET, 120 min)
--   occurrence kickoff        f0000000-0000-4000-8000-00000000c001
--   drop    Donlon 2F GroupMe d0000000-0000-4000-8000-000000000001  token drop_donlon2f_groupme_seed
--   drop    Olin pin          d0000000-0000-4000-8000-000000000002  token drop_olin_pin_seed
--   membership Sarah/Josh/Maya e0000000-0000-4000-8000-00000000a001 / a002 / a003
--   Crew-less: no crew rows; crew_id/crewed_at are null on every membership.

-- ---------------------------------------------------------------------------
-- Campus
-- ---------------------------------------------------------------------------

insert into public.campus (id, name, tz, domains)
values (
  'c0000000-0000-4000-8000-000000000001',
  'Cornell University',
  'America/New_York',
  array['cornell.edu', 'med.cornell.edu', 'tech.cornell.edu',
        'johnson.cornell.edu', 'law.cornell.edu', 'vet.cornell.edu']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Users (auth.users + auth.identities) → person via trigger
-- ---------------------------------------------------------------------------

-- A reset that drops public but keeps auth.users would leave orphan users; remove them so the trigger re-creates person.
delete from auth.users u
where u.id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
               'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004')
  and not exists (select 1 from public.person p where p.id = u.id);

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
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'dana@cornell.edu'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'sarah@cornell.edu'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'josh@med.cornell.edu'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'maya@cornell.edu')
) as v (id, email)
on conflict (id) do nothing;

insert into auth.identities (
  user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  v.id, v.id::text, 'email',
  jsonb_build_object('sub', v.id::text, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'dana@cornell.edu'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'sarah@cornell.edu'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'josh@med.cornell.edu'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'maya@cornell.edu')
) as v (id, email)
where not exists (
  select 1 from auth.identities i where i.user_id = v.id and i.provider = 'email'
);

update public.person set first_name = 'Dana'  where id = 'a0000000-0000-4000-8000-000000000001' and first_name is null;
update public.person set first_name = 'Sarah' where id = 'a0000000-0000-4000-8000-000000000002' and first_name is null;
update public.person set first_name = 'Josh'  where id = 'a0000000-0000-4000-8000-000000000003' and first_name is null;
update public.person set first_name = 'Maya'  where id = 'a0000000-0000-4000-8000-000000000004' and first_name is null;

do $$
declare n int;
begin
  select count(*) into n
  from public.person
  where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
               'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004')
    and campus_id = 'c0000000-0000-4000-8000-000000000001';
  if n <> 4 then
    raise exception 'seed: expected 4 persons on the Cornell campus, found % (did the auth.users trigger from 0003_auth.sql run?)', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Loop, secret, drops
-- ---------------------------------------------------------------------------

insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, duration_min, place, linked_url)
values (
  '10000000-0000-4000-8000-00000000000a',
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'cs2110-thursdays',
  'CS 2110 Thursday problem sets',
  4,                        -- Thursday (ISO)
  '19:00',
  90,
  'Olin Library, 2nd floor group rooms',
  null
)
on conflict (id) do nothing;

insert into public.loop_secret (loop_id, ics_token)
values ('10000000-0000-4000-8000-00000000000a', 'ics_seed_3f9c1b2a7d4e4f6b8a1c2d3e4f5a6b7c')
on conflict (loop_id) do nothing;

-- One-off loop: a single occurrence at Nov 3 2026 18:00 America/New_York
-- (inserted here the way the app does at creation; no trigger).
insert into public.loop (id, campus_id, organizer_id, slug, title, weekday, start_local, single_occurrence_at, duration_min, place, linked_url)
values (
  '10000000-0000-4000-8000-00000000000c',
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'kickoff',
  'Loop kickoff dinner',
  null,
  null,
  timestamp '2026-11-03 18:00' at time zone 'America/New_York',
  120,
  'Collegetown Bagels',
  null
)
on conflict (id) do nothing;

insert into public.occurrence (id, loop_id, starts_at)
values ('f0000000-0000-4000-8000-00000000c001', '10000000-0000-4000-8000-00000000000c',
        timestamp '2026-11-03 18:00' at time zone 'America/New_York')
on conflict (loop_id, starts_at) do nothing;

insert into public.loop_secret (loop_id, ics_token)
values ('10000000-0000-4000-8000-00000000000c', 'ics_seed_kickoff_9b7e2d4c6a1f4e8b9c0d1e2f3a4b5c6d')
on conflict (loop_id) do nothing;

insert into public."drop" (id, loop_id, token, label, kind)
values
  ('d0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a',
   'drop_donlon2f_groupme_seed', 'Donlon 2F GroupMe', 'group_chat'),
  ('d0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000a',
   'drop_olin_pin_seed', 'Olin 2nd floor pin', 'pin')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Occurrences: the next 4 that have not ended, at 19:00 wall time in the
-- campus zone (computed from local date + time, so DST is respected).
-- ---------------------------------------------------------------------------

insert into public.occurrence (loop_id, starts_at)
select cand.loop_id, cand.starts_at
from (
  select
    l.id as loop_id,
    l.duration_min,
    ((today_local
        + ((l.weekday - extract(isodow from today_local)::int + 7) % 7)
        + 7 * s.i)::date
      + l.start_local) at time zone c.tz as starts_at
  from public.loop l
  join public.campus c on c.id = l.campus_id
  cross join lateral (select (now() at time zone c.tz)::date as today_local) t
  cross join generate_series(0, 5) as s (i)
  where l.id = '10000000-0000-4000-8000-00000000000a'
) cand
where cand.starts_at + make_interval(mins => cand.duration_min) > now()
order by cand.starts_at
limit 4
on conflict (loop_id, starts_at) do nothing;

-- ---------------------------------------------------------------------------
-- Memberships (no crews yet) + first-tap-in history rows
-- ---------------------------------------------------------------------------

insert into public.membership (id, loop_id, person_id, intent, tapped_in_at, drop_id)
values
  ('e0000000-0000-4000-8000-00000000a001', '10000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000002', 'crew_conditional', now() - interval '3 hours',
   'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-00000000a002', '10000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000003', 'going_want_crew', now() - interval '2 hours',
   'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-00000000a003', '10000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000004', 'watching', now() - interval '1 hour',
   null)
on conflict (id) do nothing;

insert into public.intent_history (id, membership_id, prev_intent, new_intent, occurrence_id, changed_at)
select
  v.id, v.membership_id, null, m.intent, nxt.id, m.tapped_in_at
from (values
  ('e1000000-0000-4000-8000-00000000a001'::uuid, 'e0000000-0000-4000-8000-00000000a001'::uuid),
  ('e1000000-0000-4000-8000-00000000a002'::uuid, 'e0000000-0000-4000-8000-00000000a002'::uuid),
  ('e1000000-0000-4000-8000-00000000a003'::uuid, 'e0000000-0000-4000-8000-00000000a003'::uuid)
) as v (id, membership_id)
join public.membership m on m.id = v.membership_id
left join lateral (
  select o.id
  from public.occurrence o
  join public.loop l on l.id = o.loop_id
  where o.loop_id = m.loop_id
    and not o.cancelled
    and o.starts_at + make_interval(mins => l.duration_min) > now()
  order by o.starts_at
  limit 1
) nxt on true
on conflict (id) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.occurrence
  where loop_id = '10000000-0000-4000-8000-00000000000a' and not cancelled and starts_at > now();
  if n < 3 then
    raise exception 'seed: expected at least 3 future occurrences for cs2110-thursdays, found %', n;
  end if;
end $$;
