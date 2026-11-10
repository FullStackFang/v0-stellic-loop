-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Events are named labels under a team (an addressed group). They are not
-- nested groups: access is decided at the team, so a consent for the team
-- covers its events and no lease is inherited.
create table emba_team_event (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
 -- One visible line. The service normalises and validates; this is the floor:
 -- no control, line-separator, bidirectional or zero-width characters.
 name text not null check(char_length(name) between 1 and 80
  and name !~ '[[:cntrl:]\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]'),
 created_by uuid references person(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 archived_at timestamptz,
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);
create index emba_team_event_team on emba_team_event(org_id,loop_id) where archived_at is null;
create unique index emba_team_event_slug on emba_team_event(org_id,slug) where archived_at is null;

-- One namespace per organization for everything written @namespace/name:
-- group slugs, event slugs and person handles. The namespace's own name is
-- held too, so the short form @namespace can only mean the team. The primary
-- key is the rule; the triggers below keep it in step with the source tables, so a
-- service bug or two simultaneous writers cannot make a name mean two things.
create table emba_team_name (
 org_id uuid not null references emba_organization(id) on delete cascade,
 name text not null,
 kind text not null check(kind in ('namespace','group','event','person')),
 primary key(org_id,name)
);
insert into emba_team_name(org_id,name,kind) select org_id,namespace,'namespace' from emba_group_namespace;
insert into emba_team_name(org_id,name,kind) select org_id,slug,'group' from emba_group_address;
insert into emba_team_name(org_id,name,kind) select org_id,handle,'person' from emba_member_handle;

-- tg_argv[0] is the kind, tg_argv[1] the column holding the name. A row with
-- archived_at set holds no name. Group addresses are never deleted or
-- renamed (see emba_guard_group_address), so a group name is never released.
create function emba_team_name_sync() returns trigger language plpgsql set search_path=public as $$
declare o jsonb; n jsonb; col text := tg_argv[1];
begin
 if tg_op<>'INSERT' then o := to_jsonb(old); end if;
 if tg_op<>'DELETE' then n := to_jsonb(new); end if;
 if o is not null and o->>'archived_at' is null
    and (n is null or n->>'archived_at' is not null or n->>col is distinct from o->>col
     or n->>'org_id' is distinct from o->>'org_id') then
  delete from emba_team_name where org_id=(o->>'org_id')::uuid and name=o->>col and kind=tg_argv[0];
 end if;
 if n is not null and n->>'archived_at' is null
    and (o is null or o->>'archived_at' is not null or n->>col is distinct from o->>col
     or n->>'org_id' is distinct from o->>'org_id') then
  insert into emba_team_name(org_id,name,kind) values((n->>'org_id')::uuid,n->>col,tg_argv[0]);
 end if;
 return null;
end $$;
-- A truncated source table holds no names.
create function emba_team_name_clear() returns trigger language plpgsql set search_path=public as $$
begin
 delete from emba_team_name where kind=tg_argv[0];
 return null;
end $$;
create trigger emba_group_namespace_name after insert on emba_group_namespace
 for each row execute function emba_team_name_sync('namespace','namespace');
create trigger emba_group_address_name after insert on emba_group_address
 for each row execute function emba_team_name_sync('group','slug');
create trigger emba_member_handle_name after insert or update or delete on emba_member_handle
 for each row execute function emba_team_name_sync('person','handle');
create trigger emba_team_event_name after insert or update or delete on emba_team_event
 for each row execute function emba_team_name_sync('event','slug');

create trigger emba_group_namespace_name_clear after truncate on emba_group_namespace
 for each statement execute function emba_team_name_clear('namespace');
create trigger emba_group_address_name_clear after truncate on emba_group_address
 for each statement execute function emba_team_name_clear('group');
create trigger emba_member_handle_name_clear after truncate on emba_member_handle
 for each statement execute function emba_team_name_clear('person');
create trigger emba_team_event_name_clear after truncate on emba_team_event
 for each statement execute function emba_team_name_clear('event');

alter table emba_team_event enable row level security;
alter table emba_team_name enable row level security;
revoke all on emba_team_event,emba_team_name from public,anon,authenticated;
revoke all on function emba_team_name_sync(),emba_team_name_clear() from public,anon,authenticated;

reset lock_timeout;
