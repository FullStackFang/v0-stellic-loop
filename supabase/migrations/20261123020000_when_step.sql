-- Loopd When: squares smaller than an hour. A poll for a meeting under an hour is painted in halves or quarters of an
-- hour (lib/when/slots.ts, stepOf). Polls already made stay by the hour. An answer may hold four times as many squares.
set lock_timeout = '5s';
alter table when_poll add column step_min smallint not null default 60 check(step_min in (15,30,60));
alter table when_answer drop constraint when_answer_slots_check;
alter table when_answer add constraint when_answer_slots_check check(cardinality(slots)<=1344);
reset lock_timeout;
