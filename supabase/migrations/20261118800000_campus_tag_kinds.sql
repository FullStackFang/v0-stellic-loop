-- An @ is any tag (openspec loop-campus-tags): a place, an activity, an event. A plan carries up to four. Each tag has
-- a kind nobody is asked for, and tags that mean the same thing point at one lead tag.
alter table campus_tag
 add column kind text check(kind in('place','activity','event','other')),
 add column same_as uuid references campus_tag(id) on delete set null,
 add column sorted_at timestamptz,
 add column by_hand boolean not null default false,
 add constraint campus_tag_not_itself check(same_as<>id);
create index campus_tag_same_as on campus_tag(same_as) where same_as is not null;

-- A plan's tags, in the order typed. campus_listing.tag_id stays, and means the plan's first tag of kind place.
-- The index on that column had the name the table needs.
alter index campus_listing_tag rename to campus_listing_tag_id;
create table campus_listing_tag (
 listing_id uuid not null references campus_listing(id) on delete cascade,
 tag_id uuid not null references campus_tag(id) on delete cascade,
 position smallint not null check(position between 0 and 3),
 primary key(listing_id,tag_id),
 unique(listing_id,position)
);
create index campus_listing_tag_tag on campus_listing_tag(tag_id);
alter table campus_listing_tag enable row level security;
revoke all on campus_listing_tag from public,anon,authenticated;

-- Every tag so far was made as a place.
insert into campus_listing_tag(listing_id,tag_id,position) select id,tag_id,0 from campus_listing where tag_id is not null;
update campus_tag set kind='place',sorted_at=now();
