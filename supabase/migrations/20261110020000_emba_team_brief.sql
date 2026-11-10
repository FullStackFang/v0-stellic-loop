-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- The curated brief of a team (design D9). An owner or organizer writes it on
-- the site; every save is a new version and earlier versions are kept. The
-- team's timezone lives on emba_team_state.
create table emba_team_brief (
 org_id uuid not null,
 loop_id uuid not null,
 version integer not null check(version>0),
 -- Plain lines. No control characters other than the line break.
 body text not null check(char_length(body)<=4000 and body !~ '[\x01-\x09\x0B-\x1F\x7F]'),
 deadline date,
 edited_by uuid references person(id) on delete set null,
 at timestamptz not null default clock_timestamp(),
 primary key(org_id,loop_id,version),
 foreign key(org_id,loop_id) references emba_team_state(org_id,loop_id)
);
create index emba_team_brief_editor on emba_team_brief(edited_by);

-- A stored version is history: only the editor link may be removed, on account deletion.
create function emba_team_brief_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.org_id,new.loop_id,new.version,new.body,new.deadline,new.at) is distinct from row(old.org_id,old.loop_id,old.version,old.body,old.deadline,old.at)
    or (new.edited_by is not null and new.edited_by is distinct from old.edited_by) then
  raise exception 'A stored brief version is not edited' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_brief_guard before update on emba_team_brief for each row execute function emba_team_brief_guard();

alter table emba_team_brief enable row level security;
revoke all on emba_team_brief from public,anon,authenticated;
revoke all on function emba_team_brief_guard() from public,anon,authenticated;

reset lock_timeout;
