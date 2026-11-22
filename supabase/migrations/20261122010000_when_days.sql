-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Loopd When: two things the one who asked now decides. Whether Saturdays and Sundays are in the poll (polls made
-- before this keep them), and how long the meeting runs; its start may now be a quarter of an hour or more into the
-- hour people picked, which chosen_slot already holds.
-- Apply BEFORE the code that reads it is deployed. Rollback: put the old code back, then drop the two columns.
alter table when_poll
 add column weekends boolean not null default true,
 add column duration_min smallint not null default 60 check(duration_min between 15 and 480);

reset lock_timeout;
