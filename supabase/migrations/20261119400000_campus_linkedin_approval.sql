-- Run by hand on a live database, after 20261119300000_campus_linkedin.sql: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A person whose email is at no school is not let in by their LinkedIn profile alone: the admin looks at the profile
-- and approves it first (/c/admin, "LinkedIn"). `approved_at` is null while they wait; their `schools` are then every
-- school they ticked, and they are placed at the first of them when approved. A person who is at a school by their
-- email is approved as they save. Rows from before this rule were let in already, and stay in.
-- Until this is applied nobody's profile unlocks anything, and pressing "Unlock" says it did not go through.
-- Rollback: alter table campus_linkedin drop column approved_at.
alter table campus_linkedin add column approved_at timestamptz;
update campus_linkedin set approved_at=added_at;

reset lock_timeout;
