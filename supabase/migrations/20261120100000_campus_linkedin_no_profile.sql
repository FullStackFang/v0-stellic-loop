-- Run by hand on a live database, after 20261119500000_campus_linkedin_owner.sql: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Someone who signed in with LinkedIn is no longer asked for the address of their profile: LinkedIn does not give it,
-- and asking for it after they signed in with LinkedIn read as asking twice. Their row then has no `profile`, and the
-- admin looks them up by the name on the LinkedIn account (owner_name). Someone who did not sign in with LinkedIn still
-- pastes the address. The unique rule and the check on its spelling stay for the rows that have one.
-- Until this is applied the page keeps asking for the address, as before.
-- Rollback: delete the rows with no profile, then alter table campus_linkedin alter column profile set not null.
alter table campus_linkedin alter column profile drop not null;

reset lock_timeout;
