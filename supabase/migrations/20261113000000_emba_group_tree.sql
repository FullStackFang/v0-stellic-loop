-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- A group inside a group has its own name. A root keeps the name and
-- description of its organization, so both stay null there: one place holds
-- each name. An inner loop made before this migration has no name and reads
-- as its organization does.
alter table emba_loop add column name text check(char_length(name) between 1 and 200
 and name !~ '[[:cntrl:]\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]');
alter table emba_loop add column description text check(char_length(description) <= 1000);
alter table emba_loop add constraint emba_loop_root_name check(parent_id is not null or (name is null and description is null));

reset lock_timeout;
