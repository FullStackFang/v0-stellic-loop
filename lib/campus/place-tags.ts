// A place's short @name, and which campuses need a place on every plan (openspec campus-plan-place-and-time, design D3, D4).
// Read the same way in the posting panel and on the server, so no 'server-only' here.

export const PLACE_KINDS = ['food', 'park', 'sport', 'building'] as const;
export type PlaceKind = typeof PLACE_KINDS[number];

/** Campuses where a person's plan must stand on a known place. Switched on with loading the campus's places. */
export const PLACES_REQUIRED: ReadonlySet<string> = new Set(['cornell-tech']);

/** A name as a tag: lower case, letters and numbers, dashes between words, up to 30 long. */
const asTag = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');

/** A place's @name, without the @: its first other name as a tag, else its name ("Southpoint Park" going by "southpoint" → southpoint). */
export function placeTag(place: { name: string; otherNames: readonly string[] }): string {
  return asTag(place.otherNames[0] ?? '') || asTag(place.name);
}

/** The place whose @name is this tag, or null. */
export function placeFor<T extends { name: string; otherNames: readonly string[] }>(places: readonly T[], slug: string | null | undefined): T | null {
  const wanted = slug?.replace(/^@/, '').toLowerCase();
  return wanted ? places.find(place => placeTag(place) === wanted) ?? null : null;
}
