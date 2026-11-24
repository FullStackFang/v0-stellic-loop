import 'server-only';
import type { Q } from '../db';
import { reviewReady } from './listings';
import type { PlaceKind } from './place-tags';

export { PLACE_KINDS, PLACES_REQUIRED, placeFor, placeTag, type PlaceKind } from './place-tags';

// A campus's named places (design D13). An event's place text is matched to one by name, which gives the map its centre.

export type PlaceName = { id: string; name: string; otherNames: string[] };

const plain = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The place whose name, or another name it goes by, appears as whole words in the text. The longest name wins. */
export function matchPlace<T extends PlaceName>(places: readonly T[], text: string | null | undefined): T | null {
  if (!text) return null;
  const within = plain(text);
  let best: T | null = null, length = 0;
  for (const place of places) for (const name of [place.name, ...place.otherNames]) {
    const wanted = plain(name);
    if (wanted.length > 2 && wanted.length > length && within.includes(wanted)) { best = place; length = wanted.length; }
  }
  return best;
}

export type CampusPlace = PlaceName & { lat: number; lon: number; kind: PlaceKind | null };
export async function campusPlaces(q: Q, campusId: string): Promise<CampusPlace[]> {
  return (await q.query<CampusPlace>('select id,name,other_names as "otherNames",lat,lon,kind from campus_place where campus_id=$1 order by lower(name)', [campusId])).rows;
}

/** Adds a place, or changes the one with `id`. Events already in the list are matched again against the new list. */
export async function savePlace(q: Q, input: { campusId: string; id?: string; name: string; otherNames: string[]; lat: number; lon: number }): Promise<{ id: string }> {
  const name = input.name.trim(), others = [...new Set(input.otherNames.map(other => other.trim()).filter(Boolean))];
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) throw new Error('A place needs its coordinates');
  const { rows: [row] } = input.id
    ? await q.query<{ id: string }>('update campus_place set name=$3,other_names=$4,lat=$5,lon=$6 where id=$1 and campus_id=$2 returning id', [input.id, input.campusId, name, others, input.lat, input.lon])
    : await q.query<{ id: string }>('insert into campus_place(campus_id,name,other_names,lat,lon) values($1,$2,$3,$4,$5) returning id', [input.campusId, name, others, input.lat, input.lon]);
  if (!row) throw new Error('No such place');
  await rematch(q, input.campusId);
  return row;
}

/**
 * Matches the campus's events to its places as they now stand. Past events too: there are only ever a few weeks of them.
 * A place the admin pinned by hand is left alone.
 */
async function rematch(q: Q, campusId: string) {
  const places = await campusPlaces(q, campusId);
  const { rows } = await q.query<{ id: string; text: string | null; placeId: string | null }>(`select id,place_text as text,place_id as "placeId" from campus_listing where campus_id=$1 and place_text is not null${await reviewReady(q) ? ' and not place_by_hand' : ''}`, [campusId]);
  for (const row of rows) {
    const match = matchPlace(places, row.text)?.id ?? null;
    if (match !== row.placeId) await q.query('update campus_listing set place_id=$2 where id=$1', [row.id, match]);
  }
}
