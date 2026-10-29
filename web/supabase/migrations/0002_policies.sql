-- 0002_policies.sql — row-level security, grants, policies (design.md "Data access rule").
--
--   anon          : no grants on any table, view, or function
--   authenticated : SELECT only, and only on tables/views that carry a policy;
--                   ZERO insert/update/delete policies — every write is a server
--                   action using the service role, or a security definer function
--   service_role  : untouched (Supabase grants it everything; it bypasses RLS)
--
-- Supabase's default privileges grant ALL on new public tables and views to
-- anon/authenticated, which is why the REVOKEs below are explicit and must run
-- after every table/view in 0001_schema.sql exists.
--
-- Tables with NO policy and NO authenticated grant (service role only):
--   campus, loop_secret, link_preview, reminder_send, digest_send

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on every table
-- ---------------------------------------------------------------------------

alter table public.campus         enable row level security;
alter table public.person         enable row level security;
alter table public.loop           enable row level security;
alter table public.loop_secret    enable row level security;
alter table public."drop"         enable row level security;
alter table public.occurrence     enable row level security;
alter table public.crew           enable row level security;
alter table public.membership     enable row level security;
alter table public.intent_history enable row level security;
alter table public.rsvp           enable row level security;
alter table public.attendance     enable row level security;
alter table public.link_preview   enable row level security;
alter table public.reminder_send  enable row level security;
alter table public.digest_send    enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Grants: strip anon and authenticated, then grant SELECT back narrowly
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;           -- "tables" includes views
revoke all on all tables in schema public from authenticated;

-- Stop Supabase's default privileges from re-granting anon/authenticated on
-- objects created by later migrations, and strip what already exists.
-- 0003_auth.sql runs after this and grants its hook to supabase_auth_admin.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant select on
  public.person,
  public.loop,
  public."drop",
  public.occurrence,
  public.crew,
  public.membership,
  public.intent_history,
  public.rsvp,
  public.attendance
to authenticated;

grant select on
  public.v_crew_members,
  public.v_intent_transitions,
  public.v_crew_stats,
  public.v_watch_conversion,
  public.v_drop_stats,
  public.v_rsvp_source_stats
to authenticated;

-- Formation functions: service role only (the revoke above stripped everyone else).
grant execute on function public.formation_input_hash(uuid), public.apply_formation(uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Policy helpers (security definer, so a loop policy can look at membership
--    and a membership policy can look at loop without RLS recursion). They only
--    ever answer a question about the calling user.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_loop_organizer(p_loop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loop l
    where l.id = p_loop_id and l.organizer_id = (select auth.uid())
  )
$$;

-- Active members only: once left_at is set, the member no longer reads the loop
-- or its occurrences through RLS. The public loop page and /l/<slug>/leave read
-- loop facts through the service role, not RLS.
create or replace function private.is_loop_member(p_loop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membership m
    where m.loop_id = p_loop_id and m.person_id = (select auth.uid())
      and m.left_at is null
  )
$$;

create or replace function private.organizes_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    join public.loop l on l.id = m.loop_id
    where m.id = p_membership_id and l.organizer_id = (select auth.uid())
  )
$$;

revoke all on function private.is_loop_organizer(uuid)     from public, anon;
revoke all on function private.is_loop_member(uuid)        from public, anon;
revoke all on function private.organizes_membership(uuid)  from public, anon;
grant execute on function private.is_loop_organizer(uuid)    to authenticated;
grant execute on function private.is_loop_member(uuid)       to authenticated;
grant execute on function private.organizes_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Member SELECT policies
-- ---------------------------------------------------------------------------

drop policy if exists person_select_own on public.person;
create policy person_select_own on public.person
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists membership_select_own on public.membership;
create policy membership_select_own on public.membership
  for select to authenticated
  using (person_id = (select auth.uid()));

drop policy if exists loop_select_member_or_organizer on public.loop;
create policy loop_select_member_or_organizer on public.loop
  for select to authenticated
  using (organizer_id = (select auth.uid()) or private.is_loop_member(id));

drop policy if exists occurrence_select_member_or_organizer on public.occurrence;
create policy occurrence_select_member_or_organizer on public.occurrence
  for select to authenticated
  using (private.is_loop_member(loop_id) or private.is_loop_organizer(loop_id));

-- ---------------------------------------------------------------------------
-- 5. Organizer SELECT policies (loop.organizer_id = auth.uid())
-- ---------------------------------------------------------------------------

drop policy if exists membership_select_organizer on public.membership;
create policy membership_select_organizer on public.membership
  for select to authenticated
  using (private.is_loop_organizer(loop_id));

drop policy if exists intent_history_select_organizer on public.intent_history;
create policy intent_history_select_organizer on public.intent_history
  for select to authenticated
  using (private.organizes_membership(membership_id));

drop policy if exists crew_select_organizer on public.crew;
create policy crew_select_organizer on public.crew
  for select to authenticated
  using (private.is_loop_organizer(loop_id));

drop policy if exists attendance_select_organizer on public.attendance;
create policy attendance_select_organizer on public.attendance
  for select to authenticated
  using (private.organizes_membership(membership_id));

drop policy if exists rsvp_select_organizer on public.rsvp;
create policy rsvp_select_organizer on public.rsvp
  for select to authenticated
  using (private.organizes_membership(membership_id));

drop policy if exists drop_select_organizer on public."drop";
create policy drop_select_organizer on public."drop"
  for select to authenticated
  using (private.is_loop_organizer(loop_id));

-- No policies, by design: campus, loop_secret, link_preview, reminder_send, digest_send.
-- No INSERT / UPDATE / DELETE policy exists for authenticated on any table.
