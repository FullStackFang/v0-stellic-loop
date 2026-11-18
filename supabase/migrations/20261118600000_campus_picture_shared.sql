-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- The admin manages every animal (/c/admin, "Animals"): each is core (offered to everyone), premium (offered to people
-- who subscribed) or off (offered to nobody). lib/campus/animal-tiers.ts.
--  * campus_animal holds where a picture shipped with the app stands, by its number, when the admin has moved it.
--    With no row it is as lib/campus/animals.ts has it: the first 36 core, the rest premium.
--  * campus_custom_picture.tier does the same for an animal a person had made. Null: it is its maker's alone.
--  * A person may now use a made animal that is not theirs, so which one they use is kept on their face:
--    campus_face.picture, read before campus_custom_face.token. Deleting a picture clears it from every face.
-- Apply after 20261118500000_campus_custom_picture.sql and BEFORE the code that reads these is deployed. The code from
-- before keeps working once this is applied. Safe to run twice. Rollback: drop campus_animal and the two columns,
-- after putting the old code back.
alter table campus_custom_picture add column if not exists tier text check(tier in ('core','premium'));
alter table campus_custom_picture drop column if exists shared_at;
alter table campus_face add column if not exists picture uuid references campus_custom_picture(token) on delete set null;
create table if not exists campus_animal (
 face smallint primary key check(face>=0),
 tier text not null check(tier in ('core','premium','off'))
);
alter table campus_animal enable row level security;
revoke all on campus_animal from public,anon,authenticated;

reset lock_timeout;
