-- Constraints the application relies on. Runs inside a transaction that is
-- rolled back. Each block raises on failure.

insert into board (id, slug, name, window_start, window_end)
values ('10000000-0000-4000-8000-000000000001', 't-board', 'Test', '2027-02-14', '2027-02-20');
insert into person (id, phone, name) values
  ('10000000-0000-4000-8000-0000000000b1', '+16075550101', 'Priya'),
  ('10000000-0000-4000-8000-0000000000b2', '+16075550102', 'Marcus');
insert into proposal (id, board_id, poster_id, title)
values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-0000000000b1', 'Suits in Hoi An');

-- unique phone
do $$ begin
  begin
    insert into person (phone, name) values ('+16075550101', 'Someone else');
    raise exception 'FAIL: duplicate phone accepted';
  exception when unique_violation then null;
  end;
end $$;

-- phones are E.164
do $$ begin
  begin
    insert into person (phone, name) values ('(607) 555-0199', 'Raw');
    raise exception 'FAIL: non-E.164 phone accepted';
  exception when check_violation then null;
  end;
end $$;

-- one response per person per proposal
insert into response (proposal_id, person_id, answer)
values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000b1', 'in');
do $$ begin
  begin
    insert into response (proposal_id, person_id, answer)
    values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000b1', 'maybe');
    raise exception 'FAIL: second response for the same person accepted';
  exception when unique_violation then null;
  end;
end $$;

-- status on requires on_at
do $$ begin
  begin
    update proposal set status = 'on' where id = '10000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL: status on without on_at accepted';
  exception when check_violation then null;
  end;
end $$;

-- threshold_reached, proposal_idled and one_more_sent at most once per proposal
insert into event (board_id, proposal_id, type, source)
values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'threshold_reached', 'direct'),
       ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'proposal_idled', 'direct');
do $$ begin
  begin
    insert into event (board_id, proposal_id, type, source)
    values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'threshold_reached', 'direct');
    raise exception 'FAIL: second threshold_reached accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into event (board_id, proposal_id, type, source)
    values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'proposal_idled', 'direct');
    raise exception 'FAIL: second proposal_idled accepted';
  exception when unique_violation then null;
  end;
  insert into event (board_id, proposal_id, type, source)
  values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'one_more_sent', 'direct');
  begin
    insert into event (board_id, proposal_id, type, source)
    values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'one_more_sent', 'direct');
    raise exception 'FAIL: second one_more_sent accepted';
  exception when unique_violation then null;
  end;
  -- other event types repeat freely
  insert into event (board_id, proposal_id, type, source)
  values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'response', 'group_link'),
         ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000c1', 'response', 'group_link');
end $$;

-- window kinds: a fixed window is 1 to 14 days; a rolling board stores no dates
insert into board (slug, name, window_start, window_end) values ('t-fixed-14', 'Fourteen', '2027-03-01', '2027-03-14');
insert into board (slug, name, window_kind) values ('t-rolling', 'Rolling', 'rolling');
do $$
declare k text;
begin
  select window_kind into k from board where slug = 't-board';
  if k <> 'fixed' then raise exception 'FAIL: default window_kind is %', k; end if;
  begin
    insert into board (slug, name, window_start, window_end) values ('t-fixed-15', 'Fifteen', '2027-03-01', '2027-03-15');
    raise exception 'FAIL: a 15-day fixed window accepted';
  exception when check_violation then null;
  end;
  begin
    insert into board (slug, name, window_start, window_end) values ('t-backwards', 'Backwards', '2027-03-02', '2027-03-01');
    raise exception 'FAIL: a window ending before it starts accepted';
  exception when check_violation then null;
  end;
  begin
    insert into board (slug, name, window_kind, window_start, window_end) values ('t-rolling-dates', 'Rolling dates', 'rolling', '2027-03-01', '2027-03-07');
    raise exception 'FAIL: a rolling board with dates accepted';
  exception when check_violation then null;
  end;
  begin
    insert into board (slug, name) values ('t-fixed-none', 'No dates');
    raise exception 'FAIL: a fixed board without dates accepted';
  exception when check_violation then null;
  end;
end $$;

-- a code can be logged before its board exists
insert into event (type, source, data) values ('text_sent', 'direct', '{"kind":"code"}');
