-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- What the admin calls a picture, and the words the picker finds it by (/c/admin, "Animals").
--  * campus_animal_name holds them for a picture shipped with the app, by its number. With no row it is as
--    lib/campus/animals.ts has it: its name there, and the one word of the first 36.
--  * campus_custom_picture.name and .words do the same for an animal a person had made, and go when it is deleted.
-- A null name is the name it shipped with. Null words are the words it shipped with; an empty list is no words.
-- Apply after 20261119500000_campus_custom_picture_large.sql. The code works before this is applied: every picture
-- keeps the name and words it shipped with, and saving a name is refused. Safe to run twice. Rollback: drop
-- campus_animal_name and the two columns.
create table if not exists campus_animal_name (
 face smallint primary key check(face>=0),
 name text check(char_length(name) between 1 and 40),
 words text[]
);
alter table campus_animal_name enable row level security;
revoke all on campus_animal_name from public,anon,authenticated;
alter table campus_custom_picture add column if not exists name text check(char_length(name) between 1 and 40);
alter table campus_custom_picture add column if not exists words text[];

reset lock_timeout;
