-- The named places of the Cornell Tech campus and the island's landmarks (openspec loop-nyc-campus, design D8),
-- so an event whose place text names one stands on the map. Coordinates are OpenStreetMap's, looked up 2026-11-18.
-- Safe to run twice: a place already there under the same name is left as it is.
insert into campus_place(campus_id, name, other_names, lat, lon)
select c.id, p.name, p.other_names, p.lat, p.lon
from campus c, (values
  ('Bloomberg Center', array['Emma and Georgina Bloomberg Center', 'Bloomberg'], 40.7557895, -73.9562046),
  ('Tata Innovation Center', array['Tata', 'The Bridge', 'The Bridge at Cornell Tech', '11 East Loop Road', '11 E Loop Rd'], 40.7552363, -73.9555091),
  ('The House', array['The House at Cornell Tech', '1 East Loop Road', '1 E Loop Rd'], 40.7557548, -73.9549158),
  ('Verizon Executive Education Center', array['Verizon Center', 'Executive Education Center', 'Verizon Executive Ed Center'], 40.7557846, -73.9556069),
  ('Graduate Roosevelt Island', array['Graduate Hotel', 'Graduate New York', 'Graduate by Hilton New York', 'Panorama Room', 'Anything At All', '22 North Loop Road', '22 N Loop Rd'], 40.7560214, -73.9553915),
  ('Roosevelt Island subway station', array['Roosevelt Island station', 'Roosevelt Island subway', 'F train station'], 40.7591449, -73.9532600),
  ('Roosevelt Island Tramway', array['Tram station', 'Tramway Plaza', 'Tram Plaza', 'Roosevelt Island Tram', 'The Tram'], 40.7573223, -73.9540884),
  ('Four Freedoms Park', array['FDR Four Freedoms State Park', 'Franklin D. Roosevelt Four Freedoms Park', 'Four Freedoms State Park', 'FDR Four Freedoms Park', '1 FDR Four Freedoms Park'], 40.7506590, -73.9604461)
) as p(name, other_names, lat, lon)
where c.slug = 'cornell-tech'
on conflict (campus_id, lower(name)) do nothing;
