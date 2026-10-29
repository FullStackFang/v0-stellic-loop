-- 0001_schema.sql — Loop MVP schema (openspec/changes/loop-mvp/design.md, "Schema").
--
-- Conventions
--   * every id is uuid, every timestamp is timestamptz
--   * loop.weekday is ISO: 1 = Monday … 7 = Sunday (same as extract(isodow from …))
--   * loop.start_local is the wall-clock start in the campus time zone (campus.tz)
--   * every statement is idempotent so `supabase db push` can be re-run safely
--
-- Row-level security, grants, and policies live in 0002_policies.sql.
-- Auth trigger and the before-user-created hook live in 0003_auth.sql.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.intent as enum ('crew_conditional', 'going_want_crew', 'watching');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drop_kind as enum ('group_chat', 'pin', 'person', 'event_page', 'qr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rsvp_status as enum ('in', 'out', 'no_reply');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'absent');
exception when duplicate_object then null; end $$;

-- Self-reported "where did you RSVP for this event" (organizer-only, like drop_id).
do $$ begin
  create type public.rsvp_source as enum ('luma', 'partiful', 'campusgroups', 'other', 'none');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.campus (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  tz         text not null,                       -- IANA zone, e.g. America/New_York
  domains    text[] not null default '{}'         -- exact email domains, lower-case
);

-- person.id = auth.users.id; rows are created by the trigger in 0003_auth.sql.
create table if not exists public.person (
  id         uuid primary key references auth.users (id) on delete cascade,
  campus_id  uuid not null references public.campus (id),
  email      text not null unique,
  first_name text,
  created_at timestamptz not null default now()
);
create index if not exists person_campus_id_idx on public.person (campus_id);

-- Two shapes, enforced by loop_shape_check:
--   weekly  : weekday + start_local set, single_occurrence_at null (occurrences topped up by cron)
--   one-off : single_occurrence_at set, weekday + start_local null (the app inserts
--             its single occurrence row at creation; no trigger)
create table if not exists public.loop (
  id                   uuid primary key default gen_random_uuid(),
  campus_id            uuid not null references public.campus (id),
  organizer_id         uuid not null references public.person (id),
  slug                 text not null unique,
  title                text not null,
  weekday              int  check (weekday between 1 and 7),
  start_local          time,
  single_occurrence_at timestamptz,
  duration_min         int  not null check (duration_min > 0),
  place                text not null,
  linked_url           text,
  created_at           timestamptz not null default now(),
  constraint loop_shape_check check (
    (weekday is not null and start_local is not null and single_occurrence_at is null)
    or
    (weekday is null and start_local is null and single_occurrence_at is not null)
  )
);
create index if not exists loop_organizer_id_idx on public.loop (organizer_id);
create index if not exists loop_campus_id_idx on public.loop (campus_id);

-- Kept apart from loop so the calendar token can never ride along on a loop select.
create table if not exists public.loop_secret (
  loop_id   uuid primary key references public.loop (id) on delete cascade,
  ics_token text not null unique
);

-- "drop" is a non-reserved keyword in Postgres; quoted everywhere for clarity.
create table if not exists public."drop" (
  id         uuid primary key default gen_random_uuid(),
  loop_id    uuid not null references public.loop (id) on delete cascade,
  token      text not null unique,
  label      text not null,
  kind       public.drop_kind not null,
  created_at timestamptz not null default now()
);
create index if not exists drop_loop_id_idx on public."drop" (loop_id);

create table if not exists public.occurrence (
  id         uuid primary key default gen_random_uuid(),
  loop_id    uuid not null references public.loop (id) on delete cascade,
  starts_at  timestamptz not null,
  linked_url text,
  cancelled  boolean not null default false,
  unique (loop_id, starts_at)
);

create table if not exists public.crew (
  id        uuid primary key default gen_random_uuid(),
  loop_id   uuid not null references public.loop (id) on delete cascade,
  formed_at timestamptz not null default now(),
  anchored  boolean not null default false,
  unique (id, loop_id)                           -- target of membership's composite FK
);
create index if not exists crew_loop_id_idx on public.crew (loop_id);

create table if not exists public.membership (
  id           uuid primary key default gen_random_uuid(),
  loop_id      uuid not null references public.loop (id) on delete cascade,
  person_id    uuid not null references public.person (id) on delete cascade,
  intent       public.intent not null,
  tapped_in_at timestamptz not null default now(),
  crewed_at    timestamptz,                      -- set with crew_id; starts the attendance denominator
  crew_id      uuid,
  left_at      timestamptz,                      -- leaving keeps crew_id so past attendance stays attributed
  drop_id      uuid references public."drop" (id), -- written on first tap-in only, never changed
  rsvp_source  public.rsvp_source,                -- self-reported; organizer-only, never in v_crew_members
  unique (loop_id, person_id),
  -- a membership can never point at another loop's crew
  foreign key (crew_id, loop_id) references public.crew (id, loop_id),
  check ((crew_id is null) = (crewed_at is null))
);
create index if not exists membership_person_id_idx on public.membership (person_id);
create index if not exists membership_crew_id_idx on public.membership (crew_id);
create index if not exists membership_drop_id_idx on public.membership (drop_id);

create table if not exists public.intent_history (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.membership (id) on delete cascade,
  prev_intent   public.intent,                   -- null on first tap-in
  new_intent    public.intent not null,
  occurrence_id uuid references public.occurrence (id) on delete set null,
  changed_at    timestamptz not null default now()
);
create index if not exists intent_history_membership_id_idx on public.intent_history (membership_id);
create index if not exists intent_history_occurrence_id_idx on public.intent_history (occurrence_id);

create table if not exists public.rsvp (
  occurrence_id uuid not null references public.occurrence (id) on delete cascade,
  membership_id uuid not null references public.membership (id) on delete cascade,
  status        public.rsvp_status not null,
  responded_at  timestamptz not null default now(),
  primary key (occurrence_id, membership_id)
);
create index if not exists rsvp_membership_id_idx on public.rsvp (membership_id);

create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrence (id) on delete cascade,
  membership_id uuid not null references public.membership (id) on delete cascade,
  status        public.attendance_status not null,
  marked_at     timestamptz not null default now(),
  unique (occurrence_id, membership_id)
);
create index if not exists attendance_membership_id_idx on public.attendance (membership_id);

