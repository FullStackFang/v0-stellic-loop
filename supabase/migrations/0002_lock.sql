-- The ON latch. One call = one transaction. The row lock serialises
-- concurrent callers; the partial unique index on event is the backstop.
--
-- Readiness is recomputed from rows exactly as lib/quorum.ts does it:
--   min = coalesce(min_count, 4)
--   needs_day: best day = highest heat over the window, earliest on ties,
--              where a person's day does not count if they are `in` on another
--              ON proposal locked to that day; ready when best >= min
--   no day:    ready when count(in) >= min
--   idled (past its deadline, or past the window for needs_day) is not ready
create or replace function lock_proposal(p_id uuid, p_person uuid)
returns text
language plpgsql
as $$
declare
  p proposal%rowtype;
  b board%rowtype;
  v_min int;
  v_best date;
  v_best_n int;
  v_in int;
begin
  select * into p from proposal where id = p_id for update;
  if not found then
    return 'not_found';
  end if;
  if p.status = 'on' then
    return 'already_on';
  end if;
  if p.status <> 'open' then
    return 'not_ready';
  end if;
  if not exists (
    select 1 from response r
    where r.proposal_id = p_id and r.person_id = p_person and r.answer = 'in'
  ) then
    return 'not_in';
  end if;

  select * into b from board where id = p.board_id;
  if coalesce(p.deadline, case when p.needs_day then b.window_end end)
     < (now() at time zone b.tz)::date then
    return 'not_ready';
  end if;

  v_min := coalesce(p.min_count, 4);

  if p.needs_day then
    select d.day, count(*)::int into v_best, v_best_n
    from response r
    cross join lateral unnest(r.days) as d(day)
    where r.proposal_id = p_id
      and r.answer = 'in'
      and d.day between b.window_start and b.window_end
      and not exists (
        select 1 from response r2
        join proposal p2 on p2.id = r2.proposal_id
        where r2.person_id = r.person_id and r2.answer = 'in'
          and p2.id <> p_id and p2.status = 'on' and p2.on_day = d.day
      )
    group by d.day
    order by count(*) desc, d.day asc
    limit 1;
    if v_best is null or v_best_n < v_min then
      return 'not_ready';
    end if;
  else
    select count(*)::int into v_in from response r
    where r.proposal_id = p_id and r.answer = 'in';
    if v_in < v_min then
      return 'not_ready';
    end if;
    v_best := null;
  end if;

  update proposal
     set status = 'on', on_day = v_best, on_at = now(), locked_by = p_person
   where id = p_id;

  insert into event (board_id, proposal_id, person_id, type, source, data)
  values (p.board_id, p_id, p_person, 'threshold_reached', 'direct',
          jsonb_build_object('on_day', v_best, 'min', v_min));

  return 'locked';
end;
$$;
