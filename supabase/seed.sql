-- Dev seed: the EMBA '27 board and the trip five from DESIGN.md, no people.
-- Idempotent: fixed ids, `on conflict do nothing`.

insert into board (id, slug, name, tz, window_start, window_end)
values ('00000000-0000-4000-8000-000000000027', 'emba27', 'EMBA ''27',
        'America/New_York', '2027-02-14', '2027-02-20')
on conflict (id) do nothing;

insert into proposal (id, board_id, title, icon, detail, cost_text, time_text, needs_day, min_count)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000027',
   'Suits in Hoi An', 'coatHanger', 'Tailor near the Japanese bridge, 24h turnaround.', '~$250', null, true, 8),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000027',
   'Overnight boat', 'sailboat', 'Halong-style junk, cabins for two.', '~$180', null, true, 10),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000027',
   'Street-food crawl', 'bowlFood', 'Five stalls, one night.', '$20', '7:30pm', true, 6),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000027',
   '5am flight to a side city', 'airplaneTilt', 'Out and back same day.', '$90', '5:10am', true, 4),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000027',
   'Dinner in NYC the week we''re back', 'martini', 'The week after the trip; day to pick once it''s on.', null, null, false, 6)
on conflict (id) do nothing;

insert into event (id, board_id, proposal_id, type, source, data)
select ('00000000-0000-4000-8000-0000000000e' || right(p.id::text, 1))::uuid,
       p.board_id, p.id, 'proposal_posted', 'seed', '{}'::jsonb
from proposal p
where p.board_id = '00000000-0000-4000-8000-000000000027'
  and p.id::text like '00000000-0000-4000-8000-0000000000a_'
on conflict (id) do nothing;