create table if not exists public.link_preview (
  url            text primary key,
  title          text,
  image_url      text,
  description    text,
  event_start    timestamptz,
  event_location text,
  fetched_at     timestamptz,
  last_error     text
);

create table if not exists public.reminder_send (
  membership_id uuid not null references public.membership (id) on delete cascade,
  occurrence_id uuid not null references public.occurrence (id) on delete cascade,
  sent_at       timestamptz not null default now(),
  primary key (membership_id, occurrence_id)
);
create index if not exists reminder_send_occurrence_id_idx on public.reminder_send (occurrence_id);

create table if not exists public.digest_send (
  membership_id uuid not null references public.membership (id) on delete cascade,
  week_start    date not null,                   -- Monday of the ISO week, UTC, at run time
  sent_at       timestamptz not null default now(),
  primary key (membership_id, week_start)
);

-- ---------------------------------------------------------------------------
-- v_crew_members — the ONLY way a member sees crewmates (design rule 2).
-- Definer view (owner postgres, security_invoker = false): its body bypasses RLS,
-- so the body itself does the filtering:
--   * only crews where the caller has an active membership (left_at is null)
--   * only active rows of those crews
--   * rsvp_status for the loop's next occurrence only (earliest not-cancelled
--     occurrence whose start + duration is after now), 'no_reply' when unanswered
-- Columns: crew_id, membership_id, first_name, is_you, rsvp_status. Nothing else.
-- ---------------------------------------------------------------------------

create or replace view public.v_crew_members
with (security_invoker = false) as
select
  m.crew_id,
  m.id                                             as membership_id,
  p.first_name,
  (m.person_id = (select auth.uid()))              as is_you,
  coalesce(r.status, 'no_reply'::public.rsvp_status) as rsvp_status
from public.membership m
join public.person p on p.id = m.person_id
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
left join public.rsvp r
  on r.occurrence_id = nxt.id and r.membership_id = m.id
where m.left_at is null
  and m.crew_id is not null
  and m.crew_id in (
    select mine.crew_id
    from public.membership mine
    where mine.person_id = (select auth.uid())
      and mine.left_at is null
      and mine.crew_id is not null
  );

alter view public.v_crew_members owner to postgres;

-- ---------------------------------------------------------------------------
-- Metric views — security_invoker = true, so the organizer policies in
-- 0002_policies.sql decide which base rows feed them. They contain no auth
-- logic of their own; read through the service role they report every loop.
-- ---------------------------------------------------------------------------

-- Intent transition counts per loop, by (from, to) pair. prev_intent is null
-- for the first tap-in.
create or replace view public.v_intent_transitions
with (security_invoker = true) as
select
  m.loop_id,
  ih.prev_intent,
  ih.new_intent,
  count(*)::bigint as transitions
