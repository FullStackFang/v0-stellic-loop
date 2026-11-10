-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- A handle a member chooses so teammates can tag them (@team/handle).
-- Opt-in: no row means the person cannot be tagged. A handle identifies a
-- person inside one team; it confers no authority and reveals no roster.
create table emba_member_handle (
 org_id uuid not null,
 person_id uuid not null,
 handle text not null check(handle ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
 primary key(org_id,person_id),
 unique(org_id,handle),
 foreign key(org_id,person_id) references emba_membership(org_id,person_id) on delete cascade
);
alter table emba_member_handle enable row level security;
revoke all on emba_member_handle from public,anon,authenticated;

reset lock_timeout;
