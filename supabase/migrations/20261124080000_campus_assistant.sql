-- The going-out assistant tools (openspec campus-assistant-tools). Additive and safe to run twice.
-- Rollback: nothing reads these until they exist; the tables and the column can stay.
set lock_timeout = '5s';
begin;

-- "Interested": a private mark on an event (design D5). Nobody sees it, except that two people who know each other
-- and have both marked the same event are each told about the other. Joining the event removes the mark.
create table if not exists campus_interest (
  listing_id uuid not null references campus_listing(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(listing_id, person_id)
);
create index if not exists campus_interest_person on campus_interest(person_id);
alter table campus_interest enable row level security;
revoke all on campus_interest from public, anon, authenticated;

-- One-use codes behind the Join and Close the loop buttons (design D6). An assistant's call makes one row; only the
-- person's press uses it, once and within ten minutes. `code` is the card's and reaches only the card; `link_code` is
-- the one in /c/tap/<link_code>, which the assistant sees, and only that page accepts it.
create table if not exists campus_tap (
  code text primary key check(char_length(code) between 16 and 64),
  link_code text not null unique check(char_length(link_code) between 16 and 64),
  person_id uuid not null references person(id) on delete cascade,
  action text not null check(action in ('join','close')),
  listing_id uuid not null references campus_listing(id) on delete cascade,
  outing_id uuid references campus_outing(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists campus_tap_person on campus_tap(person_id, created_at);
alter table campus_tap enable row level security;
revoke all on campus_tap from public, anon, authenticated;

-- "Close the loop" (design D8): this outing is finished for this person. It grants nothing.
alter table campus_outing_member add column if not exists closed_at timestamptz;

commit;
reset lock_timeout;
