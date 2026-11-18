-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Every animal a person had made is kept, where before a new one replaced the last. Each picture is a row here, served
-- at /animals/custom/<token>. campus_custom_face.token now names the one the person is using; its `image` column is no
-- longer read or written and can be dropped once this has been live for a while.
-- Apply after 20261118400000_campus_face_premium.sql and BEFORE the code that reads this table is deployed. The code
-- from before keeps working once this is applied. Rollback: drop campus_custom_picture, after putting the old code back.
create table campus_custom_picture (
 token uuid primary key default gen_random_uuid(),
 person_id uuid not null references person(id) on delete cascade,
 image bytea not null,
 made_at timestamptz not null default now()
);
create index campus_custom_picture_person on campus_custom_picture(person_id,made_at);
alter table campus_custom_picture enable row level security;
revoke all on campus_custom_picture from public,anon,authenticated;

-- The pictures people already have.
insert into campus_custom_picture(token,person_id,image,made_at)
 select token,person_id,image,coalesce(made_at,now()) from campus_custom_face where image is not null
 on conflict(token) do nothing;

reset lock_timeout;
