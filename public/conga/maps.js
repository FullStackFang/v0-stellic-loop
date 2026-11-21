// The grounds the game is played on: the real outlines of each campus's sections, copied from lib/campus/sections.ts
// (a plain page cannot import it), and the landmarks that stand on them. When the game moves into the app it reads the
// sections directly. Points here are [longitude, latitude]; ground() turns them into game units.
//
// A landmark is [kind, name, latitude, longitude, metres across, metres deep, degrees turned clockwise from north].
// Halls, towers and water are solid: everyone walks around them. Greens and fields are painted on the ground.
// Positions and sizes are OpenStreetMap's, looked up 2026-11-19, with sizes trimmed from its bounding boxes.
// Those marked "placed by hand" were not found there and are put where I know them to be.

import { AT } from './scenery.js';

const PAD = 14; // how far outside a solid landmark's wall a walker's middle is stopped, so faces do not overlap the wall
const TOWER = 48; // a tower is drawn this many game units across whatever the map's scale, or it would be a dot
// Each landmark that stands up is drawn as a toy (scripts/pickup-art.ts, packed by scripts/conga-scenery.mjs). One toy
// can stand for several halls.
export const TOYS = { 'Willard Straight': 'stonehall', 'Sage Chapel': 'chapel', 'Duffield Hall': 'glasshall', 'Statler': 'brickhall', 'Barton Hall': 'armory', 'Lynah Rink': 'rink',
  'Bailey Hall': 'dome', 'Mann Library': 'brickhall', 'Johnson Museum': 'museum', 'Risley': 'castle', 'Donlon': 'dorm', 'RPCC': 'dorm', 'Noyes': 'dorm', 'Becker House': 'brickhall',
  'CTB': 'cafe', 'McGraw Tower': 'clocktower', 'Bloomberg Center': 'bloomberg', 'Tata': 'tata', 'The House': 'tower', 'Verizon Center': 'glasshall', 'Graduate': 'tower',
  'Tram': 'station', 'Subway': 'subway', 'Smallpox Hospital': 'ruin', 'Blackwell House': 'farmhouse', 'Good Shepherd': 'stonechapel', 'The Octagon': 'octagon', 'Lighthouse': 'lighthouse', 'Beebe Lake': 'pond' };
