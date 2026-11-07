-- Explicit classification only: existing public records remain public.
-- RESTRICT prevents deleting a loop from silently making its records public.
alter table board add column pilot_loop_id uuid references emba_loop(id) on delete restrict;
alter table trip_workspace add column pilot_loop_id uuid references emba_loop(id) on delete restrict;
create index board_pilot_loop on board(pilot_loop_id) where pilot_loop_id is not null;
create index trip_workspace_pilot_loop on trip_workspace(pilot_loop_id) where pilot_loop_id is not null;
