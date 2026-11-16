-- An invitation can carry the name the inviter knows the person by. On acceptance it becomes the person's name
-- if they have none yet, and their tag in the group is made from it, so a teammate's assistant can name them.
set lock_timeout='5s';

alter table emba_invitation add column recipient_name text
 check (recipient_name is null or (recipient_name = btrim(recipient_name) and length(recipient_name) between 1 and 80));

reset lock_timeout;
