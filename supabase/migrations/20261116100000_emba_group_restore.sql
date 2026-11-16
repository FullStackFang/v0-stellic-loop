-- An archived group can be restored (loop-organize-and-fix, design D5).
-- The guard on group addresses refused every change to retired_at once it was set. It now lets retired_at be
-- cleared, and refuses everything else it refused before: deleting an address, changing a namespace, changing
-- what an address names or how it is spelled, and moving a set retired_at to another moment.
-- A restored name cannot collide: unique(namespace,slug) covers retired rows too, so a name is never released.
set lock_timeout='5s';

create or replace function emba_guard_group_address() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' or tg_table_name='emba_group_namespace' then
  raise exception 'Group addresses are immutable' using errcode='23514';
 end if;
 if row(new.org_id,new.loop_id,new.namespace,new.slug) is distinct from row(old.org_id,old.loop_id,old.namespace,old.slug)
    or (old.retired_at is not null and new.retired_at is not null and new.retired_at is distinct from old.retired_at) then
  raise exception 'Group addresses are immutable' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function emba_guard_group_address() from public,anon,authenticated;

reset lock_timeout;
