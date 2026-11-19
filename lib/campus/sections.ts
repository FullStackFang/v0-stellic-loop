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
  /** In New York a section is everything one subway stop serves. The way on to it is drawn as that stop's platform sign. */
  stop?: Stop;
};
export type Stop = { name: string; lines: string[] };
/** The colour of each line's bullet, as on the subway map, and whether its letter is printed dark. */
export const LINE: Record<string, { fill: string; dark?: boolean }> = { F: { fill: '#ff6319' }, M: { fill: '#ff6319' }, Q: { fill: '#fccc0a', dark: true },
  E: { fill: '#0039a6' }, 4: { fill: '#00933c' }, 5: { fill: '#00933c' }, 6: { fill: '#00933c' }, 7: { fill: '#b933ad' } };

const section = (corners: Record<string, Point>) => (id: string, name: string, ring: string, rest: Point, next: string[], stop?: Stop): Section => ({ id, name, ring: [...ring].map(key => corners[key]), rest, next, ...(stop ? { stop } : {}) });

// Ithaca, roughly along the creeks and main streets.
const ithaca = section({ a: [-76.5005, 42.4378], b: [-76.4908, 42.4370], c: [-76.4915, 42.4410], d: [-76.4910, 42.4437], e: [-76.5008, 42.4432], f: [-76.4856, 42.4443], g: [-76.4802, 42.4436], h: [-76.4806, 42.4380], i: [-76.4852, 42.4362],
  j: [-76.4962, 42.4462], k: [-76.4952, 42.4510], l: [-76.4898, 42.4518], m: [-76.4893, 42.4472], o: [-76.4845, 42.4528], p: [-76.4796, 42.4516], q: [-76.4792, 42.4472], r: [-76.4722, 42.4530], s: [-76.4728, 42.4585], t: [-76.4800, 42.4600], u: [-76.4850, 42.4570], v: [-76.4708, 42.4482], w: [-76.4725, 42.4428] });

// New York. One stop is one section. Roosevelt Island is one section, tip to tip: everything its one stop serves.
// One stop west under the river is Lexington Av/63 St, one stop east is 21 St-Queensbridge. Water lies between them, so
// they share no corners. Each rests on its station. Which lines stop where was checked in November 2026: the F and the M
// share the 63 St tunnel (the M by day on weekdays, the F at night and at weekends), and the Q also stops at Lexington Av.
const island = section({ a: [-73.9622, 40.7492], b: [-73.9570, 40.7500], c: [-73.9478, 40.7600], d: [-73.9385, 40.7722], e: [-73.9395, 40.7740], f: [-73.9440, 40.7715], g: [-73.9530, 40.7625], h: [-73.9600, 40.7545],
  // Lexington Av/63 St: Park Avenue to the river, 59th to 68th Street.
  i: [-73.9697, 40.7630], j: [-73.9655, 40.7688], k: [-73.9562, 40.7648], l: [-73.9603, 40.7592],
  // 21 St-Queensbridge: the river to 24th Street, 38th Avenue down to Queens Plaza.
  m: [-73.9462, 40.7572], n: [-73.9392, 40.7598], o: [-73.9362, 40.7528], p: [-73.9448, 40.7506],
  // Lexington Av/53 St: just west of Fifth Avenue to Second Avenue, 47th to 58th Street. Cornell's ILR School is here, at 570 Lexington.
  u: [-73.9746, 40.7640], v: [-73.9653, 40.7601], w: [-73.9702, 40.7533], x: [-73.9795, 40.7572],
  // Grand Central-42 St: the same avenues, 40th to 47th Street. The Cornell Club is here, on 44th.
  q: [-73.9797, 40.7569], r: [-73.9704, 40.7530], s: [-73.9737, 40.7485], t: [-73.9830, 40.7524] });

const LANDS: Record<string, Section[]> = {
  'cornell-tech': [
    island('roosevelt', 'Roosevelt Island', 'abcdefgh', [-73.9552, 40.7562], ['lex63', 'queensbridge'], { name: 'Roosevelt Island', lines: ['F', 'M'] }),
    island('lex63', 'Upper East Side', 'ijkl', [-73.9665, 40.7647], ['roosevelt', 'lex53'], { name: 'Lexington Av/63 St', lines: ['F', 'M', 'Q'] }),
    island('queensbridge', 'Long Island City', 'mnop', [-73.9426, 40.7540], ['roosevelt'], { name: '21 St–Queensbridge', lines: ['F', 'M'] }),
    // Manhattan runs on south from the Upper East Side, a stop at a time: where Cornell people in the city go and host.
    island('lex53', 'Midtown East', 'uvwx', [-73.9706, 40.7582], ['lex63', 'grandcentral'], { name: 'Lexington Av/53 St', lines: ['E', 'F', 'M', '6'] }),
    island('grandcentral', 'Midtown', 'qrst', [-73.9768, 40.7518], ['lex53'], { name: 'Grand Central–42 St', lines: ['4', '5', '6', '7'] }),
  ],
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
/** Of these campuses, the one nearest a point, by where each one's first section rests. Null with no point, or when none of them is drawn. */
export function nearestCampus<T extends { slug: string }>(campuses: readonly T[], at: Point | null | undefined): T | null {
  if (!at) return null;
  const drawn = campuses.filter(each => LANDS[each.slug]), far = (each: T) => metres(at, LANDS[each.slug][0].rest);
  return drawn.reduce<T | null>((best, each) => !best || far(each) < far(best) ? each : best, null);
}
export const sectionAt =(land: readonly Section[], point: Point) => land.find(each => inside(point, each.ring)) ?? null;
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
