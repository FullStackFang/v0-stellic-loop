-- Existing leases retain their original actions; group writes need a new grant.
alter table emba_lease drop constraint emba_lease_actions_check;
alter table emba_lease add constraint emba_lease_actions_check check (
 cardinality(actions)>0 and actions <@ array['memory:read','memory:write','plan:read','activity:write','group-memory:write']
 and (not ('group-memory:write'=any(actions)) or loop_id is not null)
);
alter table emba_confirmation drop constraint emba_confirmation_action_check;
alter table emba_confirmation add constraint emba_confirmation_action_check check (
 action in ('commitment','identity_disclosure','publication','group_memory_publication')
);
