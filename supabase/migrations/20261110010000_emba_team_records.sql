-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction and holding up other writers.
set lock_timeout='5s';

-- Team records: filed outputs, decisions, claims and announcements. They live
-- in their own tables, beside the shared-note store and invisible to its
-- tools. Loop stores only the bounded lines a member or organizer stated; it
-- never fetches a link and never stores a conversation.
--
-- Apply after 20261110000000_emba_team_addressing.sql, as one transaction.
--
-- "One visible line" below means: trimmed, not blank, and free of control,
-- line-separator, bidirectional, zero-width, filler, tag and non-ASCII space
-- characters. The service cleans text first; these checks are the floor, and
-- they name code points explicitly so they do not depend on the database locale.

-- One row per team. Every write locks it first, so writes to a team happen
-- one at a time and the counters below follow commit order.
create table emba_team_state (
 org_id uuid not null,
 loop_id uuid not null,
 record_seq integer not null default 0 check(record_seq>=0),
 decision_seq integer not null default 0 check(decision_seq>=0),
 change_seq bigint not null default 0 check(change_seq>=0),
 -- An IANA zone name; the service accepts only zones the runtime knows.
 timezone text not null default 'UTC' check(char_length(timezone) between 1 and 64 and timezone ~ '^[A-Za-z0-9_+/-]+$'),
 primary key(org_id,loop_id),
 foreign key(org_id,loop_id) references emba_group_address(org_id,loop_id)
);

alter table emba_team_event add unique(id,org_id,loop_id);