const POND = 220; // a pond's toy is drawn this wide
// Every building is drawn the same size, on every ground: HALL across, or narrower for a toy taller than it is wide, so
// none stands more than 1.25 times HALL high. Kept small enough that the packed pictures stay sharp on screen.
const HALL = 150;
const toyWidth = toy => { const [, , w, h] = AT[toy]; return h / w > 1.25 ? HALL * 1.25 / (h / w) : HALL; };
/** A tower's toy is drawn this much wider than the tower is on the ground, so it stands up tall above the line. */
export const TALL = 2.3;
/** How wide a tree's toy is drawn, from the tree's size. */
export const treeWidth = r => r * 4.2;
// Trees stand on the ground as things to walk round, like halls. A tree is solid over the whole of its toy, from its foot
// to its crown, so walking into one is bumping into it.
const chance = (thing, k) => { const v = Math.sin(thing.x * 12.9898 + thing.y * 4.1414 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
const TREE_GAP = 115; // trees on a lawn keep this far apart, so a line fits between any two
function treesOn(thing) {
  const { w, h } = thing, cos = Math.cos(thing.turn), sin = Math.sin(thing.turn), spots = [];
  const place = (px, py, r) => spots.push({ x: thing.x + px * cos - py * sin, y: thing.y + px * sin + py * cos, r, kind: 'tree' });
  if (thing.name === 'Four Freedoms Park') {
    // Kahn's park: a lawn narrowing to the point of the island between two rows of trees.
    const narrow = w * 0.16, edge = f => w / 2 - (w / 2 - narrow) * f;
    for (let k = 0; k < 9; k++) { const f = 0.04 + k * 0.095, y = -h / 2 + h * f; place(-edge(f) + 4, y, 9); place(edge(f) - 4, y, 9); }
    return spots;
  }
  // Round the edge, as round a quad, leaving the lawn open.
  const round = 2 * (w + h);
  for (let k = 0; k < 8 + round / 60; k++) { // plenty of tries: the gap between trees decides how many stand
    let d = chance(thing, k) * round, x, y;
    const deep = 20 + chance(thing, k + 50) * 16;
    if (d < w) [x, y] = [d - w / 2, -h / 2 + deep]; else if ((d -= w) < h) [x, y] = [w / 2 - deep, d - h / 2]; else if ((d -= h) < w) [x, y] = [w / 2 - d, h / 2 - deep]; else [x, y] = [-w / 2 + deep, h / 2 - (d - w)];
    place(Math.max(-w / 2 + 20, Math.min(w / 2 - 20, x)), Math.max(-h / 2 + 20, Math.min(h / 2 - 20, y)), 9 + chance(thing, k + 9) * 6);
  }
  return spots.filter((spot, n) => spots.slice(0, n).every(other => Math.hypot(other.x - spot.x, other.y - spot.y) > TREE_GAP));
}
/** What a tree is solid over: an oval round its toy as drawn, with room for a face, so a head stops at its edge. */
function crown({ x, y, r, kind }) {
  const wide = treeWidth(r), [, , w, h] = AT[kind], high = wide * h / w, mid = y + r * 0.6 - high * 0.3, rx = wide * 0.42 + 10, ry = high * 0.42 + 10;
  return Array.from({ length: 12 }, (_, n) => [x + Math.cos(n * Math.PI / 6) * rx, mid + Math.sin(n * Math.PI / 6) * ry]);
}
/** The part of the page a solid landmark covers, as [left, top, right, bottom]: a toy from its foot up to its top. */
function cover(thing) {
  if (thing.toy) {
    const [, , w, h] = AT[thing.toy], wide = thing.kind === 'tower' ? thing.w * TALL : thing.w, foot = thing.kind === 'tower' ? thing.y + 12 : thing.y + thing.h / 2;
    return [thing.x - wide / 2, foot - wide * h / w, thing.x + wide / 2, foot];
  }
  const half = Math.max(thing.w, thing.h) / 2;
  return [thing.x - half, thing.y - half, thing.x + half, thing.y + half];
}
const SPREAD = 60; // the least room between any two landmarks as drawn, so a line can pass between them
const onLand = (rings, x, y) => rings.some(ring => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit; } return hit; });
/** Moves landmarks that crowd each other apart, a little at a time, until each has room round it; one that would leave the
 * ground stays put and its neighbour moves the whole way instead. Positions stay near the real ones. */
function spread(things, rings) {
  const stand = things.filter(thing => SOLID.includes(thing.kind));
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 0; i < stand.length; i++) for (let j = i + 1; j < stand.length; j++) {
      const a = stand[i], b = stand[j], A = cover(a), B = cover(b);
      const across = Math.min(A[2], B[2]) - Math.max(A[0], B[0]) + SPREAD, down = Math.min(A[3], B[3]) - Math.max(A[1], B[1]) + SPREAD;
      if (across <= 0 || down <= 0) continue;
      const [dx, dy] = across < down ? [Math.sign(b.x - a.x || 1) * across, 0] : [0, Math.sign((B[3] - A[3]) || 1) * down];
      const aFree = onLand(rings, a.x - dx / 2, a.y - dy / 2), bFree = onLand(rings, b.x + dx / 2, b.y + dy / 2);
      const share = aFree && bFree ? 0.5 : aFree ? 1 : 0;
      if (!aFree && !bFree) continue;
      a.x -= dx * share; a.y -= dy * share; b.x += dx * (1 - share); b.y += dy * (1 - share); moved = true;
    }
    if (!moved) break;
  }
}
const SOLID = ['hall', 'tower', 'water'];
const ROOM = 1.5; // every ground is drawn this much bigger than it first was, for longer lines. Cars take this much longer to cross, at the same speed.
/** A lake's shore wanders in and out of its oval: how far out it is, as a share of the oval, at each angle round it. */
export const shore = a => 1 + 0.09 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2.3);

