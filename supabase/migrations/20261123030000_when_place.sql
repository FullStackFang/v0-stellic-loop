-- Loopd When: a poll may say where the meeting is. Free words, up to 120 characters; null when it does not say.
set lock_timeout = '5s';
alter table when_poll add column place text check(char_length(place) between 1 and 120);
reset lock_timeout;
