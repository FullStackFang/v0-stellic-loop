// "Near you": a campus's town, cut into sections of a few blocks each. The map shows one section at a time, in the
// shape of that section, and a person can open the one they stand in and the ones touching it, nothing further.
// The sections are drawn by hand and kept here, per campus. A campus with none has no "Near you" view.
// Points are [longitude, latitude]. Nothing here touches the page or the map library, so it is all tested directly.

export type Point = [number, number];
export type Section = {
  id: string; name: string;
  /** The outline, corner by corner. Sections next to each other share corners. */
  ring: Point[];
  /** Where the map rests in this section when nothing is on. */
  rest: Point;
  /** The sections it touches. */
  next: string[];
};

const section = (corners: Record<string, Point>) => (id: string, name: string, ring: string, rest: Point, next: string[]): Section => ({ id, name, ring: [...ring].map(key => corners[key]), rest, next });

// Ithaca, roughly along the creeks and main streets.
const ithaca = section({ a: [-76.5005, 42.4378], b: [-76.4908, 42.4370], c: [-76.4915, 42.4410], d: [-76.4910, 42.4437], e: [-76.5008, 42.4432], f: [-76.4856, 42.4443], g: [-76.4802, 42.4436], h: [-76.4806, 42.4380], i: [-76.4852, 42.4362],
  j: [-76.4962, 42.4462], k: [-76.4952, 42.4510], l: [-76.4898, 42.4518], m: [-76.4893, 42.4472], o: [-76.4845, 42.4528], p: [-76.4796, 42.4516], q: [-76.4792, 42.4472], r: [-76.4722, 42.4530], s: [-76.4728, 42.4585], t: [-76.4800, 42.4600], u: [-76.4850, 42.4570], v: [-76.4708, 42.4482], w: [-76.4725, 42.4428] });

// Roosevelt Island is one section, tip to tip: everything its one stop serves.
const island = section({ a: [-73.9622, 40.7492], b: [-73.9570, 40.7500], c: [-73.9478, 40.7600], d: [-73.9385, 40.7722], e: [-73.9395, 40.7740], f: [-73.9440, 40.7715], g: [-73.9530, 40.7625], h: [-73.9600, 40.7545] });

const LANDS: Record<string, Section[]> = {
  'cornell-tech': [island('roosevelt', 'Roosevelt Island', 'abcdefgh', [-73.9552, 40.7562], [])],
  cornell: [
    ithaca('downtown', 'Downtown', 'abcde', [-76.4968, 42.4418], ['collegetown', 'west']),
    ithaca('collegetown', 'Collegetown', 'bihgfdc', [-76.4862, 42.4424], ['downtown', 'central']),
    ithaca('west', 'West Campus', 'djklm', [-76.4930, 42.4500], ['downtown', 'central']),
    ithaca('central', 'Central Campus', 'dfgqpolm', [-76.4868, 42.4502], ['collegetown', 'west', 'north', 'ag']),
    ithaca('north', 'North Campus', 'oprstu', [-76.4790, 42.4548], ['central', 'ag']),
    ithaca('ag', 'Ag Quad', 'gwvrpq', [-76.4758, 42.4500], ['central', 'north']),
  ],
};

/** The campus's sections, or null when none are drawn for it. */
export const landOf = (campusSlug: string): Section[] | null => LANDS[campusSlug] ?? null;

export const inside = (point: Point, ring: readonly Point[]) => ring.reduce((hit, a, at) => {
  const b = ring[(at + 1) % ring.length];
  return (a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0] ? !hit : hit;
}, false);
export const sectionAt = (land: readonly Section[], point: Point) => land.find(each => inside(point, each.ring)) ?? null;
export const middle = (ring: readonly Point[]): Point => [ring.reduce((sum, p) => sum + p[0], 0) / ring.length, ring.reduce((sum, p) => sum + p[1], 0) / ring.length];
export const metres = (a: Point, b: Point) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 110540);
/** Metres of straight line covered in a minute on foot: an easy 78 m a minute, with the paths taken as 1.5 times the straight line, the top of the usual range, so the time runs long rather than short. */
export const WALK_PER_MINUTE = 78 / 1.5;
/** Rough minutes on foot. Never under one. */
export const walkMinutes = (a: Point, b: Point) => Math.max(1, Math.round(metres(a, b) / WALK_PER_MINUTE));

const byId = (land: readonly Section[], id: string) => land.find(each => each.id === id);
/** You can open the section you stand in and the ones touching it. */
export const reach = (land: readonly Section[], standing: string, id: string) => id === standing || !!byId(land, standing)?.next.includes(id);
/** How many steps from one section to another. */
export function hops(land: readonly Section[], from: string, to: string): number {
  const seen = new Set([from]);
  let edge = [from], count = 0;
  while (edge.length && !edge.includes(to)) { edge = edge.flatMap(id => byId(land, id)?.next ?? []).filter(id => !seen.has(id) && !!seen.add(id)); count++; }
  return count;
}

export type Bounds = { west: number; east: number; south: number; north: number; centre: Point };
export function bounds(ring: readonly Point[]): Bounds {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), west = Math.min(...xs), east = Math.max(...xs), south = Math.min(...ys), north = Math.max(...ys);
  return { west, east, south, north, centre: [(west + east) / 2, (south + north) / 2] };
}
/**
 * The wall. `floor` is the zoom at which the whole section is in view. At that zoom the middle of the view cannot move
 * at all; each step closer frees it over more of the section's box, and it never leaves the box.
 */
export function held(box: Bounds, floor: number, point: Point, zoom: number): Point {
  const free = Math.max(0, 1 - 2 ** (floor - zoom)), dx = (box.east - box.west) / 2 * free, dy = (box.north - box.south) / 2 * free;
  return [Math.min(Math.max(point[0], box.centre[0] - dx), box.centre[0] + dx), Math.min(Math.max(point[1], box.centre[1] - dy), box.centre[1] + dy)];
}

/** What a push against the wall finds: a place to go on to, one that is not open or has nothing on, or nothing at all. */
export type Way = { id: string | null; kind: 'go' | 'far' | 'empty' | 'none'; /** The push, as a unit vector east and north. */ toward: Point };
/**
 * `push` is how far past the wall the view was dragged, in degrees east and north. The section next door that lies
 * most nearly that way is the way on, if any lies that way at all. `on` is how many events each section has.
 */
export function wayOn(land: readonly Section[], viewing: string, standing: string, push: Point, on: Readonly<Record<string, number>>): Way | null {
  const here = byId(land, viewing);
  if (!here) return null;
  const from = middle(here.ring), squeeze = Math.cos(from[1] * Math.PI / 180), length = Math.hypot(push[0] * squeeze, push[1]);
  if (length < 1e-7) return null;
  const toward: Point = [push[0] * squeeze / length, push[1] / length];
  const best = here.next.flatMap(id => { const there = byId(land, id); if (!there) return [];
    const to = middle(there.ring), x = (to[0] - from[0]) * squeeze, y = to[1] - from[1];
    return [{ id, along: (x * toward[0] + y * toward[1]) / (Math.hypot(x, y) || 1) }]; }).sort((a, b) => b.along - a.along)[0];
  const id = best && best.along > .45 ? best.id : null;
  return { id, toward, kind: !id ? 'none' : !reach(land, standing, id) ? 'far' : on[id] ? 'go' : 'empty' };
}
