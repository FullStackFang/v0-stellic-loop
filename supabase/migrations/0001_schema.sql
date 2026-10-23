-- Quorum board, slice 1. All access is server-side (see 0003_grants.sql).

create type proposal_status as enum ('open', 'on', 'closed');
create type answer as enum ('in', 'out', 'maybe');
create type detail_kind as enum ('where', 'link', 'note');
create type source as enum (
  'group_link', 'proposal_link', 'digest_link', 'on_text', 'one_more_text',
  'maybe_nudge', 'fork', 'seed', 'direct'
);
create type event_type as enum (
  'proposal_posted', 'response', 'threshold_reached', 'proposal_idled',
  'proposal_reopened', 'proposal_closed', 'detail_added', 'person_added',
  'share_minted', 'fork_created', 'text_sent'
);

create table board (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tz text not null default 'America/New_York',
  window_start date not null,
  window_end date not null,
  parent_board_id uuid references board (id),
  created_at timestamptz not null default now(),
  check (window_end >= window_start)
);

create table person (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  name text not null check (length(btrim(name)) > 0),
  show_name boolean not null default true,
  sms_opt_out boolean not null default false,
  created_at timestamptz not null default now()
);

create table proposal (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references board (id),
  -- null only for seeded proposals, which have no poster
  poster_id uuid references person (id),
  title text not null check (length(btrim(title)) > 0),
  icon text not null default 'confetti',
  detail text,
  cost_text text,
  time_text text,
  needs_day boolean not null default true,
  min_count int check (min_count is null or min_count >= 1),
  deadline date,
  status proposal_status not null default 'open',
  on_day date,
  on_at timestamptz,
  locked_by uuid references person (id),
  closed_at timestamptz,
  version_of uuid references proposal (id),
  created_at timestamptz not null default now(),
  check (status <> 'on' or on_at is not null)
);
create index proposal_board_idx on proposal (board_id);

create table board_person (
  board_id uuid not null references board (id),
  person_id uuid not null references person (id),
  joined_via source not null,
  via_proposal_id uuid references proposal (id),
  joined_at timestamptz not null default now(),
  primary key (board_id, person_id)
);

create table proposal_detail (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposal (id),
  kind detail_kind not null,
  text text not null check (length(btrim(text)) > 0),
  url text,
  added_by uuid references person (id),
  added_at timestamptz not null default now()
);
create index proposal_detail_proposal_idx on proposal_detail (proposal_id);

create table response (
  proposal_id uuid not null references proposal (id),
  person_id uuid not null references person (id),
  answer answer not null,
  days date[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (proposal_id, person_id)
);
create index response_person_idx on response (person_id);

create table free_day (
  board_id uuid not null references board (id),
  person_id uuid not null references person (id),
  day date not null,
  primary key (board_id, person_id, day)
);

create table share (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposal (id),
  token text not null unique,
  sharer_id uuid references person (id),
  created_at timestamptz not null default now()
);

-- One live code per phone. `pending` is the action to replay once the code is
-- verified (the answer or post that triggered it).
create table otp_code (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  pending jsonb,
  created_at timestamptz not null default now()
);

create table magic_token (
  token_hash text primary key,
  person_id uuid not null references person (id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table event (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  board_id uuid not null references board (id),
  proposal_id uuid references proposal (id),
  person_id uuid references person (id),
  type event_type not null,
  source source not null,
  share_id uuid references share (id),
  data jsonb not null default '{}'
);
create index event_board_at_idx on event (board_id, at);
create unique index event_threshold_once on event (proposal_id) where type = 'threshold_reached';
create unique index event_idled_once on event (proposal_id) where type = 'proposal_idled';
