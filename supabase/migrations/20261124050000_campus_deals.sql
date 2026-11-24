-- Deals entered by the admin (openspec campus-deals). A deal is a schedule: on each weekday it runs, Loopd makes that
-- day's activity (a hand listing) with a group reward carrying the deal's line (lib/campus/deals.ts, design D1, D2).
-- Additive and safe to run twice. Rollback: hide every deal; the table and the column can stay.
set lock_timeout = '5s';
begin;

create table if not exists campus_deal (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campus(id) on delete cascade,
  place_id uuid not null references campus_place(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  -- The one line students see, e.g. "$2 off every drink".
  line text not null check(char_length(btrim(line)) between 1 and 200),
  head_count integer not null check(head_count between 2 and 4),
  -- Weekdays it runs, Sunday = 0.
  days smallint[] not null check(cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  -- Wall-clock hours in the campus's time zone, on one day.
  starts_local time not null,
  ends_local time not null,
  -- What it really is and where it came from. Only the admin page reads it.
  note text check(char_length(note)<=1000),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check(ends_local>starts_local)
);
create index if not exists campus_deal_campus on campus_deal(campus_id) where hidden_at is null;
alter table campus_deal enable row level security;
revoke all on campus_deal from public, anon, authenticated;

-- The day's activity made from a deal. One per deal and start, so making a day twice is harmless.
alter table campus_listing add column if not exists deal_id uuid references campus_deal(id) on delete cascade;
create unique index if not exists campus_listing_deal_day on campus_listing(deal_id, starts_at) where deal_id is not null;

commit;
reset lock_timeout;