create table emba_team_record (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 number integer not null check(number>0),
 kind text not null check(kind in ('output','decision','claim','announcement')),
 state text not null default 'current' check(state in ('current','replaced','superseded','withdrawn')),
 event_id uuid,
 -- Who recorded it. Kept after the person leaves (existing shared-note policy).
 author_id uuid references person(id) on delete set null,
 -- The assistant that recorded it; null when it was done on the site.
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 current_version integer not null check(current_version>0),
 created_at timestamptz not null default clock_timestamp(),
 -- decision
 topic text check(topic ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
 superseded_by uuid,
 -- output
 replaced_by uuid,
 -- claim
 owner_id uuid references person(id) on delete set null,
 due_on date,
 claim_status text check(claim_status in ('proposed','open','done','released','declined')),
 unique(org_id,loop_id,number),
 unique(id,org_id,loop_id),
 unique(id,org_id,loop_id,kind),
 foreign key(org_id,loop_id) references emba_team_state(org_id,loop_id),
 -- A record's event, and the record that superseded or replaced it, belong to
 -- the same team and kind. The last two are deferred so "mark the old one,
 -- insert the new one" needs no false intermediate state.
 foreign key(event_id,org_id,loop_id) references emba_team_event(id,org_id,loop_id),
 foreign key(superseded_by,org_id,loop_id,kind) references emba_team_record(id,org_id,loop_id,kind) deferrable initially deferred,
 foreign key(replaced_by,org_id,loop_id,kind) references emba_team_record(id,org_id,loop_id,kind) deferrable initially deferred,
 constraint emba_team_decision_has_topic check((kind='decision')=(topic is not null)),
 constraint emba_team_claim_has_status check((kind='claim')=(claim_status is not null)),
 constraint emba_team_owner_only_on_claims check(kind='claim' or (owner_id is null and due_on is null)),
 -- A live claim always has an owner.
 constraint emba_team_live_claim_has_owner check(kind<>'claim' or owner_id is not null or claim_status in ('done','released','declined')),
 constraint emba_team_supersede_only_decisions check(kind='decision' or superseded_by is null),
 constraint emba_team_replace_only_outputs check(kind='output' or replaced_by is null),
 constraint emba_team_superseded_needs_link check(state<>'superseded' or superseded_by is not null),
 constraint emba_team_replaced_needs_link check(state<>'replaced' or replaced_by is not null),
 constraint emba_team_superseded_link_state check(superseded_by is null or state in ('superseded','withdrawn')),
 constraint emba_team_replaced_link_state check(replaced_by is null or state in ('replaced','withdrawn')),
 constraint emba_team_not_self_linked check(superseded_by is distinct from id and replaced_by is distinct from id),
 -- A decision is never corrected: it is superseded or withdrawn.
 constraint emba_team_decision_single_version check(kind<>'decision' or current_version=1),
 -- Decisions and announcements belong to the whole team, not to one event.
 constraint emba_team_event_only_on_work check(kind in ('output','claim') or event_id is null)
);
-- At most one current decision per topic in a team.
create unique index emba_team_record_topic on emba_team_record(org_id,loop_id,topic) where kind='decision' and state='current';
-- A record supersedes or replaces at most one other.
create unique index emba_team_record_superseded_by on emba_team_record(superseded_by) where superseded_by is not null;
create unique index emba_team_record_replaced_by on emba_team_record(replaced_by) where replaced_by is not null;
create index emba_team_record_current on emba_team_record(org_id,loop_id,kind,number) where state='current';
create index emba_team_record_owner on emba_team_record(owner_id) where kind='claim';
create index emba_team_record_author on emba_team_record(author_id);
create index emba_team_record_event on emba_team_record(event_id) where event_id is not null;

-- Text lives per version. Withdrawing a record empties every version.
create table emba_team_record_version (
 record_id uuid not null references emba_team_record(id) on delete cascade,
 version integer not null check(version>0),
 title text check(title is null or (char_length(title) between 1 and 120 and title=btrim(title) and title !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 body text check(body is null or (char_length(body) between 1 and 600 and body=btrim(body) and body !~ '[\u0001-\u001F\u007F-\u00A0\u00AD\u061C\u115F\u1160\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFEFF\uFFA0\U000E0000-\U000E007F]')),
 -- A pointer only, never fetched: https, a DNS name with a dot (no IP
 -- literal, no bare host, no punycode), default port, no userinfo, and a
 -- path of URL-safe ASCII. The service stores the normalised form.
 url text check(url is null or (char_length(url)<=500
  and url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(/[]A-Za-z0-9._~:/?#@!$&''()*+,;=%[-]*)?$'
  and url !~ '^https://([^/]*[.])?xn--')),
 withdrawn boolean not null default false,
 edited_by uuid references person(id) on delete set null,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(record_id,version),
 constraint emba_team_version_has_body check(withdrawn or body is not null),
 constraint emba_team_withdrawn_is_empty check(not withdrawn or (title is null and body is null and url is null))
);
create index emba_team_record_version_editor on emba_team_record_version(edited_by);
alter table emba_team_record add foreign key(id,current_version) references emba_team_record_version(record_id,version) deferrable initially deferred;

-- An output flagged as contradicting a decision. 'recheck' means the decision
-- was superseded after the flag was raised.
create table emba_team_conflict (
 org_id uuid not null,
 loop_id uuid not null,
 output_id uuid not null,
 decision_id uuid not null,
 output_kind text not null default 'output' check(output_kind='output'),
 decision_kind text not null default 'decision' check(decision_kind='decision'),
 state text not null default 'flagged' check(state in ('flagged','recheck')),
 flagged_by uuid references person(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(output_id,decision_id),
 foreign key(output_id,org_id,loop_id,output_kind) references emba_team_record(id,org_id,loop_id,kind) on delete cascade,
 foreign key(decision_id,org_id,loop_id,decision_kind) references emba_team_record(id,org_id,loop_id,kind) on delete cascade
);
create index emba_team_conflict_decision on emba_team_conflict(decision_id);

-- Two claims an assistant reported as covering the same work. Kept, not blocked.
create table emba_team_overlap (
 org_id uuid not null,
 loop_id uuid not null,
 claim_a uuid not null,
 claim_b uuid not null,
 kind text not null default 'claim' check(kind='claim'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(claim_a,claim_b),
 constraint emba_team_overlap_ordered check(claim_a<claim_b),
 foreign key(claim_a,org_id,loop_id,kind) references emba_team_record(id,org_id,loop_id,kind) on delete cascade,
 foreign key(claim_b,org_id,loop_id,kind) references emba_team_record(id,org_id,loop_id,kind) on delete cascade
);
create index emba_team_overlap_b on emba_team_overlap(claim_b);

-- People tagged on a record, at most five. A tag sends nothing; it marks a mention.
create table emba_team_record_tag (
 record_id uuid not null references emba_team_record(id) on delete cascade,
 person_id uuid not null references person(id) on delete cascade,
 primary key(record_id,person_id)
);
create index emba_team_record_tag_person on emba_team_record_tag(person_id);

-- Every change to a team's records, numbered under the team lock so that
-- number order is commit order. No record text is stored here.
create table emba_team_change (
 org_id uuid not null,
 loop_id uuid not null,
 seq bigint not null check(seq>0),
 record_id uuid not null,
 action text not null check(action in ('filed','corrected','replaced','logged','superseded','withdrawn','claimed','proposed','confirmed','declined','done','released','announced','flagged','recheck','unflagged','overlap','tagged','untagged')),
 actor_id uuid references person(id) on delete set null,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 -- The person the change concerns, if any: the owner a claim was proposed for, or the person tagged.
 subject_id uuid references person(id) on delete set null,
 -- The other record the change concerns, if any: the decision flagged against, the record that replaced this one.
 other_id uuid,
 at timestamptz not null default clock_timestamp(),
 primary key(org_id,loop_id,seq),
 foreign key(org_id,loop_id) references emba_team_state(org_id,loop_id),
 foreign key(record_id,org_id,loop_id) references emba_team_record(id,org_id,loop_id) on delete cascade,
 foreign key(other_id,org_id,loop_id) references emba_team_record(id,org_id,loop_id) on delete cascade
);
create index emba_team_change_record on emba_team_change(record_id);
create index emba_team_change_actor on emba_team_change(actor_id);
create index emba_team_change_subject on emba_team_change(subject_id) where subject_id is not null;

-- One row per accepted write call: the receipt a retry returns, and part of
-- the hourly write cap. request_hash is a digest, not content.
create table emba_team_operation (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid not null references person(id) on delete cascade,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 operation_id uuid,
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 record_id uuid not null,
 change_seq bigint not null,
 at timestamptz not null default clock_timestamp(),
 foreign key(record_id,org_id,loop_id) references emba_team_record(id,org_id,loop_id) on delete cascade,
 foreign key(org_id,loop_id,change_seq) references emba_team_change(org_id,loop_id,seq) on delete cascade
);
create unique index emba_team_operation_id on emba_team_operation(person_id,operation_id) where operation_id is not null;
create index emba_team_operation_recent on emba_team_operation(org_id,loop_id,person_id,at);
create index emba_team_operation_person on emba_team_operation(person_id);

-- An assistant reported a conflict and nothing was saved. Counted so the
-- founder can see the real rate, and counted toward the hourly cap. Holds a
-- digest for retry detection and no record content.
create table emba_team_conflict_report (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 loop_id uuid not null,
 person_id uuid references person(id) on delete set null,
 client_id text check(client_id ~ '^[ -~]{1,200}$'),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 decisions integer not null check(decisions>0),
 at timestamptz not null default clock_timestamp(),
 foreign key(org_id,loop_id) references emba_team_state(org_id,loop_id)
);
create index emba_team_conflict_report_team on emba_team_conflict_report(org_id,loop_id,person_id,at);
create index emba_team_conflict_report_person on emba_team_conflict_report(person_id);

-- Guards. The services keep these rules; the triggers make a service bug fail
-- loudly instead of storing a contradictory state.

-- Counters only move forward, and a team's row never moves to another team.
create function emba_team_state_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.org_id,new.loop_id) is distinct from row(old.org_id,old.loop_id)
    or new.record_seq<old.record_seq or new.decision_seq<old.decision_seq or new.change_seq<old.change_seq then
  raise exception 'Team counters only move forward' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_state_guard before update on emba_team_state for each row execute function emba_team_state_guard();

-- A record keeps its identity: team, number, kind, topic, event and creation never change, and versions only advance.
create function emba_team_record_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.id,new.org_id,new.loop_id,new.number,new.kind,new.topic,new.event_id,new.created_at)
    is distinct from row(old.id,old.org_id,old.loop_id,old.number,old.kind,old.topic,old.event_id,old.created_at)
    or new.current_version<old.current_version
    or (new.author_id is not null and new.author_id is distinct from old.author_id)
    or new.client_id is distinct from old.client_id then
  raise exception 'A team record keeps its identity' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_record_guard before update on emba_team_record for each row execute function emba_team_record_guard();

-- History is append-only: a stored version changes only by being emptied on
-- withdrawal, or by losing its editor link when that person is removed.
create function emba_team_version_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.record_id,new.version,new.created_at,new.client_id) is distinct from row(old.record_id,old.version,old.created_at,old.client_id)
    or (new.edited_by is not null and new.edited_by is distinct from old.edited_by)
    or (old.withdrawn and not new.withdrawn)
    or (not new.withdrawn and row(new.title,new.body,new.url) is distinct from row(old.title,old.body,old.url)) then
  raise exception 'A stored version is not edited' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_version_guard before update on emba_team_record_version for each row execute function emba_team_version_guard();

create function emba_team_tag_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if (select count(*) from emba_team_record_tag where record_id=new.record_id)>=5 then
  raise exception 'A record carries at most five tags' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_tag_guard before insert on emba_team_record_tag for each row execute function emba_team_tag_guard();

-- A change number is one the team's counter has already issued.
create function emba_team_change_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if new.seq>(select change_seq from emba_team_state where org_id=new.org_id and loop_id=new.loop_id) then
  raise exception 'Change numbers come from the team counter' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_change_guard before insert on emba_team_change for each row execute function emba_team_change_guard();
create function emba_team_change_fixed() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.org_id,new.loop_id,new.seq,new.record_id,new.action,new.other_id,new.at) is distinct from row(old.org_id,old.loop_id,old.seq,old.record_id,old.action,old.other_id,old.at)
    or (new.actor_id is not null and new.actor_id is distinct from old.actor_id)
    or (new.subject_id is not null and new.subject_id is distinct from old.subject_id) then
  raise exception 'The change log is not edited' using errcode='23514';
 end if;
 return new;
end $$;
create trigger emba_team_change_fixed before update on emba_team_change for each row execute function emba_team_change_fixed();

-- Checked at commit for every record touched in the transaction, through
-- either table: the whole record must be consistent with its versions.
create function emba_team_record_check() returns trigger language plpgsql set search_path=public as $$
declare r emba_team_record; target emba_team_record; versions integer; highest integer; live integer; emptied integer; bad integer;
begin
 select * into r from emba_team_record where id=coalesce(to_jsonb(new)->>'record_id',to_jsonb(new)->>'id')::uuid;
 if not found then return null; end if;
 if r.number>(select record_seq from emba_team_state where org_id=r.org_id and loop_id=r.loop_id) then
  raise exception 'Record numbers come from the team counter' using errcode='23514';
 end if;
 select count(*),max(version),count(*) filter(where not withdrawn),count(*) filter(where withdrawn)
  into versions,highest,live,emptied from emba_team_record_version where record_id=r.id;
 if versions<>r.current_version or highest<>r.current_version then
  raise exception 'Record versions are contiguous and end at the current one' using errcode='23514';
 end if;
 -- Withdrawing removes the text and link from every version, and nothing else does.
 if (r.state='withdrawn' and live>0) or (r.state<>'withdrawn' and emptied>0) then
  raise exception 'A withdrawn record holds no text, and only a withdrawn record is emptied' using errcode='23514';
 end if;
 select count(*) into bad from emba_team_record_version v where v.record_id=r.id and not v.withdrawn and case r.kind
  when 'output' then v.title is null or v.url is null
  when 'decision' then v.title is not null or v.url is not null or char_length(v.body)>400
  when 'claim' then v.title is not null or v.url is not null or char_length(v.body)>200
  else v.title is not null or v.url is not null end;
 if bad>0 then
  raise exception 'Version fields do not fit the record kind' using errcode='23514';
 end if;
 -- The successor is a later record; for a decision, on the same topic. This also rules out cycles.
 if r.superseded_by is not null then
  select * into target from emba_team_record where id=r.superseded_by;
  if target.topic is distinct from r.topic or target.number<=r.number then
   raise exception 'A decision is superseded by a later decision on its topic' using errcode='23514';
  end if;
 end if;
 if r.replaced_by is not null then
  select * into target from emba_team_record where id=r.replaced_by;
  if target.number<=r.number then
   raise exception 'An output is replaced by a later output' using errcode='23514';
  end if;
 end if;
 return null;
end $$;
create constraint trigger emba_team_record_consistent after insert or update on emba_team_record
 deferrable initially deferred for each row execute function emba_team_record_check();
create constraint trigger emba_team_record_version_consistent after insert or update on emba_team_record_version
 deferrable initially deferred for each row execute function emba_team_record_check();

alter table emba_team_state enable row level security;
alter table emba_team_record enable row level security;
alter table emba_team_record_version enable row level security;
alter table emba_team_conflict enable row level security;
alter table emba_team_overlap enable row level security;
alter table emba_team_record_tag enable row level security;
alter table emba_team_change enable row level security;
alter table emba_team_operation enable row level security;
alter table emba_team_conflict_report enable row level security;
revoke all on emba_team_state,emba_team_record,emba_team_record_version,emba_team_conflict,emba_team_overlap,
 emba_team_record_tag,emba_team_change,emba_team_operation,emba_team_conflict_report from public,anon,authenticated;
revoke all on function emba_team_state_guard(),emba_team_record_guard(),emba_team_version_guard(),emba_team_tag_guard(),
 emba_team_change_guard(),emba_team_change_fixed(),emba_team_record_check() from public,anon,authenticated;

reset lock_timeout;
