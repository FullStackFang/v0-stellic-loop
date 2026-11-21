-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- The admin may make any animal a school's own (/c/admin, "Animals", School): one shipped with the app or one a
-- person had made. A school's own animal is free to people of that school and offered to nobody else.
--  * campus_animal.school: the school of a picture shipped with the app, kept with tier 'school'. With no row, the
--    nine mascots are their school's as lib/campus/animals.ts (MASCOT) has them.
--  * campus_custom_picture.school: the same for an animal a person had made, kept with tier 'school'.
-- Apply BEFORE the code that reads these is deployed. The code from before keeps working once this is applied.
-- Safe to run twice. Rollback, after putting the old code back: delete the rows with tier 'school', drop the two
-- columns, and put the two checks back as they were.
alter table campus_animal add column if not exists school text;
alter table campus_animal drop constraint if exists campus_animal_tier_check;
alter table campus_animal add constraint campus_animal_tier_check check(tier in ('core','premium','school','off'));
alter table campus_animal drop constraint if exists campus_animal_school_check;
alter table campus_animal add constraint campus_animal_school_check check((tier='school')=(school is not null));
alter table campus_custom_picture add column if not exists school text;
alter table campus_custom_picture drop constraint if exists campus_custom_picture_tier_check;
alter table campus_custom_picture add constraint campus_custom_picture_tier_check check(tier in ('core','premium','school'));
alter table campus_custom_picture drop constraint if exists campus_custom_picture_school_check;
alter table campus_custom_picture add constraint campus_custom_picture_school_check check((tier is not distinct from 'school')=(school is not null));

reset lock_timeout;
