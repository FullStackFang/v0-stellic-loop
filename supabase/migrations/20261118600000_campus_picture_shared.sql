-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- The admin manages the animals people had made (/c/admin, "Premium"). One the admin offers to everyone has shared_at
-- set and is shown in every person's picker with the standard animals. Anyone may then use it, so which made picture a
-- person uses is now kept on their face: campus_face.picture, read before campus_custom_face.token. Deleting a picture
-- clears it from every face that used it, and those people are shown their own animal again.
-- Apply after 20261118500000_campus_custom_picture.sql and BEFORE the code that reads these columns is deployed. The
-- code from before keeps working once this is applied. Rollback: drop the two columns, after putting the old code back.
alter table campus_custom_picture add column shared_at timestamptz;
alter table campus_face add column picture uuid references campus_custom_picture(token) on delete set null;

reset lock_timeout;
