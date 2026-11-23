-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Conga's weekly board (/demo/mockups-conga-board.html, A): each signed-in player's best line on each map, for each week.
-- A week starts on Monday in New York (lib/campus/conga-board.ts works it out in SQL). Only the best of the week is kept;
-- last week's rows simply stop being shown. `face` and `picture` are the animal the best was played as (a place on the
-- game's sheet, or 0 for a made pet at `picture`), `kit` the player's school then, for the tag beside their name.
-- Additive: one new table. Apply after 20261122100000_site_open_visitor.sql. The game works before it is applied: it
-- shows no board. Rollback is dropping the table.
create table conga_best (
 person_id uuid not null references person(id) on delete cascade,
 map text not null check(map ~ '^[a-z0-9-]{1,40}$'),
 week date not null,
 best integer not null check(best between 1 and 2001),
 face smallint not null check(face between 0 and 99),
 picture text check(picture ~ '^/animals/[A-Za-z0-9/._-]{1,160}$'),
 kit text not null check(kit ~ '^[a-z]{1,20}$'),
 at timestamptz not null default now(),
 primary key (person_id, map, week)
);
create index conga_best_board on conga_best(map, week, best desc);
alter table conga_best enable row level security;
revoke all on conga_best from public,anon,authenticated;

reset lock_timeout;
