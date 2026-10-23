-- The browser never talks to the database. RLS on, no policies, no grants:
-- a leaked publishable key reads nothing.
do $$
declare t text;
begin
  foreach t in array array[
    'board', 'person', 'board_person', 'proposal', 'proposal_detail', 'response',
    'free_day', 'share', 'otp_code', 'magic_token', 'event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on function public.lock_proposal(uuid, uuid) from public, anon, authenticated;
