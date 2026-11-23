-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- A page opened by someone not signed in was kept with nobody on it, so such visitors could be added up as pages but
-- not as people. Each browser now carries a random number in a cookie (lp_v, set by app/c/seen/route.ts), kept here on
-- every page it opens. The admin's Activity section counts a person by their account, else by this number.
-- The code works before this is applied: pages are counted as before, with no visitor on them.
-- Rollback: alter table site_open drop column visitor.
alter table site_open add column visitor text check(visitor ~ '^[0-9a-f]{32}$');

reset lock_timeout;
