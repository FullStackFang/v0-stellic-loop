create table trip (
  board_id uuid primary key references board(id) on delete cascade,
  owner_id uuid not null references person(id),
  destination text not null default '', start_day date, end_day date,
  check (end_day is null or start_day is null or end_day >= start_day)
);
create table trip_item (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references trip(board_id) on delete cascade,
  owner_id uuid not null references person(id),
  kind text not null check (kind in ('activity', 'arrival', 'stay', 'document')),
  title text not null check (length(title) between 1 and 120),
  day date, time text not null default '', location text not null default '', notes text not null default '',
  shared boolean not null default false,
  filename text, mime text, file_data bytea,
  created_at timestamptz not null default now(),
  check (file_data is null or octet_length(file_data) <= 3145728)
);
create index trip_item_board on trip_item(board_id, day);
create table trip_rsvp (
  item_id uuid not null references trip_item(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  primary key (item_id, person_id)
);
alter table trip enable row level security;
alter table trip_item enable row level security;
alter table trip_rsvp enable row level security;
-- Access uses the existing signed server session, never the public Data API.
revoke all on trip, trip_item, trip_rsvp from anon, authenticated;
