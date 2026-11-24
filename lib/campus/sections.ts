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
  E: { fill: '#0039a6' }, 4: { fill: '#00933c' }, 5: { fill: '#00933c' }, 6: { fill: '#00933c' }, 7: { fill: '#b933ad' },
  A: { fill: '#0039a6' }, C: { fill: '#0039a6' }, B: { fill: '#ff6319' }, D: { fill: '#ff6319' }, L: { fill: '#a7a9ac' },
  N: { fill: '#fccc0a', dark: true }, R: { fill: '#fccc0a', dark: true }, W: { fill: '#fccc0a', dark: true }, 1: { fill: '#ee352e' } };

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
  m: [-73.9462, 40.7572], n: [-73.9392, 40.7598], o: [-73.9362, 40.7528], p: [-73.9448, 40.7506] });

// Morningside Heights, one stop of the 1 train each, from Riverside Park (a block west of Riverside Drive) to Frederick
// Douglass Boulevard: 107th to 113th (Manhattan Avenue below 110th, where the park is), 113th to 120th (the Columbia
// campus), and 120th to 125th, then up Amsterdam to 130th (Manhattanville). Corners are where the streets meet in
// OpenStreetMap, looked up 2026-11-24, the east ones a little past the boulevard so its own corners are inside. The
// stations sit on Broadway at the edge of their blocks, so each section rests a block inside.
const morningside = section({ a: [-73.9722, 40.8040], p: [-73.9610, 40.7993], b: [-73.9596, 40.8012], q: [-73.9578, 40.8006], r: [-73.9564, 40.8025],
  c: [-73.9699, 40.8080], s: [-73.9531, 40.8070], e: [-73.9666, 40.8125], t: [-73.9508, 40.8102], i: [-73.9563, 40.8134], u: [-73.9545, 40.8157],
  v: [-73.9603, 40.8182], g: [-73.9632, 40.8170] });

// Around Washington Square: west of Broadway, from Prince Street (Houston at Varick) up to 10th Street, is West 4 St;
// Broadway to Second Avenue, Prince and Houston up to 10th, is Astor Place; 10th to 14th Street from Seventh Avenue, and on
// to 17th from Fifth Avenue to Second so the square itself is in, is Union Square. OpenStreetMap, 2026-11-24.
const village = section({ a: [-74.0053, 40.7286], k: [-74.0034, 40.7270], b: [-73.9978, 40.7242], c: [-73.9933, 40.7224], m: [-73.9910, 40.7237],
  d: [-73.9868, 40.7298], e: [-73.9915, 40.7317], f: [-73.9987, 40.7348], g: [-74.0024, 40.7343], h: [-73.9997, 40.7386], n: [-73.9936, 40.7360],
  o: [-73.9922, 40.7379], x: [-73.9835, 40.7343] });

const LANDS: Record<string, Section[]> = {
  columbia: [
    morningside('columbia', 'Morningside Heights', 'crse', [-73.9639, 40.8082], ['cathedral', 'manhattanville'], { name: '116 St–Columbia University', lines: ['1'] }),
    morningside('cathedral', 'Cathedral Parkway', 'apbqrc', [-73.9660, 40.8052], ['columbia'], { name: 'Cathedral Pkwy (110 St)', lines: ['1'] }),
    morningside('manhattanville', 'Manhattanville', 'estiuvg', [-73.9606, 40.8126], ['columbia'], { name: '125 St', lines: ['1'] }),
  ],
  nyu: [
    village('washsq', 'Washington Square', 'akbefg', [-74.0005, 40.7323], ['astor', 'union'], { name: 'West 4 St–Washington Sq', lines: ['A', 'C', 'E', 'B', 'D', 'F', 'M'] }),
    village('astor', 'Astor Place', 'bcmde', [-73.9911, 40.7301], ['washsq', 'union'], { name: 'Astor Pl', lines: ['6'] }),
    village('union', 'Union Square', 'gfedxonh', [-73.9905, 40.7340], ['washsq', 'astor'], { name: '14 St–Union Sq', lines: ['4', '5', '6', 'L', 'N', 'Q', 'R', 'W'] }),
  ],
  'cornell-tech': [
    island('roosevelt', 'Roosevelt Island', 'abcdefgh', [-73.9552, 40.7562], ['lex63', 'queensbridge'], { name: 'Roosevelt Island', lines: ['F', 'M'] }),
    island('lex63', 'Upper East Side', 'ijkl', [-73.9665, 40.7647], ['roosevelt'], { name: 'Lexington Av/63 St', lines: ['F', 'M', 'Q'] }),
    island('queensbridge', 'Long Island City', 'mnop', [-73.9426, 40.7540], ['roosevelt'], { name: '21 St–Queensbridge', lines: ['F', 'M'] }),
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

// A place off the map. A plan at a known place that lies in no section is shown at that place alone
// (public/demo/mockups-map-solo.html): a round sheet of its own that leads nowhere, in place of drawing the town between.
const SOLO = 'solo:', SOLO_METRES = 170;
export const isSolo = (sectionId: string) => sectionId.startsWith(SOLO);
/** The sheet for one place off the map: about a block and a half across, named for the place. Plans at one place share it. */
export function soloOf(name: string, at: Point): Section {
  const k = 111320 * Math.cos(at[1] * Math.PI / 180);
  return { id: `${SOLO}${at.join()}`, name, rest: at, next: [], ring: Array.from({ length: 48 }, (_, n): Point => { const a = n * Math.PI / 24; return [at[0] + SOLO_METRES * Math.cos(a) / k, at[1] + SOLO_METRES * Math.sin(a) / 110540]; }) };
}
// The stops beside the places off the map that Cornell people in the city go to: the ILR School's building at
// 570 Lexington Avenue, and the Cornell Club on 44th Street. Coordinates are OpenStreetMap's, looked up 2026-11-19.
const STOPS: (Stop & { at: Point })[] = [
  { name: 'Lexington Av/53 St', lines: ['E', 'F', 'M', '6'], at: [-73.9706019, 40.7582149] },
  { name: 'Grand Central–42 St', lines: ['4', '5', '6', '7'], at: [-73.9768249, 40.7517716] }];
/** The known stop a place off the map is by, when one is within a short walk of it. */
export const stopNear = (at: Point): Stop | null => STOPS.map(stop => ({ stop, far: metres(at, stop.at) })).filter(each => each.far < 500).sort((a, b) => a.far - b.far)[0]?.stop ?? null;

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
/** A land whose sections are subway stops (New York). Its ways on are a departure board under the map. */
export const rides = (land: readonly Section[]) => land.some(each => !!each.stop);
/**
 * The departure board under the map (public/demo/mockups-map-ring.html, 2): every section one stop from where you stand,
 * counted from you and not from the section on screen, so nobody hops board to board across the city. The one on screen
 * is left off. West to east, the way they lie.
 */
export function nextStops(land: readonly Section[], standing: string, view: string): Section[] {
  const home = byId(land, standing);
  if (!home) return [];
  return [home, ...home.next.flatMap(id => byId(land, id) ?? [])].filter(each => each.id !== view).sort((a, b) => middle(a.ring)[0] - middle(b.ring)[0]);
}
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
