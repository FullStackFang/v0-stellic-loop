-- A member may add days to an open dates ask (the calendar on the in-chat card, or addDays on the answer tool).
-- An added day is an option like any other, remembered with who added it, so that it can be taken away
-- again when that person drops it and nobody else has chosen it. Pick-one and pick-several asks keep
-- their 2 to 10 options, which emba_ask_check enforces when the ask is created.
alter table emba_ask_option drop constraint emba_ask_option_position_check;
alter table emba_ask_option add constraint emba_ask_option_position_check check(position between 1 and 400);
alter table emba_ask_option add column added_by uuid references person(id) on delete set null;
create index emba_ask_option_added_by on emba_ask_option(added_by) where added_by is not null;
