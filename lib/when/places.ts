import type { Q } from '../db';
import { campusPlaces, matchPlace } from '../campus/places';
import { places } from './polls';

// The places a poll's "Where" box offers, and where a poll's place is on a map. Nothing here understands a name: a
// name belongs to whoever has already heard it. It is offered to the person who typed it, to the people who answered a
// poll that named it, and to everyone at a campus once two different people there have each put it on a poll of their
// own, which is what shows it is a name the place goes by and not one person's wording. The campus's own list, kept by
// hand in the admin page, is always offered, with the other names its places go by.

const YEAR_MS = 365 * 86_400_000, OFFERED = 60;
/** How a name is compared: case and spacing do not make two places. */
const KEY = `lower(regexp_replace(btrim(w.place),'\\s+',' ','g'))`;
const key = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();
/** The polls that name a place, made by someone at campus `$1` since `$2`. */
const AT_CAMPUS = `from when_poll w join campus_person c on c.person_id=w.organizer_id where c.campus_id=$1 and w.place is not null and w.created_at>$2`;

/** The names to offer this person as they type where a poll is: their own first, then ones they have been shown, then their campus's. */
export async function placeIdeas(q: Q, personId: string, now = new Date()): Promise<string[]> {
  if (!await places(q)) return [];
  const campusId = (await q.query<{ id: string }>('select campus_id as id from campus_person where person_id=$1', [personId])).rows[0]?.id ?? null;
  const since = new Date(now.getTime() - YEAR_MS).toISOString();
  // Tier 0 is their own, 1 a poll they answered, 3 the campus's (2 is the campus list, added below). Among the campus's, the names more people have been on a poll with come first.
  const { rows } = await q.query<{ name: string; tier: number }>(`
    with named as (select w.id,w.organizer_id,w.place,${KEY} as k,w.created_at from when_poll w where w.place is not null),
    mine as (select k,0 as tier,0 as reach from named where organizer_id=$1 group by k),
    heard as (select n.k,1 as tier,0 as reach from named n join when_answer a on a.poll_id=n.id where a.person_id=$1 group by n.k),
    local as (select n.* from named n join campus_person c on c.person_id=n.organizer_id where c.campus_id=$2 and n.created_at>$3),
    crowd as (select l.k,3 as tier,(select count(*) from (select l2.organizer_id as p from local l2 where l2.k=l.k union select a.person_id from local l2 join when_answer a on a.poll_id=l2.id where l2.k=l.k) seen)::int as reach
      from local l group by l.k having count(distinct l.organizer_id)>=2),
    every as (select * from mine union all select * from heard union all select * from crowd),
    best as (select k,min(tier) as tier,max(reach) as reach from every group by k)
    select (select n.place from named n where n.k=b.k group by n.place order by count(*) desc,n.place limit 1) as name,b.tier from best b order by b.tier,b.reach desc,b.k limit ${OFFERED}`, [personId, campusId, since]);
  const listed = campusId ? (await campusPlaces(q, campusId)).flatMap(place => [place.name, ...place.otherNames]) : [];
  const out: string[] = [], had = new Set<string>();
  for (const name of [...rows.filter(row => row.tier < 2).map(row => row.name), ...listed, ...rows.filter(row => row.tier > 2).map(row => row.name)]) if (!had.has(key(name))) { had.add(key(name)); out.push(name); }
  return out.slice(0, OFFERED);
}

/** The names people at a campus have put on polls that its list does not have, the ones most people typed first. For the admin, who ties a name to a place. */
export async function typedPlaces(q: Q, campusId: string, now = new Date()): Promise<{ name: string; people: number }[]> {
  if (!await places(q)) return [];
  const { rows } = await q.query<{ name: string; people: number }>(`select (array_agg(w.place order by w.created_at desc))[1] as name,count(distinct w.organizer_id)::int as people ${AT_CAMPUS} group by ${KEY} order by people desc,name limit 200`,
    [campusId, new Date(now.getTime() - YEAR_MS).toISOString()]);
  const listed = await campusPlaces(q, campusId);
  return rows.filter(row => !matchPlace(listed, row.name)).slice(0, 30);
}

/** The place on the campus list that a poll's words name, for the campus of the person who made the poll. Null when the list has none. */
export async function placeSpot(q: Q, organizerId: string, place: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const campusId = (await q.query<{ id: string }>('select campus_id as id from campus_person where person_id=$1', [organizerId])).rows[0]?.id;
  if (!campusId) return null;
  const found = matchPlace(await campusPlaces(q, campusId), place);
  return found && { name: found.name, lat: found.lat, lon: found.lon };
}
