-- loop-on-you (design D1, D3). Two changes to asks.
--
-- 1. A fifth kind, 'done': something to do. It has no options, and a member's
--    answer is a row with no choices and no line.
-- 2. An ask can be given a new closing time by the person who asked or the
--    team's owners and organizers, before or after it closed. A closed ask
--    opens again and keeps its answers.
--
-- Additive: no row changes, and every ask and answer stored today still passes.
-- Lines are kept short so a copy from a narrow window is not broken mid-word,
-- and every step can be run again.

alter table emba_ask drop constraint if exists emba_ask_kind_check;
alter table emba_ask add constraint emba_ask_kind_check
 check(kind in ('one','many','dates','text','done'));

-- The 60 days were counted from when the ask was made, which a reopened ask
-- can outlive. The service keeps the limit, counted from the moment of the change.
alter table emba_ask
 drop constraint if exists emba_ask_closes_within_60_days;
alter table emba_ask
 drop constraint if exists emba_ask_closes_after_created;
alter table emba_ask add constraint emba_ask_closes_after_created
 check(closes_at>created_at);

-- An answer never has both choices and a line. Which of them it must have
-- depends on the ask's kind, so the trigger below decides that.
alter table emba_ask_answer
 drop constraint if exists emba_ask_answer_one_shape;
alter table emba_ask_answer add constraint emba_ask_answer_one_shape
 check(body is null or cardinality(choices)=0);

-- An ask keeps its question, kind and number. Its closing time moves only to a
-- time still ahead, and only that move opens a closed ask again. Its reveal
-- setting is fixed once anyone has answered.
create or replace function emba_ask_guard() returns trigger
language plpgsql set search_path=public as $$
declare moved boolean := new.closes_at is distinct from old.closes_at;
begin
 if row(
      new.id,new.org_id,new.loop_id,new.number,new.client_id,
      new.event_id,new.question,new.kind,new.created_at,
      new.share_token
    ) is distinct from row(
      old.id,old.org_id,old.loop_id,old.number,old.client_id,
      old.event_id,old.question,old.kind,old.created_at,
      old.share_token
    )
    or (new.asker_id is not null
        and new.asker_id is distinct from old.asker_id)
    or (moved and new.closes_at<=clock_timestamp())
    or (old.closed_at is not null
        and new.closed_at is distinct from old.closed_at
        and not (moved and new.closed_at is null))
    or (new.reveal<>old.reveal
        and exists(select 1 from emba_ask_answer where ask_id=new.id))
 then
  raise exception
   'An ask keeps its question, opens again only with a new closing time, and keeps its reveal setting after the first answer'
   using errcode='23514';
 end if;
 return new;
end $$;

create or replace function emba_ask_check() returns trigger
language plpgsql set search_path=public as $$
declare options integer;
begin
 if new.number>(
      select record_seq from emba_team_state
      where org_id=new.org_id and loop_id=new.loop_id) then
  raise exception 'Ask numbers come from the team counter'
   using errcode='23514';
 end if;
 select count(*) into options from emba_ask_option where ask_id=new.id;
 if (new.kind in ('text','done') and options<>0)
    or (new.kind not in ('text','done')
        and options not between 2 and 10) then
  raise exception
   'An ask has 2 to 10 options, or none when it takes a written answer or is something to do'
   using errcode='23514';
 end if;
 if new.kind='done' and new.reveal<>'named' then
  raise exception 'Something to do is always named'
   using errcode='23514';
 end if;
 return null;
end $$;

create or replace function emba_ask_answer_guard() returns trigger
language plpgsql set search_path=public as $$
declare a emba_ask; known integer;
begin
 if tg_op='UPDATE' then
  if row(new.id,new.ask_id) is distinct from row(old.id,old.ask_id)
     or (new.person_id is not null
         and new.person_id is distinct from old.person_id) then
   raise exception 'An answer stays with its ask and its person'
    using errcode='23514';
  end if;
  if row(new.choices,new.body,new.route,new.client_id,new.at)
     is not distinct from
     row(old.choices,old.body,old.route,old.client_id,old.at) then
   return new;
  end if;
 end if;
 select * into a from emba_ask where id=new.ask_id;
 if a.closed_at is not null or a.closes_at<=clock_timestamp() then
  raise exception 'A closed ask takes no answers'
   using errcode='23514';
 end if;
 if new.person_id is null then
  raise exception 'An answer is given by a person'
   using errcode='23514';
 end if;
 if a.kind='text' then
  if new.body is null then
   raise exception 'This ask takes a written answer'
    using errcode='23514';
  end if;
 elsif a.kind='done' then
  if new.body is not null or cardinality(new.choices)<>0 then
   raise exception 'Something to do is only marked done'
    using errcode='23514';
  end if;
 else
  if new.body is not null or cardinality(new.choices)=0
     or (a.kind='one' and cardinality(new.choices)<>1) then
   raise exception 'The answer does not fit the kind of ask'
    using errcode='23514';
  end if;
  select count(distinct c) into known
   from unnest(new.choices) as c
   join emba_ask_option o on o.ask_id=new.ask_id and o.position=c;
  if known<>cardinality(new.choices) then
   raise exception
    'An answer names each option once, and only options the ask has'
    using errcode='23514';
  end if;
 end if;
 return new;
end $$;

-- A new closing time is written to the team's change sequence.
alter table emba_team_change
 drop constraint if exists emba_team_change_action_check,
 drop constraint if exists emba_team_change_action_target;
alter table emba_team_change
 add constraint emba_team_change_action_check check(action in (
  'filed','corrected','replaced','logged','superseded','withdrawn',
  'claimed','proposed','confirmed','declined','done','released',
  'announced','flagged','recheck','unflagged','overlap','tagged',
  'untagged','event_added','event_changed','event_archived',
  'event_restored','event_proposed','event_planned',
  'event_cancelled','event_lapsed','asked','ask_closed',
  'ask_extended')),
 add constraint emba_team_change_action_target check(
  (action like 'event\_%')=(event_id is not null)
  and (action in ('asked','ask_closed','ask_extended'))
      =(ask_id is not null));
