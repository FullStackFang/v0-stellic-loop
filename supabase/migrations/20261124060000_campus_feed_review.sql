-- Feed events reviewed by hand before they show (lib/campus/import.ts, app/c/admin). A feed with `review` on brings each
-- new event in hidden and waiting; the admin reads it, pins its place, then shows or hides it. A place set by hand stays
-- when the feed is read again. Additive and safe to run twice. Rollback: update campus_feed set review=false; the
-- columns can stay.
set lock_timeout = '5s';
begin;

alter table campus_feed add column if not exists review boolean not null default false;
alter table campus_listing add column if not exists waiting boolean not null default false;
alter table campus_listing add column if not exists place_by_hand boolean not null default false;

-- To start, every feed is reviewed, and what the feeds that are on already brought in for the days ahead waits too.
update campus_feed set review=true where not review;
update campus_listing set waiting=true, hidden_at=now()
  where feed_id in (select id from campus_feed where is_on) and hidden_at is null and not waiting and cancelled_at is null
    and left_feed_at is null and coalesce(ends_at, starts_at+interval '2 hours')>now();

commit;
