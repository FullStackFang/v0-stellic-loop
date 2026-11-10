-- Writer workspaces can be created before an organizer identifies themselves.
alter table trip alter column owner_id drop not null;

create table trip_workspace (
  id uuid primary key default gen_random_uuid(),
  edit_secret_hash text not null,
  board_id uuid unique references trip(board_id) on delete cascade,
  writer text not null default '',
  draft jsonb not null,
  pins jsonb not null default '{}',
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table trip_place (
  id uuid primary key,
  workspace_id uuid not null references trip_workspace(id) on delete cascade,
  position integer not null,
  name text not null default '',
  from_day text not null default '', to_day text not null default '', hotel text not null default ''
);
create table trip_optional (
  id uuid primary key,
  workspace_id uuid not null references trip_workspace(id) on delete cascade,
  position integer not null,
  label text not null default '', date_text text not null default '', cost text not null default '',
  minimum text not null default '', deadline text not null default ''
);
create table trip_document (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references trip_workspace(id) on delete cascade,
  name text not null, mime text not null, file_data bytea not null,
  extracted_text text not null default '', pages integer not null default 0,
  created_at timestamptz not null default now(),
  check (octet_length(file_data) <= 3145728)
);
create index trip_place_workspace on trip_place(workspace_id, position);
create index trip_optional_workspace on trip_optional(workspace_id, position);
create index trip_document_workspace on trip_document(workspace_id);
alter table trip_workspace enable row level security;
alter table trip_place enable row level security;
alter table trip_optional enable row level security;
alter table trip_document enable row level security;
revoke all on trip_workspace, trip_place, trip_optional, trip_document from anon, authenticated;