from public.intent_history ih
join public.membership m on m.id = ih.membership_id
group by m.loop_id, ih.prev_intent, ih.new_intent;

-- Per-crew statistics, exactly per attendance-tracking and drop-attribution:
--   counted occurrence = not cancelled, started (starts_at <= now()), and at
--     least one attendance mark for any member of that crew (left or not)
--   denominator pair    = (member, counted occurrence) with
--     occurrence.starts_at >= membership.crewed_at and, when left_at is set,
--     occurrence.starts_at < membership.left_at. Intent and RSVP never change it.
--   present             = denominator pairs marked present
--   met_count           = counted occurrences with >= 3 present among denominator pairs
--   reached_third       = met_count >= 3
--   said_in / said_in_and_came = denominator pairs with rsvp 'in', and those also present
--   single_drop         = every ACTIVE member has the same non-null drop_id
create or replace view public.v_crew_stats
with (security_invoker = true) as
with counted as (
  select c.id as crew_id, o.id as occurrence_id, o.starts_at
  from public.crew c
  join public.occurrence o on o.loop_id = c.loop_id
  where not o.cancelled
    and o.starts_at <= now()
    and exists (
      select 1
      from public.attendance a
      join public.membership am on am.id = a.membership_id
      where a.occurrence_id = o.id
        and am.crew_id = c.id
    )
),
pairs as (
  select
    co.crew_id,
    co.occurrence_id,
    m.id as membership_id,
    (a.status = 'present') as present,        -- null when unmarked
    (r.status = 'in')      as said_in         -- null when unanswered
  from counted co
  join public.membership m on m.crew_id = co.crew_id
  left join public.attendance a
    on a.occurrence_id = co.occurrence_id and a.membership_id = m.id
  left join public.rsvp r
    on r.occurrence_id = co.occurrence_id and r.membership_id = m.id
  where m.crewed_at is not null
    and co.starts_at >= m.crewed_at
    and (m.left_at is null or co.starts_at < m.left_at)
),
met as (
  select crew_id, count(*)::bigint as met_count
  from (
    select crew_id, occurrence_id
    from pairs
    where present
    group by crew_id, occurrence_id
    having count(*) >= 3
  ) x
  group by crew_id
),
agg as (
  select
    crew_id,
    count(*) filter (where present)                 as present,
    count(*)                                        as denominator,
    count(*) filter (where said_in)                 as said_in,
    count(*) filter (where said_in and present)     as said_in_and_came
  from pairs
  group by crew_id
),
active as (
  select
    crew_id,
    count(*)::bigint as active_members,
    (bool_and(drop_id is not null) and count(distinct drop_id) = 1) as single_drop
  from public.membership
  where crew_id is not null and left_at is null
  group by crew_id
)
select
  c.id                                   as crew_id,
  c.loop_id,
  c.formed_at,
  c.anchored,
  coalesce(ac.active_members, 0)::bigint as active_members,
  coalesce(ac.single_drop, false)        as single_drop,
  coalesce(mt.met_count, 0)::bigint      as met_count,
  (coalesce(mt.met_count, 0) >= 3)       as reached_third,
  coalesce(ag.present, 0)::bigint        as present,
  coalesce(ag.denominator, 0)::bigint    as denominator,
  coalesce(ag.said_in, 0)::bigint        as said_in,
  coalesce(ag.said_in_and_came, 0)::bigint as said_in_and_came
from public.crew c
left join active ac on ac.crew_id = c.id
left join met    mt on mt.crew_id = c.id
left join agg    ag on ag.crew_id = c.id;

-- Watching conversion per loop (organizer-dashboard, "Watching conversion definition"):
--   entry      = an intent_history row whose new_intent is 'watching'
--   converted  = entry at least 14 days old whose FIRST later transition went to
--                crew_conditional or going_want_crew within 14 days of the entry
--   eligible   = entries at least 14 days old
--   pending    = entries younger than 14 days
create or replace view public.v_watch_conversion
with (security_invoker = true) as
with entries as (
  select
    m.loop_id,
    ih.changed_at,
    (
      select n.new_intent in ('crew_conditional', 'going_want_crew')
         and n.changed_at <= ih.changed_at + interval '14 days'
      from public.intent_history n
      where n.membership_id = ih.membership_id
        and (n.changed_at > ih.changed_at
             or (n.changed_at = ih.changed_at and n.id > ih.id))
      order by n.changed_at, n.id
      limit 1
    ) as converted
  from public.intent_history ih
  join public.membership m on m.id = ih.membership_id
  where ih.new_intent = 'watching'
)
select
  loop_id,
  count(*) filter (where changed_at <= now() - interval '14 days' and converted)::bigint as converted,
  count(*) filter (where changed_at <= now() - interval '14 days')::bigint               as eligible,
  count(*) filter (where changed_at >  now() - interval '14 days')::bigint               as pending
