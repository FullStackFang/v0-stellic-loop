-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Premium faces. A face may now also be a premium animal, public/animals/37.png on, numbered from 36
-- (lib/campus/animals.ts, PREMIUM), or -2 for the animal a person had made from their own photo. The upper bound
-- leaves room, so adding a picture needs no migration; the app refuses a number it has no picture for.
-- Apply after 20261118300000_campus_tag.sql. Until then, picking a premium animal or making one's own is refused and
-- the person keeps the face they had. Rollback: drop campus_custom_face, move any face that is -2 or above 35 to
-- another, and put the old check back (between -1 and 35).
alter table campus_face drop constraint campus_face_face_check;
alter table campus_face add constraint campus_face_face_check check(face between -2 and 999);

-- The animal a person had made, and that they asked to subscribe for it. There is no payment yet: asking is recorded
-- (email, asked_at) to see who would pay, and the picture is made free. `image` is a 192px PNG, as the set's are; it is
-- served at /animals/custom/<token>, and the token changes with every new picture. `makes` counts pictures made.
create table campus_custom_face (
 person_id uuid primary key references person(id) on delete cascade,
 token uuid not null default gen_random_uuid() unique,
 image bytea,
 makes smallint not null default 0,
 email text not null,
 asked_at timestamptz not null default now(),
 made_at timestamptz
);
alter table campus_custom_face enable row level security;
revoke all on campus_custom_face from public,anon,authenticated;

reset lock_timeout;
