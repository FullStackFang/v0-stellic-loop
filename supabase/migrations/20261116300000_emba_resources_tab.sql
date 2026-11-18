-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Resources tab (change loop-resources-tab). Additive: a team's links become their own thing, apart from Outputs, and
-- every link and every text can carry tags that an assistant works out. Apply after 20261116200000_emba_invitation_name.sql,
-- as one transaction. Rollback is dropping what this file adds.
--
-- "One visible line" means the same as in 20261110010000_emba_team_records.sql.
create function emba_plain_line(value text,most integer) returns boolean language sql immutable set search_path=public as $$
 select value is null or (char_length(value) between 1 and most and value=btrim(value)
  and value !~ '[\u0001-\u001F\u007F- ­؜ᅟᅠ᠎ -‏ -  -⁯　ㅤ﻿ﾠ\U000E0000-\U000E007F]')
$$;

-- 1. Links (design D3). One row per link a member (or an assistant for them) added. Loop keeps the address, never what it points at.
-- The tags are written by an assistant; none of them is asked of a person on the site. `described_at` is null until some are given,
-- and they are then given once: an assistant fills in a link that has none, and nothing here is rewritten by it afterwards.
create table emba_team_link (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 url text not null check(url ~ '^https://[^[:space:]]+$' and char_length(url)<=500),
 host text not null check(char_length(host) between 3 and 253),
 name text not null check(emba_plain_line(name,120)),
 -- Null once the person who added it has left. An assistant's name is stored with what it saved; null when it was saved on the site.
 added_by uuid references person(id) on delete set null,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 created_at timestamptz not null default clock_timestamp(),
 removed_at timestamptz,
 kind text check(emba_plain_line(kind,40)),
 about text check(emba_plain_line(about,120)),
 audience text check(emba_plain_line(audience,120)),
 found_on date,
 summary text check(emba_plain_line(summary,240)),
 described_at timestamptz,
 described_by uuid references person(id) on delete set null,
 described_via text check(described_via ~ '^[ -~]{1,200}$'),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id),
 constraint emba_team_link_tags_are_dated check(described_at is not null or (kind is null and about is null and audience is null and found_on is null and summary is null))
);
-- A team lists an address once. Adding it again returns the row that is there.
create unique index emba_team_link_live on emba_team_link(org_id,loop_id,url) where removed_at is null;
create index emba_team_link_list on emba_team_link(org_id,loop_id,created_at desc) where removed_at is null;
create index emba_team_link_person on emba_team_link(added_by) where added_by is not null;

-- What was saved stays as it was saved. A link is removed once and not brought back, and its tags are set once.
create function emba_team_link_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE'
    or row(new.id,new.org_id,new.loop_id,new.url,new.host,new.name,new.client_id,new.created_at) is distinct from row(old.id,old.org_id,old.loop_id,old.url,old.host,old.name,old.client_id,old.created_at)
    or (old.removed_at is not null and new.removed_at is distinct from old.removed_at)
    or (old.described_at is not null and row(new.kind,new.about,new.audience,new.found_on,new.summary,new.described_at) is distinct from row(old.kind,old.about,old.audience,old.found_on,old.summary,old.described_at)) then
  raise exception 'A saved link keeps its address and name, is removed once, and is described once' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_link_guard before update or delete on emba_team_link for each row execute function emba_team_link_guard();

-- 2. Texts are the documents that already exist: pasted text, or the words read from a file. They gain the same tags, and the
-- assistant (if any) that saved a version is recorded the way it is for every other write.
alter table emba_document
 add column kind text check(emba_plain_line(kind,40)),
 add column about text check(emba_plain_line(about,120)),
 add column audience text check(emba_plain_line(audience,120)),
 add column found_on date,
 add column summary text check(emba_plain_line(summary,240)),
 add column described_at timestamptz,
 add column described_by uuid references person(id) on delete set null,
 add column described_via text check(described_via ~ '^[ -~]{1,200}$'),
 add constraint emba_document_tags_are_dated check(described_at is not null or (kind is null and about is null and audience is null and found_on is null and summary is null));
alter table emba_document_version
 add column client_id text check(client_id ~ '^[ -~]{1,200}$');

alter table emba_team_link enable row level security;
revoke all on emba_team_link from public,anon,authenticated;
revoke all on function emba_team_link_guard() from public,anon,authenticated;

reset lock_timeout;
