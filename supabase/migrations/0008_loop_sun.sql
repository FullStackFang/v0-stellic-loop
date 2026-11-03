-- Additive Sun slots and private membership preference.
alter table proposal add column day date, add column place text;
alter table board add column lat double precision, add column lon double precision,
  add column steward_label text not null default 'the space steward';
update board set steward_label = 'the EMBA office' where slug = 'emba27';
alter table board_person add column share_with_steward boolean not null default false;

-- Preserve the slot when automatic formation latches the plan.
create or replace function lock_proposal(p_id uuid, p_person uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  p proposal%rowtype;
  b board%rowtype;
  v_today date;
  v_start date;
  v_end date;
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
  v_today := (now() at time zone b.tz)::date;
  if coalesce(p.deadline, case when p.needs_day and b.window_kind = 'fixed' then b.window_end end)
     < v_today then
    return 'not_ready';
  end if;
  v_start := greatest(b.window_start, v_today);
  v_end := coalesce(b.window_end, v_today + 13); -- 13 = ROLLING_DAYS - 1

  v_min := coalesce(p.min_count, 4);

  if p.needs_day then
    select d.day, count(*)::int into v_best, v_best_n
    from response r
    cross join lateral unnest(r.days) as d(day)
    where r.proposal_id = p_id
      and r.answer = 'in'
      and d.day between v_start and v_end
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
    v_best := p.day;
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
