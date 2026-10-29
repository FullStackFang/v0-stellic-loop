-- 0003_auth.sql — campus gating and person creation (design.md "Campus gating").
--
-- Two pieces:
--   1. public.auth_hook_before_user_created(event jsonb)
--      Supabase "Before User Created" auth hook. Rejects any sign-up whose exact
--      email domain is on no campus.domains, so signInWithOtp for a new address
--      returns an error the client maps to "a campus email is required".
--   2. trigger on auth.users (after insert) → public.person
--      Resolves campus by exact domain match and inserts the person row.
--      It also raises when no campus matches, as a second gate for the case
--      where the hook is not enabled (e.g. a freshly created project).
--
-- ENABLING THE HOOK (hosted dashboard, per project — not done by migrations):
--   1. Apply this migration (`supabase db push`).
--   2. Dashboard → Authentication → Hooks (Beta) → "Before User Created".
--   3. Enable hook, Hook type: Postgres.
--      Schema: public   Function: auth_hook_before_user_created
--   4. Save. New sign-ups now call the function before the user row is created.
--   Supabase calls the function as supabase_auth_admin, hence the grants below.
--
-- Return shape (Supabase auth hook contract):
--   allow  → '{}'
--   reject → {"error": {"http_code": <4xx>, "message": "<shown to the client>"}}

-- ---------------------------------------------------------------------------
-- 1. Before-user-created hook
-- ---------------------------------------------------------------------------

create or replace function public.auth_hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email  text;
  v_domain text;
begin
  v_email  := lower(coalesce(event -> 'user' ->> 'email', ''));
  v_domain := split_part(v_email, '@', 2);

  if v_domain = ''
     or not exists (select 1 from public.campus c where v_domain = any (c.domains)) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   'a campus email is required'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke all on function public.auth_hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.auth_hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 2. auth.users → public.person
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text;
  v_domain    text;
  v_campus_id uuid;
begin
  v_email  := lower(coalesce(new.email, ''));
  v_domain := split_part(v_email, '@', 2);

  select c.id into v_campus_id
  from public.campus c
  where v_domain = any (c.domains)
  order by c.id
  limit 1;

  if v_campus_id is null then
    raise exception 'a campus email is required (no campus lists the domain "%")', v_domain
      using errcode = 'check_violation';
  end if;

  insert into public.person (id, campus_id, email, first_name)
  values (new.id, v_campus_id, v_email, null)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