from entries
group by loop_id;

-- Taps-in per drop (every membership row counts, including members who left),
-- plus one row per loop with drop_id null for memberships that have no drop.
-- A loop with no drop-less memberships has no null row: treat absence as 0.
create or replace view public.v_drop_stats
with (security_invoker = true) as
select
  d.loop_id,
  d.id               as drop_id,
  d.label,
  d.kind,
  count(m.id)::bigint as taps
from public."drop" d
left join public.membership m on m.drop_id = d.id
group by d.id
union all
select
  m.loop_id,
  null::uuid,
  null::text,
  null::public.drop_kind,
  count(*)::bigint
from public.membership m
where m.drop_id is null
group by m.loop_id;

-- Self-reported RSVP source per loop; memberships with no answer are reported
-- as one row with rsvp_source null.
create or replace view public.v_rsvp_source_stats
with (security_invoker = true) as
select
  m.loop_id,
  m.rsvp_source,
  count(*)::bigint as count
from public.membership m
group by m.loop_id, m.rsvp_source;

-- ---------------------------------------------------------------------------
-- Crew formation: input hash + apply_formation (design.md "Crew formation is a
-- pure function"). The packing algorithm lives only in lib/formation.ts; the
-- database recomputes the INPUT HASH from current rows and applies placements
-- verbatim inside one transaction.
--
-- Canonical input form. The matching TypeScript implementation is
-- `formationInputHash` in web/lib/formation.ts; the two MUST produce
-- byte-identical text. tests/formation.test.sql pins it with a literal fixture.
--
--   one line per eligible membership, sorted by membership id in plain
--   code-point order (collate "C" on the canonical lower-case uuid text):
--       m|<membership id>|<intent>|<tapped_in_at as ISO 8601 UTC with milliseconds>
--       e.g. m|…|going_want_crew|2026-10-17T19:00:00.000Z
--   then one line per existing crew of the loop (every crew, full ones too),
--   sorted by crew id (collate "C"):
--       c|<crew id>|<active size = count of memberships with crew_id = crew.id and left_at is null>
--   lines joined with a single "\n" (0x0A), no trailing newline;
--   hash = md5 hex digest (lower-case) of that text; the empty input hashes to md5('').
--
--   eligible membership = loop_id matches, left_at is null, crew_id is null,
--                         intent in ('crew_conditional', 'going_want_crew');
--                         watching members are excluded
--   timestamp format    = to_char(tapped_in_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
--                         (MS truncates microseconds, like Date#toISOString)
-- ---------------------------------------------------------------------------

create or replace function public.formation_input_hash(p_loop_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(s.line, E'\n' order by s.ord, s.sort_id collate "C"), ''))
  from (
    select 1 as ord, m.id::text as sort_id,
      'm|' || m.id::text || '|' || m.intent::text || '|'
        || to_char(m.tapped_in_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as line
    from public.membership m
    where m.loop_id = p_loop_id
      and m.left_at is null
      and m.crew_id is null
      and m.intent in ('crew_conditional', 'going_want_crew')
    union all
    select 2 as ord, c.id::text as sort_id,
      'c|' || c.id::text || '|'
        || (select count(*) from public.membership x
            where x.crew_id = c.id and x.left_at is null)::text as line
    from public.crew c
    where c.loop_id = p_loop_id
  ) s
$$;

-- apply_formation(loop_id, placements, input_hash)
--   placements: {"fills":[{"crew_id":"…","membership_id":"…"}],
--                "new_crews":[{"membership_ids":["…", "…"]}]}
--   1. takes a per-loop advisory lock so two confirms cannot interleave
--   2. recomputes the input hash from current rows; raises
--      'formation_input_changed' (SQLSTATE P0001) when it differs
--   3. fills: sets crew_id + crewed_at = now() on each eligible membership and
--      flips crew.anchored to true when that member's intent is going_want_crew
--   4. new_crews: inserts a crew, places the listed memberships, anchored = true
--      when any placed member's intent is going_want_crew
--   Any ineligible membership (left, already crewed, watching, other loop) or a
--   crew from another loop raises, which rolls back the whole call. So does a
--   new crew outside 4..6 members, or any crew ending with more than 6 active.
--   Returns {"crews_created": n, "placed": n, "input_hash": "…"}.
create or replace function public.apply_formation(
  p_loop_id    uuid,
  p_placements jsonb,
  p_input_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash          text;
  v_now           timestamptz := now();
  v_fill          jsonb;
  v_new           jsonb;
  v_crew_id       uuid;
  v_membership_id uuid;
  v_member_ids    uuid[];
  v_updated       int;
  v_crews_created int := 0;
  v_placed        int := 0;
begin
  if p_loop_id is null or p_placements is null then
    raise exception 'apply_formation: loop_id and placements are required';
  end if;

  perform pg_advisory_xact_lock(hashtext('apply_formation'), hashtext(p_loop_id::text));

  v_hash := public.formation_input_hash(p_loop_id);
  if v_hash is distinct from p_input_hash then
    raise exception 'formation_input_changed'
      using detail = format('current input hash %s, preview hash %s', v_hash, coalesce(p_input_hash, '<null>')),
            hint   = 'the eligible pool or existing crews changed since the preview; show a fresh preview';
  end if;

  -- step 1: fills into existing crews
  for v_fill in
    select value from jsonb_array_elements(coalesce(p_placements -> 'fills', '[]'::jsonb))
  loop
    v_crew_id       := (v_fill ->> 'crew_id')::uuid;
    v_membership_id := (v_fill ->> 'membership_id')::uuid;

    if not exists (select 1 from public.crew c where c.id = v_crew_id and c.loop_id = p_loop_id) then
      raise exception 'apply_formation: crew % does not belong to loop %', v_crew_id, p_loop_id;
    end if;

    update public.membership m
       set crew_id = v_crew_id, crewed_at = v_now
     where m.id = v_membership_id
       and m.loop_id = p_loop_id
       and m.left_at is null
       and m.crew_id is null
       and m.intent in ('crew_conditional', 'going_want_crew');
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'apply_formation: membership % is not eligible for placement', v_membership_id;
    end if;
    v_placed := v_placed + 1;

    update public.crew c
       set anchored = true
     where c.id = v_crew_id
       and not c.anchored
       and exists (
         select 1 from public.membership m
         where m.id = v_membership_id and m.intent = 'going_want_crew'
       );
  end loop;

  -- step 2: new crews
  for v_new in
    select value from jsonb_array_elements(coalesce(p_placements -> 'new_crews', '[]'::jsonb))
  loop
    select array_agg(t.x::uuid) into v_member_ids
    from jsonb_array_elements_text(coalesce(v_new -> 'membership_ids', '[]'::jsonb)) as t(x);

    if coalesce(array_length(v_member_ids, 1), 0) = 0 then
      raise exception 'apply_formation: new crew without membership_ids';
    end if;

    -- defence in depth: formation.ts only proposes crews of 4 to 6
    if array_length(v_member_ids, 1) not between 4 and 6 then
      raise exception 'apply_formation: a new crew needs 4 to 6 members, got %', array_length(v_member_ids, 1);
    end if;

    insert into public.crew (loop_id, formed_at, anchored)
    values (p_loop_id, v_now, false)
    returning id into v_crew_id;
    v_crews_created := v_crews_created + 1;

    update public.membership m
       set crew_id = v_crew_id, crewed_at = v_now
     where m.id = any (v_member_ids)
       and m.loop_id = p_loop_id
       and m.left_at is null
       and m.crew_id is null
       and m.intent in ('crew_conditional', 'going_want_crew');
    get diagnostics v_updated = row_count;
    if v_updated <> array_length(v_member_ids, 1) then
      raise exception 'apply_formation: % of % memberships for a new crew were not eligible',
        array_length(v_member_ids, 1) - v_updated, array_length(v_member_ids, 1);
    end if;
    v_placed := v_placed + v_updated;

    update public.crew c
       set anchored = true
     where c.id = v_crew_id
       and exists (
         select 1 from public.membership m
         where m.crew_id = v_crew_id and m.intent = 'going_want_crew'
       );
  end loop;

  -- defence in depth: no crew of this loop may end with more than 6 active members
  select m.crew_id, count(*) into v_crew_id, v_updated
  from public.membership m
  where m.loop_id = p_loop_id and m.crew_id is not null and m.left_at is null
  group by m.crew_id
  having count(*) > 6
  limit 1;
  if found then
    raise exception 'apply_formation: crew % would have % active members; the maximum is 6', v_crew_id, v_updated;
  end if;

  return jsonb_build_object(
    'crews_created', v_crews_created,
    'placed',        v_placed,
    'input_hash',    v_hash
  );
end;
$$;
