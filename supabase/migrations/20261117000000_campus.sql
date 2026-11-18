-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- The campus screen (change loop-campus-rewards, design D3). Additive: new tables only, nothing existing is altered.
-- Apply after 20261116300000_emba_resources_tab.sql, as one transaction. Rollback is dropping what this file adds.

-- 1. A school. A person whose verified email ends in one of `domains` (a subdomain counts) belongs to it.
-- `list_source` names the feed source whose events make up the one complete view ("All of CampusGroups").
create table campus (
 id uuid primary key default gen_random_uuid(),
 -- /c/admin is the admin page, so no campus may take that address.
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug)<=40 and slug<>'admin'),
 name text not null check(char_length(btrim(name)) between 1 and 80),
 tz text not null check(char_length(tz) between 1 and 64),
 domains text[] not null default '{}',
 list_source text not null default 'CampusGroups' check(char_length(btrim(list_source)) between 1 and 40),
 created_at timestamptz not null default now()
);
insert into campus(slug,name,tz,domains) values
 ('cornell','Cornell','America/New_York','{cornell.edu}'),
 ('columbia','Columbia','America/New_York','{columbia.edu}'),
 ('nyu','NYU','America/New_York','{nyu.edu}'),
 ('cuny','CUNY','America/New_York','{cuny.edu}');

-- 2. One campus per person, set the first time they sign in with a school address.
create table campus_person (
 person_id uuid primary key references person(id) on delete cascade,
 campus_id uuid not null references campus(id) on delete cascade,
 placed_at timestamptz not null default now()
);
create index campus_person_campus on campus_person(campus_id);

-- 3. A calendar feed read every hour. `last_ok` is null until the first read.
create table campus_feed (
 id uuid primary key default gen_random_uuid(),
 campus_id uuid not null references campus(id) on delete cascade,
 source text not null check(char_length(btrim(source)) between 1 and 40),
 url text not null check(url ~ '^https://[^[:space:]]+$' and char_length(url)<=500),
 is_on boolean not null default true,
 last_read_at timestamptz,
 last_ok boolean,
 last_result text check(char_length(last_result)<=300),
 created_at timestamptz not null default now(),
 unique(campus_id,url)
);

-- 4. A named place with coordinates, for the map in an opened event.
create table campus_place (
 id uuid primary key default gen_random_uuid(),
 campus_id uuid not null references campus(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 120),
 other_names text[] not null default '{}',
 lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180)
);
create unique index campus_place_name on campus_place(campus_id,lower(name));

-- 5. An event in the one list: from a feed, posted by a person (`member`), or entered by the admin (`hand`).
-- `hidden_at` is the admin's doing; `left_feed_at` is set when the item is gone from its feed. Either keeps it out of the list.
-- `words_by_hand` marks "good for" words the admin edited, which a later read of the feed must not replace.
create table campus_listing (
 id uuid primary key default gen_random_uuid(),
 campus_id uuid not null references campus(id) on delete cascade,
 origin text not null check(origin in ('feed','member','hand')),
 feed_id uuid references campus_feed(id) on delete set null,
 feed_item_id text check(char_length(feed_item_id) between 1 and 500),
 title text not null check(char_length(btrim(title)) between 1 and 200),
 about text check(char_length(about)<=1000),
 host_name text check(char_length(host_name)<=200),
 place_text text check(char_length(place_text)<=300),
 place_id uuid references campus_place(id) on delete set null,
 starts_at timestamptz not null,
 ends_at timestamptz,
 words text[] not null default '{}' check(cardinality(words)<=12),
 words_by_hand boolean not null default false,
 posted_by uuid references person(id) on delete set null,
 cancelled_at timestamptz,
 hidden_at timestamptz,
 left_feed_at timestamptz,
 created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at),
 check(origin<>'feed' or feed_item_id is not null),
 unique(id,campus_id)
);
create unique index campus_listing_feed_item on campus_listing(feed_id,feed_item_id) where feed_id is not null;
create index campus_listing_week on campus_listing(campus_id,starts_at);
create index campus_listing_poster on campus_listing(posted_by) where posted_by is not null;

