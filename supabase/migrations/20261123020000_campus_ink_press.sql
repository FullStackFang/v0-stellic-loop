-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A press of "Get Ink" or "Get Ink+" by someone not signed in, who gave no email (openspec loop-ink-field-test): the
-- plan, the button and the time are kept in campus_ink_waitlist with the email empty, and the browser's visitor number
-- (the lp_v cookie, as on site_open) so a press can be read beside the pages that browser opened. A row with no email
-- is never claimed and gives nobody a plan.
-- Additive. Apply after 20261123010000_when_group.sql. The code works before this is applied: such a press is simply
-- not kept. Rollback: put the old code back; to undo fully, delete from campus_ink_waitlist where email is null, set
-- email not null again, and drop the column visitor.
alter table campus_ink_waitlist alter column email drop not null;
alter table campus_ink_waitlist add column if not exists visitor text check(visitor ~ '^[0-9a-f]{32}$');

reset lock_timeout;
