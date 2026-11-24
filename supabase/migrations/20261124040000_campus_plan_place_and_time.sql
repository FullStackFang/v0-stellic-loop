-- A plan starts at a known public place, and its time can wait (openspec campus-plan-place-and-time).
-- Additive and safe to run twice. Rollback: drop table campus_time_pick; drop the two columns; the places stay.
set lock_timeout = '5s';
begin;

-- D1. A plan posted with a day and no hour keeps its day in starts_at (00:00) and ends_at (23:59), with this set.
alter table campus_listing add column if not exists time_open boolean not null default false;
-- When its poster sent the time picked from "When works?", so the people in it are told who set it.
alter table campus_listing add column if not exists time_set_at timestamptz;

-- D3. What a place is, for the posting panel's tabs. Null counts as a building.
alter table campus_place add column if not exists kind text check(kind in ('food','park','sport','building'));

-- D6. "When works?": a person in a plan marks the times that work for them, only while its time is not set.
create table if not exists campus_time_pick (
  listing_id uuid not null references campus_listing(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  at time not null,
  primary key (listing_id, person_id, at)
);
create index if not exists campus_time_pick_listing on campus_time_pick(listing_id);
alter table campus_time_pick enable row level security;

-- The public places on Roosevelt Island, from OpenStreetMap 2026-11-23 (scripts/campus-places-osm.mjs cornell-tech roosevelt),
-- read by hand: the station, the tram and Four Freedoms Park were already here and are left out; the island's sign and the
-- FDR bust (inside Four Freedoms Park) are not places to meet. The first other name is the place's short @name.
insert into campus_place(campus_id, name, other_names, kind, lat, lon)
select c.id, p.name, p.other_names, p.kind, p.lat, p.lon
from campus c, (values
  ('Blackwell House', array['blackwell-house'], 'building', 40.7603348, -73.9511335),
  ('Church of the Good Shepherd', array['good-shepherd'], 'building', 40.7618495, -73.9502422),
  ('Dayspring Church', array['dayspring'], 'building', 40.7684941, -73.9450538),
  ('Roosevelt Island Library', array['ri-library'], 'building', 40.7607808, -73.9507219),
  ('Roosevelt Island Visitor Center Kiosk', array['visitor-kiosk'], 'building', 40.7576360, -73.9547001),
  ('Smallpox Hospital', array['smallpox'], 'building', 40.7515851, -73.9595632),
  ('Cafe Aviva', array['aviva'], 'food', 40.7621321, -73.9497795),
  ('Fuji East Restaurant', array['fuji'], 'food', 40.7590731, -73.9522681),
  ('Piccolo Trattoria', array['piccolo'], 'food', 40.7592113, -73.9525792),
  ('Pinks Cantina', array['pinks'], 'food', 40.7592498, -73.9527737),
  ('Starbucks', array['starbucks'], 'food', 40.7593049, -73.9529230),
  ('Subway', array['subway-sandwiches'], 'food', 40.7610851, -73.9508628),
  ('The Café at Cornell Tech', array['tech-cafe'], 'food', 40.7553536, -73.9564818),
  ('Blackwell Park', array['blackwell'], 'park', 40.7601079, -73.9505807),
  ('Campus Plaza', array['campus-plaza'], 'park', 40.7550332, -73.9562812),
  ('Entry Court', array['entry-court'], 'park', 40.7555854, -73.9558543),
  ('Lighthouse Park', array['lighthouse'], 'park', 40.7719982, -73.9409857),
  ('Manhattan Park Parcel A', array['manhattan-park'], 'park', 40.7654725, -73.9468940),
  ('Riverwalk Commons', array['riverwalk'], 'park', 40.7589617, -73.9528666),
  ('Riverwalk Commons East', array['riverwalk-east'], 'park', 40.7585873, -73.9520329),
  ('Roosevelt Island Garden Club', array['garden-club'], 'park', 40.7672954, -73.9446054),
  ('Southpoint Park', array['southpoint'], 'park', 40.7523609, -73.9587446),
  ('Capobianco Field', array['capobianco'], 'sport', 40.7627363, -73.9480567),
  ('Firefighters Field', array['firefighters'], 'sport', 40.7577310, -73.9529345),
  ('Jack McManus Field', array['mcmanus'], 'sport', 40.7671375, -73.9458444),
  ('Manhattan Park Pool Club', array['pool-club'], 'sport', 40.7667700, -73.9468193),
  ('Pony Field', array['pony-field'], 'sport', 40.7678681, -73.9439686),
  ('Roosevelt Island Handball Court', array['handball'], 'sport', 40.7634014, -73.9479436),
  ('Roosevelt Island Racquet Club', array['racquet-club'], 'sport', 40.7568014, -73.9545169),
  ('Roosevelt Island Sportspark', array['sportspark'], 'sport', 40.7563489, -73.9548770)
) as p(name, other_names, kind, lat, lon)
where c.slug = 'cornell-tech'
on conflict (campus_id, lower(name)) do nothing;

-- The places Cornell Tech already had get a kind and a short @name in front of their other names. Their names stay.
update campus_place cp set kind = coalesce(cp.kind, p.kind),
  other_names = case when p.tag = any(cp.other_names) then cp.other_names else array[p.tag] || cp.other_names end
from campus c, (values
  ('Bloomberg Center', 'bloomberg', 'building'),
  ('Tata Innovation Center', 'tata', 'building'),
  ('The House', 'the-house', 'building'),
  ('Verizon Executive Education Center', 'verizon-center', 'building'),
  ('Graduate Roosevelt Island', 'graduate-hotel', 'building'),
  ('Roosevelt Island subway station', 'ri-station', 'building'),
  ('Roosevelt Island Tramway', 'tram', 'building'),
  ('Four Freedoms Park', 'four-freedoms', 'park'),
  ('The Cornell Club', 'cornell-club', 'building'),
  ('ILR NYC Conference Center', 'ilr-nyc', 'building')
) as p(name, tag, kind)
where c.slug = 'cornell-tech' and cp.campus_id = c.id and lower(cp.name) = lower(p.name);

commit;
reset lock_timeout;
