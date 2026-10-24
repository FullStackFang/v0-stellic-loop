-- lock_proposal outcomes in one session. The concurrent case is latch.mjs.
-- The window is far in the future so nothing is idled by today's date.

insert into board (id, slug, name, window_start, window_end)
values ('20000000-0000-4000-8000-000000000001', 'l-board', 'Lock', '2099-02-14', '2099-02-20');
insert into person (id, phone, name) values
  ('20000000-0000-4000-8000-0000000000b1', '+16075550201', 'A'),
  ('20000000-0000-4000-8000-0000000000b2', '+16075550202', 'B'),
  ('20000000-0000-4000-8000-0000000000b3', '+16075550203', 'C'),
  ('20000000-0000-4000-8000-0000000000b4', '+16075550204', 'D'),
  ('20000000-0000-4000-8000-0000000000b5', '+16075550205', 'E');
-- needs a day, min 3: heat Mon 2, Tue 3, Wed 3 → ready, best Tue (earliest)
insert into proposal (id, board_id, poster_id, title, min_count)
values ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-0000000000b1', 'Boat', 3);
insert into response (proposal_id, person_id, answer, days) values
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b1', 'in', '{2099-02-15,2099-02-16,2099-02-17}'),
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b2', 'in', '{2099-02-16,2099-02-17}'),
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b3', 'in', '{2099-02-15,2099-02-16,2099-02-17}'),
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b4', 'maybe', '{2099-02-15}');
-- no day, default min 4, only 3 in
insert into proposal (id, board_id, poster_id, title, needs_day)
values ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-0000000000b1', 'Shirts', false);
insert into response (proposal_id, person_id, answer) values
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b1', 'in'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b2', 'in'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b3', 'in'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b4', 'maybe'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b5', 'maybe');

do $$
declare r text; p proposal%rowtype; n int;
begin
  -- a maybe cannot lock
  r := lock_proposal('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b4');
  if r <> 'not_in' then raise exception 'FAIL: maybe lock returned %', r; end if;

  -- maybes do not lift a proposal
  r := lock_proposal('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b1');
  if r <> 'not_ready' then raise exception 'FAIL: 3 in + 2 maybe of 4 returned %', r; end if;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b2');
  if r <> 'locked' then raise exception 'FAIL: ready lock returned %', r; end if;
  select * into p from proposal where id = '20000000-0000-4000-8000-0000000000c1';
  if p.status <> 'on' or p.on_day <> '2099-02-16' or p.locked_by <> '20000000-0000-4000-8000-0000000000b2' or p.on_at is null then
    raise exception 'FAIL: locked row is %', row_to_json(p);
  end if;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b1');
  if r <> 'already_on' then raise exception 'FAIL: second lock returned %', r; end if;
  select count(*) into n from event
   where proposal_id = '20000000-0000-4000-8000-0000000000c1' and type = 'threshold_reached';
  if n <> 1 then raise exception 'FAIL: % threshold_reached events', n; end if;

  -- a 4th in lifts the no-day proposal
  update response set answer = 'in'
   where proposal_id = '20000000-0000-4000-8000-0000000000c2' and person_id = '20000000-0000-4000-8000-0000000000b4';
  r := lock_proposal('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-0000000000b4');
  if r <> 'locked' then raise exception 'FAIL: no-day lock returned %', r; end if;
  select * into p from proposal where id = '20000000-0000-4000-8000-0000000000c2';
  if p.on_day is not null then raise exception 'FAIL: no-day proposal got a day'; end if;
end $$;

-- Rolling and mid-window cases, relative to today in the board's timezone.
-- R is rolling; F is fixed and started three days ago.
insert into board (id, slug, name, window_kind)
values ('20000000-0000-4000-8000-000000000002', 'l-rolling', 'Rolling', 'rolling');
insert into board (id, slug, name, window_start, window_end)
values ('20000000-0000-4000-8000-000000000003', 'l-midtrip', 'Mid-trip',
        (now() at time zone 'America/New_York')::date - 3, (now() at time zone 'America/New_York')::date + 3);

do $$
declare
  r text;
  p proposal%rowtype;
  today date := (now() at time zone 'America/New_York')::date;
  people uuid[] := array['20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b2',
                         '20000000-0000-4000-8000-0000000000b3']::uuid[];
  who uuid;
begin
  -- c3: all heat on rolling window day 14 → locks to it
  -- c4: all heat on day 15 → not ready
  -- c5: deadline in two days, best day in ten → locks to the best day
  -- c6: mid-trip, 3 on yesterday and 2 tomorrow at min 3 → not ready
  insert into proposal (id, board_id, poster_id, title, min_count, deadline) values
    ('20000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-000000000002', people[1], 'Day 14', 3, today + 13),
    ('20000000-0000-4000-8000-0000000000c4', '20000000-0000-4000-8000-000000000002', people[1], 'Day 15', 3, today + 13),
    ('20000000-0000-4000-8000-0000000000c5', '20000000-0000-4000-8000-000000000002', people[1], 'After deadline', 3, today + 2),
    ('20000000-0000-4000-8000-0000000000c6', '20000000-0000-4000-8000-000000000003', people[1], 'Yesterday', 3, null);
  foreach who in array people loop
    insert into response (proposal_id, person_id, answer, days) values
      ('20000000-0000-4000-8000-0000000000c3', who, 'in', array[today + 13]),
      ('20000000-0000-4000-8000-0000000000c4', who, 'in', array[today + 14]),
      ('20000000-0000-4000-8000-0000000000c5', who, 'in', array[today + 10]),
      ('20000000-0000-4000-8000-0000000000c6', who, 'in',
        case when who = people[3] then array[today - 1] else array[today - 1, today + 1] end);
  end loop;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c3', people[1]);
  if r <> 'locked' then raise exception 'FAIL: rolling day 14 returned %', r; end if;
  select * into p from proposal where id = '20000000-0000-4000-8000-0000000000c3';
  if p.on_day <> today + 13 then raise exception 'FAIL: rolling day 14 locked to %', p.on_day; end if;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c4', people[1]);
  if r <> 'not_ready' then raise exception 'FAIL: rolling day 15 returned %', r; end if;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c5', people[1]);
  if r <> 'locked' then raise exception 'FAIL: best day after the deadline returned %', r; end if;
  select * into p from proposal where id = '20000000-0000-4000-8000-0000000000c5';
  if p.on_day <> today + 10 then raise exception 'FAIL: after-deadline lock went to %', p.on_day; end if;

  r := lock_proposal('20000000-0000-4000-8000-0000000000c6', people[1]);
  if r <> 'not_ready' then raise exception 'FAIL: a past best day returned %', r; end if;

  -- an expired deadline on a rolling board idles it
  update proposal set deadline = today - 1 where id = '20000000-0000-4000-8000-0000000000c4';
  update response set days = array[today + 1] where proposal_id = '20000000-0000-4000-8000-0000000000c4';
  r := lock_proposal('20000000-0000-4000-8000-0000000000c4', people[1]);
  if r <> 'not_ready' then raise exception 'FAIL: an idled rolling proposal returned %', r; end if;
end $$;