-- 6. A reward, entered by the admin. A reward is hidden, never deleted, so what was used keeps what it was.
-- group: rides on one event or on every event of a host name, and names a head count of two or more.
-- building: earned by activity. `outings`: rule_count outings of any kind. `word`: rule_count outings on events carrying
-- rule_word. `weeks`: the same group at the giver's events in each of rule_count weeks.
create table campus_reward (
 id uuid primary key default gen_random_uuid(),
 campus_id uuid not null references campus(id) on delete cascade,
 giver text not null check(char_length(btrim(giver)) between 1 and 120),
 kind text not null check(kind in ('group','building')),
 text_member text check(char_length(btrim(text_member)) between 1 and 200),
 text_regular text check(char_length(btrim(text_regular)) between 1 and 200),
 text_insider text check(char_length(btrim(text_insider)) between 1 and 200),
 listing_id uuid references campus_listing(id) on delete cascade,
 host_name text check(char_length(btrim(host_name)) between 1 and 200),
 head_count integer check(head_count>=2),
 rule text check(rule in ('outings','word','weeks')),
 rule_count integer check(rule_count between 1 and 100),
 rule_word text check(rule_word ~ '^[a-z0-9]{1,30}$'),
 hidden_at timestamptz,
 created_at timestamptz not null default now(),
 check(text_member is not null or text_regular is not null or text_insider is not null),
 check(kind<>'group' or (head_count is not null and (listing_id is null)<>(host_name is null) and rule is null and rule_count is null and rule_word is null)),
 check(kind<>'building' or (rule is not null and rule_count is not null and (rule='word')=(rule_word is not null) and head_count is null and listing_id is null and host_name is null))
);
create index campus_reward_campus on campus_reward(campus_id) where hidden_at is null;

-- 7. One group's visit to one event. `open_to_anyone` is the one outing of a plan a person posted.
create table campus_outing (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references campus_listing(id) on delete cascade,
 token text not null unique check(token ~ '^[A-Za-z0-9_-]{16,64}$'),
 started_by uuid references person(id) on delete set null,
 open_to_anyone boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,listing_id)
);
create unique index campus_outing_open on campus_outing(listing_id) where open_to_anyone;
create index campus_outing_listing on campus_outing(listing_id);

-- 8. Who is in an outing. The listing is repeated here so a person can be in one outing per event and no more.
create table campus_outing_member (
 outing_id uuid not null,
 listing_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 joined_at timestamptz not null default now(),
 registered boolean not null default false,
 checked_in_at timestamptz,
 primary key(outing_id,person_id),
 unique(listing_id,person_id),
 foreign key(outing_id,listing_id) references campus_outing(id,listing_id) on delete cascade
);
create index campus_outing_member_person on campus_outing_member(person_id);

-- 9. An invite from one member of an outing to someone they know. Nothing is sent.
create table campus_invite (
 outing_id uuid not null references campus_outing(id) on delete cascade,
 inviter_id uuid not null references person(id) on delete cascade,
 invitee_id uuid not null references person(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(outing_id,inviter_id,invitee_id),
 check(inviter_id<>invitee_id)
);
create index campus_invite_invitee on campus_invite(invitee_id);

-- 10. A reward marked used: a group reward once per outing, a building reward once per person.
create table campus_reward_use (
 id uuid primary key default gen_random_uuid(),
 reward_id uuid not null references campus_reward(id) on delete cascade,
 person_id uuid references person(id) on delete set null,
 outing_id uuid references campus_outing(id) on delete cascade,
 used_at timestamptz not null default now()
);
create unique index campus_reward_use_outing on campus_reward_use(reward_id,outing_id) where outing_id is not null;
create unique index campus_reward_use_person on campus_reward_use(reward_id,person_id) where outing_id is null;

alter table campus enable row level security;
alter table campus_person enable row level security;
alter table campus_feed enable row level security;
alter table campus_place enable row level security;
alter table campus_listing enable row level security;
alter table campus_reward enable row level security;
alter table campus_outing enable row level security;
alter table campus_outing_member enable row level security;
alter table campus_invite enable row level security;
alter table campus_reward_use enable row level security;
revoke all on campus,campus_person,campus_feed,campus_place,campus_listing,campus_reward,campus_outing,campus_outing_member,campus_invite,campus_reward_use from public,anon,authenticated;

reset lock_timeout;
