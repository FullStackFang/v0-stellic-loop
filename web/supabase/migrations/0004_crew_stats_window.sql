-- 0004_crew_stats_window.sql — v_crew_stats: a mark only counts an occurrence
-- for a crew when the marking member was inside their crew window.
--
-- 0001 counted an occurrence for a crew as soon as ANY attendance mark existed
-- for a member whose membership.crew_id = the crew, regardless of that member's
-- crewed_at / left_at. The denominator pairs already respect the window, so a
-- mark outside it (before crewed_at, or at/after left_at) could not add a pair
-- for the marking member, but it could make the occurrence counted and thereby
-- add an unmarked pair for every other member inside their window.
--
-- The app refuses to record a mark for a member outside their crew window; the
-- view must agree, so imported or hand-entered marks cannot inflate a crew's
-- denominator. The `counted` CTE therefore restricts the EXISTS to the marking
-- member's own window. Everything else (columns, order, security_invoker, the
-- grant) is identical to 0001; the TS reads the 12 columns by name.

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
        and am.crewed_at is not null
        and o.starts_at >= am.crewed_at
        and (am.left_at is null or o.starts_at < am.left_at)
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

grant select on public.v_crew_stats to authenticated;
