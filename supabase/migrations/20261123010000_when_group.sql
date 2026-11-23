-- Loopd When: a poll started from a group belongs to that group. A poll made on its own has no row here.
-- Anyone with the poll's address may still answer it; the group's page lists its polls to those who can read the group.
set lock_timeout = '5s';

create table when_poll_group (
 poll_id text primary key references when_poll(id) on delete cascade,
 org_id uuid not null,
 loop_id uuid not null,
 foreign key(org_id,loop_id) references emba_loop(org_id,id) on delete cascade
);
create index when_poll_group_loop on when_poll_group(org_id,loop_id);

alter table when_poll_group enable row level security;
revoke all on when_poll_group from public,anon,authenticated;

reset lock_timeout;
