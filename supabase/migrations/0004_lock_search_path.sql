-- Pin lock_proposal's search_path so a caller's path cannot redirect the
-- unqualified table names inside it (Supabase advisor 0011).
alter function public.lock_proposal(uuid, uuid) set search_path = public;
