-- Addresses identify existing cohorts; they confer no authority or affiliation.
create table emba_group_namespace (
 org_id uuid primary key references emba_organization(id),
 namespace text not null unique check(namespace ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
 unique(org_id,namespace)
);
create table emba_group_address (
 org_id uuid not null,
 loop_id uuid not null,
 namespace text not null,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
 retired_at timestamptz,
 primary key(org_id,loop_id),
 unique(namespace,slug),
 foreign key(org_id,namespace) references emba_group_namespace(org_id,namespace),
 foreign key(org_id,loop_id) references emba_loop(org_id,id)
);
create index emba_group_address_slug on emba_group_address(slug) where retired_at is null;
-- Never release a claimed name through deletion, reassignment or reactivation.
create function emba_guard_group_address() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' or tg_table_name='emba_group_namespace' then
  raise exception 'Group addresses are immutable' using errcode='23514';
 end if;
 if row(new.org_id,new.loop_id,new.namespace,new.slug) is distinct from row(old.org_id,old.loop_id,old.namespace,old.slug)
    or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
  raise exception 'Group addresses are immutable' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_group_namespace_immutable before update or delete on emba_group_namespace for each row execute function emba_guard_group_address();
create trigger emba_group_address_immutable before update or delete on emba_group_address for each row execute function emba_guard_group_address();
alter table emba_group_namespace enable row level security;
alter table emba_group_address enable row level security;
revoke all on emba_group_namespace,emba_group_address from public,anon,authenticated;
revoke all on function emba_guard_group_address() from public,anon,authenticated;
