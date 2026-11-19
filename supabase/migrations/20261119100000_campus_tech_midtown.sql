-- Where Cornell people in the city go and host, beyond Roosevelt Island: the Cornell Club and the ILR School's
-- New York building, as places of the Cornell Tech campus. Neither is in a section of the map: an event that names one
-- is shown at that building alone when it is picked (components/campus/near.tsx, "a place on its own"), with the stop
-- it is by (lib/campus/sections.ts, STOPS). Coordinates are OpenStreetMap's, looked up 2026-11-19.
-- Safe to run twice: a place already there under the same name is left as it is.
insert into campus_place(campus_id, name, other_names, lat, lon)
select c.id, p.name, p.other_names, p.lat, p.lon
from campus c, (values
  ('The Cornell Club', array['Cornell Club', 'Cornell Club-New York', 'The Cornell Club-New York', 'Cornell Club of New York', 'Cornell Club NYC', 'NYC - Cornell Club', '6 East 44th Street', '6 E 44th St'], 40.7542822, -73.9793717),
  ('ILR NYC Conference Center', array['ILR NYC', 'ILR New York City', 'Cornell ILR NYC', 'NYC Conference Center', '570 Lexington Avenue', '570 Lexington Ave', '570 Lexington', 'General Electric Building'], 40.7570841, -73.9724543)
) as p(name, other_names, lat, lon)
where c.slug = 'cornell-tech'
on conflict (campus_id, lower(name)) do nothing;

-- Cornell's own calendar of what is on in New York City, read every hour like any other feed. It was empty on the
-- day this was written; whatever Cornell lists there for the city shows up without anyone adding it.
insert into campus_feed(campus_id, source, url)
select c.id, 'Cornell in NYC', 'https://events.cornell.edu/nyc/calendar/ics'
from campus c
where c.slug = 'cornell-tech'
on conflict (campus_id, url) do nothing;
