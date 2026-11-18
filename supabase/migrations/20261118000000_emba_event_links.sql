-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Event links and nearby events (change loop-group-event-links). Additive:
-- an event can come from a pasted link or from a calendar feed and follow it;
-- a group can hold calendar feeds, and the items read from them. Apply after
-- 20261117000000_campus.sql, as one transaction. Rollback is dropping what
-- this file adds.
--
-- "One visible line" means the same as in 20261110010000_emba_team_records.sql.

-- 1. Where an event came from (design D1). `source_follow` is on while Loop
-- keeps the event in step with its source; a hand change turns it off.
-- `source_gone_at` is set when the source no longer lists the event. Loop
-- never archives an event because of what its source says.
alter table emba_team_event
 add column source text check(source in ('link','feed')),
 add column source_follow boolean not null default false,
 add column source_read_at timestamptz,
 add column source_gone_at timestamptz,
 add constraint emba_team_event_source_is_fixed check(source is null or state='fixed'),
 add constraint emba_team_event_follow_has_source check(source is not null or (not source_follow and source_read_at is null and source_gone_at is null)),
 add constraint emba_team_event_link_has_url check(source<>'link' or url is not null);
-- One event per link in a group, among those that are not archived.
create unique index emba_team_event_link on emba_team_event(org_id,loop_id,url) where source='link' and archived_at is null;
create index emba_team_event_followed on emba_team_event(source_read_at) where source='link' and source_follow and archived_at is null;

-- 2. A group's calendar feeds (design D7, D9). Owners and organizers add them
-- on the site. `slot` makes "at most 10 per group" a rule of the table.
create table emba_team_feed (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 slot smallint not null check(slot between 1 and 10),
 name text not null check(char_length(name) between 1 and 80 and name=btrim(name) and name !~ '[\u0001-\u001F\u007F- ­؜ᅟᅠ᠎ -‏ -  -⁯　ㅤ﻿ﾠ\U000E0000-\U000E007F]'),
 -- Same rule as an event's link.
 url text not null check(char_length(url)<=500
  and url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(/[]A-Za-z0-9._~:/?#@!$&''()*+,;=%[-]*)?$'
  and url !~ '^https://([^/]*[.])?xn--'),
 is_on boolean not null default true,
 added_by uuid references person(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 last_read_at timestamptz,
 last_ok boolean,
 -- Loop's own words about the last read. Never text from the response.
 last_result text check(last_result is null or char_length(last_result)<=300),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id),
 unique(org_id,loop_id,slot),
 unique(org_id,loop_id,url),
 unique(id,org_id,loop_id)
);

-- 3. What the feeds hold in the next 14 days. A nearby item is not a group
-- event: it enters no change sequence and counts toward no limit. `code` is
-- how an assistant names one. `event_id` is the group event it became.
create table emba_team_nearby (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 feed_id uuid not null,
 item_id text not null check(char_length(item_id) between 1 and 500),
 code text not null default substr(replace(gen_random_uuid()::text,'-',''),1,8) check(code ~ '^[0-9a-f]{8}$'),
 title text not null check(char_length(title) between 1 and 80 and title=btrim(title) and title !~ '[\u0001-\u001F\u007F- ­؜ᅟᅠ᠎ -‏ -  -⁯　ㅤ﻿ﾠ\U000E0000-\U000E007F]'),
 starts_at timestamptz not null,
 ends_at timestamptz check(ends_at is null or ends_at>=starts_at),
 place text check(place is null or (char_length(place) between 1 and 120 and place=btrim(place) and place !~ '[\u0001-\u001F\u007F- ­؜ᅟᅠ᠎ -‏ -  -⁯　ㅤ﻿ﾠ\U000E0000-\U000E007F]')),
 host text check(host is null or (char_length(host) between 1 and 120 and host=btrim(host) and host !~ '[\u0001-\u001F\u007F- ­؜ᅟᅠ᠎ -‏ -  -⁯　ㅤ﻿ﾠ\U000E0000-\U000E007F]')),
 event_id uuid references emba_team_event(id) on delete set null,
 left_feed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(feed_id,org_id,loop_id) references emba_team_feed(id,org_id,loop_id) on delete cascade,
 unique(feed_id,item_id),
 unique(org_id,loop_id,code)
);
create index emba_team_nearby_list on emba_team_nearby(org_id,loop_id,starts_at) where event_id is null and left_feed_at is null;
create index emba_team_nearby_event on emba_team_nearby(event_id) where event_id is not null;

alter table emba_team_feed enable row level security;
alter table emba_team_nearby enable row level security;
revoke all on emba_team_feed,emba_team_nearby from public,anon,authenticated;

reset lock_timeout;
