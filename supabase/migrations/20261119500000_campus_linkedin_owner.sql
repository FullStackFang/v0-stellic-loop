-- Run by hand on a live database, after 20261119400000_campus_linkedin_approval.sql: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A person can sign in with LinkedIn, or connect LinkedIn to the account they signed in with ("Continue with
-- LinkedIn"). That proves a LinkedIn account is theirs, which pasting a profile's address does not. `owner_name` is the
-- name on that LinkedIn account when they sent their profile for a check, for the admin to hold against the profile;
-- null for someone who only pasted an address.
-- Until this is applied everything works as before, and the admin is not shown whose LinkedIn account is proven.
-- Rollback: alter table campus_linkedin drop column owner_name.
alter table campus_linkedin add column owner_name text;

reset lock_timeout;