/** `scale` is game units to a metre: it sets how much room the lines have, not the shape. */
function ground(name, scale, sections, landmarks = [], more = () => ({})) {
  const all = sections.flatMap(section => section.ring), lons = all.map(p => p[0]), lats = all.map(p => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2, lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, east = 111320 * Math.cos(lat0 * Math.PI / 180) * scale, north = 110540 * scale;
  const at = ([lon, lat]) => [(lon - lon0) * east, (lat0 - lat) * north];
  const things = landmarks.map(([kind, label, lat, lon, across, deep, turned = 0]) => {
    if (kind === 'bridge' || kind === 'road') return { kind, name: label, from: at([lon, lat]), to: at([deep, across]), w: turned * scale }; // a bridge is two ends and a width
    const [x, y] = at([lon, lat]), size = kind === 'tower' ? Array(2).fill(TOYS[label] ? toyWidth(TOYS[label]) / TALL : TOWER) : [across * scale, deep * scale], turn = turned * Math.PI / 180;
    // A hall is drawn as a toy building standing up off the ground, seen from the front. What it stands on is a plain box,
    // square to the page, as wide as the toy and half as deep, so the toy covers it.
    if (kind === 'hall' && TOYS[label]) {
      const wide = toyWidth(TOYS[label]);
      return { kind, name: label, toy: TOYS[label], x, y, w: wide, h: wide / 2, turn: 0 };
    }
    // A pond is a toy too, standing like a big hall: what it stands on is the oval of its stones.
    if (kind === 'water' && TOYS[label]) return { kind, name: label, toy: TOYS[label], x, y, w: POND, h: POND * 0.47, turn: 0 };
    return { kind, name: label, toy: TOYS[label], x, y, w: size[0], h: size[1], turn };
  });
  const outline = ({ kind, x, y, w, h, turn, toy }) => {
    const a = w / 2 + PAD, b = h / 2 + PAD, cos = Math.cos(turn), sin = Math.sin(turn);
    const far = kind === 'water' && !toy ? shore : () => 1;
    const corners = kind === 'hall' ? [[-a, -b], [a, -b], [a, b], [-a, b]] : Array.from({ length: 30 }, (_, n) => [Math.cos(n * Math.PI / 15) * a * far(n * Math.PI / 15), Math.sin(n * Math.PI / 15) * b * far(n * Math.PI / 15)]);
    return corners.map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
  };
  const extra = more(at, scale), rings = sections.map(section => section.ring.map(at));
  spread(things, rings);
  const trees = things.filter(thing => thing.kind === 'green').flatMap(treesOn);
  // Roosevelt Island's cherry trees: a row just in from the west shore.
  if (extra.axis != null) {
    const a = extra.axis * Math.PI / 180, edge = rings[0], mid = [edge.reduce((sum, q) => sum + q[0], 0) / edge.length, edge.reduce((sum, q) => sum + q[1], 0) / edge.length];
    edge.forEach((from, i) => { const to = edge[(i + 1) % edge.length], far = Math.hypot(to[0] - from[0], to[1] - from[1]);
      for (let d = 40; d < far; d += 160) { const x = from[0] + (to[0] - from[0]) * d / far, y = from[1] + (to[1] - from[1]) * d / far; if ((x - mid[0]) * Math.cos(a) + (y - mid[1]) * Math.sin(a) < -60) trees.push({ x: x + Math.cos(a) * 38, y: y + Math.sin(a) * 38, r: 10, kind: 'blossom' }); } });
  }
  // A tree that a moved landmark now stands over is left out.
  const standing = things.filter(thing => SOLID.includes(thing.kind)).map(cover);
  const kept = trees.filter(tree => standing.every(([l, t, r, b]) => tree.x < l - 30 || tree.x > r + 30 || tree.y < t - 30 || tree.y > b + 40));
  return { name, scale, ...extra, rings, holes: [...things.filter(thing => SOLID.includes(thing.kind)).map(outline), ...kept.map(crown)], things, trees: kept,
    zones: sections.filter(section => section.name).map(section => ({ name: section.name, at: at(section.rest) })) };
}
const cut = corners => (name, ring, rest) => ({ name, ring: [...ring].map(key => corners[key]), rest });

const ithaca = cut({ a: [-76.5005, 42.4378], b: [-76.4908, 42.4370], c: [-76.4915, 42.4410], d: [-76.4910, 42.4437], e: [-76.5008, 42.4432], f: [-76.4856, 42.4443], g: [-76.4802, 42.4436], h: [-76.4806, 42.4380], i: [-76.4852, 42.4362],
  j: [-76.4962, 42.4462], k: [-76.4952, 42.4510], l: [-76.4898, 42.4518], m: [-76.4893, 42.4472], o: [-76.4845, 42.4528], p: [-76.4796, 42.4516], q: [-76.4792, 42.4472], r: [-76.4722, 42.4530], s: [-76.4728, 42.4585], t: [-76.4800, 42.4600], u: [-76.4850, 42.4570], v: [-76.4708, 42.4482], w: [-76.4725, 42.4428] });
const island = cut({ a: [-73.9622, 40.7492], b: [-73.9570, 40.7500], c: [-73.9478, 40.7600], d: [-73.9385, 40.7722], e: [-73.9395, 40.7740], f: [-73.9440, 40.7715], g: [-73.9530, 40.7625], h: [-73.9600, 40.7545] });
const GRID = 38; // Roosevelt Island's buildings stand along the island, which runs this many degrees east of north

export const MAPS = {
  cornell: ground('Ithaca', 1.15 * ROOM, [
    ithaca('Downtown', 'abcde', [-76.4968, 42.4418]), ithaca('Collegetown', 'bihgfdc', [-76.4862, 42.4424]), ithaca('West Campus', 'djklm', [-76.4930, 42.4500]),
    ithaca('Central Campus', 'dfgqpolm', [-76.4868, 42.4502]), ithaca('North Campus', 'oprstu', [-76.4790, 42.4548]), ithaca('Ag Quad', 'gwvrpq', [-76.4758, 42.4500])], [
    // The bus up the hill from the Commons to campus. The real route 10 winds; this one is drawn straight, by hand.
    ['road', 'Route 10', 42.43960, -76.49790, 42.44620, -76.48360, 58],
    ['green', 'Arts Quad', 42.4489, -76.4843, 150, 230], // placed by hand
    ['green', 'Libe Slope', 42.44869, -76.48661, 110, 260],
    ['green', 'Botanic Gardens', 42.44951, -76.47250, 200, 170],
    ['green', 'The Commons', 42.43957, -76.49793, 180, 44],
    ['green', 'DeWitt Park', 42.44189, -76.49854, 83, 83],
    ['field', 'Schoellkopf Field', 42.44402, -76.47836, 80, 140],
    ['water', 'Beebe Lake', 42.45125, -76.47576, 400, 150],
    ['tower', 'McGraw Tower', 42.44757, -76.48504],
    ['hall', 'Willard Straight', 42.44647, -76.48561, 58, 66],
    ['hall', 'Sage Chapel', 42.44720, -76.48446, 48, 34],
    ['hall', 'Duffield Hall', 42.44453, -76.48260, 53, 112],
    ['hall', 'Statler', 42.44638, -76.48223, 46, 77],
    ['hall', 'Barton Hall', 42.44594, -76.48071, 127, 76],
    ['hall', 'Lynah Rink', 42.44580, -76.47752, 77, 86],
    ['hall', 'Bailey Hall', 42.44930, -76.48012, 47, 55],
    ['hall', 'Mann Library', 42.44887, -76.47615, 99, 71],
    ['hall', 'Johnson Museum', 42.45072, -76.48621, 40, 63],
    ['hall', 'Risley', 42.45305, -76.48176, 83, 76],
    ['hall', 'Donlon', 42.45502, -76.47778, 68, 60],
    ['hall', 'RPCC', 42.45603, -76.47750, 65, 50],
    ['hall', 'Noyes', 42.44652, -76.48803, 40, 42],
    ['hall', 'Becker House', 42.44824, -76.48947, 97, 92],
    ['hall', 'CTB', 42.44225, -76.48547, 40, 40]],
    // The bus climbs slowly from the Commons, lets its riders off by Statler, and rolls back down empty.
    at => ({ shuttles: [{ name: 'Bus', kind: 'bus', stop: 'Statler', from: at([-76.49790, 42.43960]), to: at([-76.48400, 42.44602]), off: at([-76.48340, 42.44650]), riders: 18, ride: 36 * ROOM, stay: 5, away: 5 }] })),
  // One section, tip to tip, so it carries no section name.
  'cornell-tech': ground('Roosevelt Island', 2 * ROOM, [island('', 'abcdefgh', [-73.9552, 40.7562])], [
    // From the Manhattan end, over the island beside the tram station, and on the same line to Queens.
    ['bridge', 'Queensboro Bridge', 40.75971, -73.96129, 40.75302, -73.94593, 34],
    // Main Street, from the subway up to the Octagon, a little west of the buildings that front it. Placed by hand.
    ['road', 'Main Street', 40.75870, -73.95400, 40.76890, -73.94450, 12],
    ['green', 'Four Freedoms Park', 40.75066, -73.96045, 90, 190, GRID],
    ['green', 'Southpoint Park', 40.75300, -73.95820, 130, 170, GRID],
    ['field', 'Firefighters Field', 40.75773, -73.95293, 60, 95, GRID],
    ['green', 'Lighthouse Park', 40.77180, -73.94120, 100, 170, GRID],
    ['hall', 'Smallpox Hospital', 40.75159, -73.95961, 40, 45, GRID],
    ['hall', 'Bloomberg Center', 40.75579, -73.95620, 40, 100, GRID],
    ['hall', 'Tata', 40.75524, -73.95551, 40, 62, GRID],
    ['hall', 'The House', 40.75575, -73.95492, 28, 55, GRID],
    ['hall', 'Verizon Center', 40.7555900, -73.9556069, 24, 26, GRID],
    ['hall', 'Graduate', 40.7560214, -73.9553915, 24, 28, GRID],
    ['hall', 'Tram', 40.7573223, -73.9540884, 26, 26, GRID],
    ['hall', 'Subway', 40.7591449, -73.9532600, 26, 26, GRID],
    ['hall', 'Blackwell House', 40.76033, -73.95113, 30, 30, GRID],
    ['hall', 'Good Shepherd', 40.7615, -73.9502, 30, 40, GRID], // placed by hand
    ['hall', 'The Octagon', 40.7689, -73.9438, 60, 60, GRID], // placed by hand
    ['tower', 'Lighthouse', 40.77284, -73.94018]],
    at => ({ water: true, axis: GRID,
      // The tram comes over very slowly from Second Avenue beside the bridge, lets its riders off on the plaza just past the
      // station, and goes back empty. Its Manhattan end is placed by hand.
      shuttles: [{ name: 'Tram', stop: 'the station', from: at([-73.96413, 40.76127]), to: at([-73.9540884, 40.7573223]), off: at([-73.95383, 40.75757]), riders: 18, ride: 32 * ROOM, stay: 5, away: 5 }] })),
};
