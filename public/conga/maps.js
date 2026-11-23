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
  'Tram': 'station', 'Subway': 'subway', 'Smallpox Hospital': 'ruin', 'Blackwell House': 'farmhouse', 'Good Shepherd': 'stonechapel', 'The Octagon': 'octagon', 'Lighthouse': 'lighthouse',
  'FDR Four Freedoms': 'fourfreedoms',
  // Columbia, with its own toys (drawn 2026-11-23, /demo/mockups-conga-columbia-art.html), and Manhattanville's.
  'Low Library': 'lowlibrary', 'Butler Library': 'butler', 'Cathedral': 'cathedral', 'Alma Mater': 'almamater', 'Kravis Hall': 'kravis', 'Geffen Hall': 'geffen', 'The Forum': 'glasshall',
  'St. Paul\'s Chapel': 'chapel', 'Pupin Hall': 'brickhall', 'Lerner Hall': 'glasshall', 'John Jay Hall': 'dorm', 'Barnard Hall': 'brickhall', 'Milstein Center': 'glasshall',
  'East Campus': 'tower', '116 St': 'subway', 'Riverside Church': 'riverside',
  // NYU, with its own toys (drawn 2026-11-23, /demo/mockups-conga-nyu-art.html); the rest are stand-ins.
  'Washington Square Arch': 'wsqarch', 'The Fountain': 'wsqfountain', 'Bobst Library': 'bobst', 'Judson Church': 'judson', 'Silver Center': 'silver', 'Kimmel Center': 'kimmel',
  'Stern': 'stern', 'Paulson Center': 'paulson', 'Vanderbilt Hall': 'brickhall', 'Lipton Hall': 'dorm', 'W 4 St': 'subway', 'Silver Towers': 'tower', 'Hayden Hall': 'dorm',
  'Tisch School': 'glasshall', '8 St': 'subway', 'Brittany Hall': 'dorm', 'Founders Hall': 'tower', 'Palladium': 'dorm' };
// A lake with a shore drawn by hand, on a box 690 by 260: Beebe Lake, traced from the real one (/demo/mockups-conga-ithaca-sizes.html).
// Narrow at the west end where it spills into the gorge, the south shore bellying out towards the wider east end.
const SHORES = { 'Beebe Lake': [[-345, -18], [-305, -44], [-230, -58], [-130, -74], [-20, -94], [100, -110], [210, -116], [300, -96], [345, -46], [348, 16], [312, 70], [240, 106], [140, 122], [40, 110], [-50, 84], [-150, 58], [-250, 38], [-322, 22]] };
/** Points round a lake's hand-drawn shore, smoothed (a closed Catmull-Rom curve) and placed on the ground: `sx` and `sy`
 * shrink it about its middle (for the felt layers inside it), and `out` pushes every point that far out from the water. */
export function shoreline(thing, out = 0, sx = 1, sy = 1) {
  const P = SHORES[thing.name].map(([px, py]) => [thing.x + px * thing.w / 690 * sx, thing.y + py * thing.h / 260 * sy]), n = P.length, line = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]];
    for (let s = 0; s < 8; s++) { const u = s / 8, u2 = u * u, u3 = u2 * u;
      line.push([0, 1].map(k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u3))); }
  }
  if (!out) return line;
  return line.map(([px, py], i) => { const [ax, ay] = line[(i - 1 + line.length) % line.length], [bx, by] = line[(i + 1) % line.length], l = Math.hypot(bx - ax, by - ay) || 1; return [px + (by - ay) / l * out, py - (bx - ax) / l * out]; });
}
// A lawn or field is at least this much each way (about two road widths), so none is thinner than the road beside it or
// smaller than the buildings round it, however small the real one is.
const OPEN = 260;
// Buildings come in two sizes on every ground (/demo/mockups-conga-sizes.html, A): a LANDMARK stands out at
// LANDMARK_HALL across, every other building is HALL, both bigger than the bus (120). A toy taller than it is wide is
// drawn narrower, so none stands more than 1.25 times its width high. Kept small enough that the packed pictures stay
// sharp on screen.
const HALL = 150, LANDMARK_HALL = 195;
const LANDMARKS = new Set(['McGraw Tower', 'Sage Chapel', 'Willard Straight', 'Barton Hall', 'Bailey Hall', 'Johnson Museum', 'Bloomberg Center', 'Lighthouse', 'Smallpox Hospital', 'FDR Four Freedoms',
  'Low Library', 'Butler Library', 'Cathedral', 'Riverside Church', 'Kravis Hall', 'Washington Square Arch', 'Bobst Library', 'Paulson Center']);
// A statue stands smaller than a hall, in front of the building it belongs to.
const STATUE = 100, STATUES = new Set(['Alma Mater']);
const toyWidth = label => { const [, , w, h] = AT[TOYS[label]], size = LANDMARKS.has(label) ? LANDMARK_HALL : STATUES.has(label) ? STATUE : HALL; return h / w > 1.25 ? size * 1.25 / (h / w) : size; };
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
  // Round the edge, as round a quad, leaving the lawn open. On the Arts Quad, none stands on the paths crossing it corner to corner.
  // On Washington Square, none stands on its paths, on the one up to the Arch, or on the plaza round the fountain.
  const crossed = ['Arts Quad', 'Washington Square Park'].includes(thing.name), square = thing.name === 'Washington Square Park';
  const round = 2 * (w + h), onPath = (px, py) => crossed && Math.min(Math.abs(px * h - py * w), Math.abs(px * h + py * w)) / Math.hypot(w, h) < 45
    || square && (Math.abs(px) < 45 && py < 0 || Math.hypot(px, py) < h * 0.26 + 40);
  for (let k = 0; k < 8 + round / 60; k++) { // plenty of tries: the gap between trees decides how many stand
    let d = chance(thing, k) * round, x, y;
    const deep = 20 + chance(thing, k + 50) * 16;
    if (d < w) [x, y] = [d - w / 2, -h / 2 + deep]; else if ((d -= w) < h) [x, y] = [w / 2 - deep, d - h / 2]; else if ((d -= h) < w) [x, y] = [w / 2 - d, h / 2 - deep]; else [x, y] = [-w / 2 + deep, h / 2 - (d - w)];
    const px = Math.max(-w / 2 + 20, Math.min(w / 2 - 20, x)), py = Math.max(-h / 2 + 20, Math.min(h / 2 - 20, y));
    if (!onPath(px, py)) place(px, py, 9 + chance(thing, k + 9) * 6);
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
  if (SHORES[thing.name]) { const line = shoreline(thing), xs = line.map(p => p[0]), ys = line.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  const half = Math.max(thing.w, thing.h) / 2;
  return [thing.x - half, thing.y - half, thing.x + half, thing.y + half];
}
// Names painted into the ground (index.html groundName): an area's at this size, a lawn's or a field's at this one.
export const ZONE_NAME = 40, PLACE_NAME = 22;
/** The part of the page a painted name covers, from its middle: Archivo Black is about 0.62 of its size a letter. */
const nameBox = (text, x, y, size) => { const half = text.length * size * 0.32 + 8; return [x - half, y - size * 0.75, x + half, y + size * 0.75]; };
const overlaps = (A, B) => A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3];
/** The part of the page a tree's toy covers, from its foot up to its crown. */
const treeBox = ({ x, y, r, kind }) => { const wide = treeWidth(r), [, , w, h] = AT[kind], foot = y + r * 0.6; return [x - wide / 2, foot - wide * h / w, x + wide / 2, foot]; };
/** The nearest spot to (x, y), on the ground, where a name no landmark covers can be painted: rings outward from it. */
function clearOf(standing, rings, text, x, y, size) {
  for (let ring = 0; ring < 16; ring++) for (let n = 0, many = Math.max(1, ring * 8); n < many; n++) {
    const a = n / many * Math.PI * 2, px = x + Math.cos(a) * ring * size * 1.1, py = y + Math.sin(a) * ring * size * 0.8, box = nameBox(text, px, py, size);
    if (onLand(rings, px, py) && standing.every(cover => !overlaps(cover, box))) return [px, py];
  }
  return [x, y];
}
const SPREAD = 60; // the least room between any two landmarks as drawn, so a line can pass between them
// Ithaca's central campus stands close together; there the least room is wide enough for a long line to turn in, not just pass.
const ITHACA_SPREAD = 200;
const onLand = (rings, x, y) => rings.some(ring => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit; } return hit; });
/** Moves landmarks that crowd each other apart, a little at a time, until each has room round it; one that would leave the
 * ground stays put and its neighbour moves the whole way instead. Positions stay near the real ones. */
function spread(things, rings, room) {
  const stand = things.filter(thing => SOLID.includes(thing.kind));
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 0; i < stand.length; i++) for (let j = i + 1; j < stand.length; j++) {
      const a = stand[i], b = stand[j], A = cover(a), B = cover(b);
      const across = Math.min(A[2], B[2]) - Math.max(A[0], B[0]) + room, down = Math.min(A[3], B[3]) - Math.max(A[1], B[1]) + room;
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
function ground(name, scale, sections, landmarks = [], more = () => ({}), room = SPREAD) {
  const all = sections.flatMap(section => section.ring), lons = all.map(p => p[0]), lats = all.map(p => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2, lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, east = 111320 * Math.cos(lat0 * Math.PI / 180) * scale, north = 110540 * scale;
  const at = ([lon, lat]) => [(lon - lon0) * east, (lat0 - lat) * north];
  const things = landmarks.map(([kind, label, lat, lon, across, deep, turned = 0]) => {
    if (kind === 'bridge' || kind === 'road') return { kind, name: label, from: at([lon, lat]), to: at([deep, across]), w: turned * scale }; // a bridge is two ends and a width
    const [x, y] = at([lon, lat]), size = kind === 'tower' ? Array(2).fill(TOYS[label] ? toyWidth(label) / TALL : TOWER) : [across * scale, deep * scale], turn = turned * Math.PI / 180;
    // A hall is drawn as a toy building standing up off the ground, seen from the front. What it stands on is a plain box,
    // square to the page, as wide as the toy and half as deep, so the toy covers it.
    if (kind === 'hall' && TOYS[label]) {
      const wide = toyWidth(label);
      return { kind, name: label, toy: TOYS[label], x, y, w: wide, h: wide / 2, turn: 0 };
    }
    // A lake with a hand-drawn shore is sewn into the mat in felt (index.html feltLake), at its size on the map.
    if (kind === 'water' && SHORES[label]) return { kind, name: label, x, y, w: size[0], h: size[1], turn: 0, shore: true };
    if (kind === 'green' || kind === 'field') return { kind, name: label, toy: TOYS[label], x, y, w: Math.max(OPEN, size[0]), h: Math.max(OPEN, size[1]), turn };
    return { kind, name: label, toy: TOYS[label], x, y, w: size[0], h: size[1], turn };
  });
  const outline = thing => {
    if (SHORES[thing.name]) return shoreline(thing, PAD);
    const { kind, x, y, w, h, turn, toy } = thing, a = w / 2 + PAD, b = h / 2 + PAD, cos = Math.cos(turn), sin = Math.sin(turn);
    const far = kind === 'water' && !toy ? shore : () => 1;
    const corners = kind === 'hall' ? [[-a, -b], [a, -b], [a, b], [-a, b]] : Array.from({ length: 30 }, (_, n) => [Math.cos(n * Math.PI / 15) * a * far(n * Math.PI / 15), Math.sin(n * Math.PI / 15) * b * far(n * Math.PI / 15)]);
    return corners.map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
  };
  const extra = more(at, scale), rings = sections.map(section => section.ring.map(at));
  spread(things, rings, room);
  const trees = things.filter(thing => thing.kind === 'green').flatMap(treesOn);
  // Roosevelt Island's cherry trees: a row just in from the west shore.
  if (extra.axis != null) {
    const a = extra.axis * Math.PI / 180, edge = rings[0], mid = [edge.reduce((sum, q) => sum + q[0], 0) / edge.length, edge.reduce((sum, q) => sum + q[1], 0) / edge.length];
    edge.forEach((from, i) => { const to = edge[(i + 1) % edge.length], far = Math.hypot(to[0] - from[0], to[1] - from[1]);
      for (let d = 40; d < far; d += 160) { const x = from[0] + (to[0] - from[0]) * d / far, y = from[1] + (to[1] - from[1]) * d / far; if ((x - mid[0]) * Math.cos(a) + (y - mid[1]) * Math.sin(a) < -60) trees.push({ x: x + Math.cos(a) * 38, y: y + Math.sin(a) * 38, r: 10, kind: 'blossom' }); } });
  }
  // A tree that a moved landmark now stands over is left out.
  const standing = things.filter(thing => SOLID.includes(thing.kind)).map(cover);
  let kept = trees.filter(tree => standing.every(([l, t, r, b]) => tree.x < l - 30 || tree.x > r + 30 || tree.y < t - 30 || tree.y > b + 40));
  // A name painted into the ground is never under something standing up: it moves to the nearest spot no building covers,
  // and a tree still standing on it is left out.
  const zones = sections.filter(section => section.name).map(section => ({ name: section.name, at: clearOf(standing, rings, section.name, ...at(section.rest), ZONE_NAME) }));
  for (const thing of things) if (!thing.from && !thing.toy) thing.label = clearOf(standing, rings, thing.name, thing.x, thing.y, PLACE_NAME);
  const names = [...zones.map(zone => nameBox(zone.name, ...zone.at, ZONE_NAME)), ...things.filter(thing => thing.label).map(thing => nameBox(thing.name, ...thing.label, PLACE_NAME))];
  kept = kept.filter(tree => names.every(box => !overlaps(box, treeBox(tree))));
  return { name, scale, ...extra, rings, holes: [...things.filter(thing => SOLID.includes(thing.kind)).map(outline), ...kept.map(crown)], things, trees: kept, zones };
}
const cut = corners => (name, ring, rest) => ({ name, ring: [...ring].map(key => corners[key]), rest });

const ithaca = cut({ a: [-76.5005, 42.4378], b: [-76.4908, 42.4370], c: [-76.4915, 42.4410], d: [-76.4910, 42.4437], e: [-76.5008, 42.4432], f: [-76.4856, 42.4443], g: [-76.4802, 42.4436], h: [-76.4806, 42.4380], i: [-76.4852, 42.4362],
  j: [-76.4962, 42.4462], k: [-76.4952, 42.4510], l: [-76.4898, 42.4518], m: [-76.4893, 42.4472], o: [-76.4845, 42.4528], p: [-76.4796, 42.4516], q: [-76.4792, 42.4472], r: [-76.4722, 42.4530], s: [-76.4728, 42.4585], t: [-76.4800, 42.4600], u: [-76.4850, 42.4570], v: [-76.4708, 42.4482], w: [-76.4725, 42.4428] });
const island = cut({ a: [-73.9622, 40.7492], b: [-73.9570, 40.7500], c: [-73.9478, 40.7600], d: [-73.9385, 40.7722], e: [-73.9395, 40.7740], f: [-73.9440, 40.7715], g: [-73.9530, 40.7625], h: [-73.9600, 40.7545] });
const GRID = 38; // Roosevelt Island's buildings stand along the island, which runs this many degrees east of north
// Morningside Heights, cut along Manhattan's street grid (29° east of north): corners at street ends, counted in metres
// east of Broadway (Claremont −170, Amsterdam 300, Morningside Drive 480), one block 80 metres, from Broadway and 116th.
const morningside = cut({ a: [-73.97068, 40.80844], b: [-73.96704, 40.80691], h: [-73.96382, 40.81134], c: [-73.96336, 40.81197], d: [-73.96700, 40.81351],
  e: [-73.96528, 40.80616], i: [-73.96482, 40.80679], f: [-73.96390, 40.80806], g: [-73.96206, 40.81059], j: [-73.96171, 40.80548], k: [-73.95895, 40.80927],
  l: [-73.96355, 40.80294], m: [-73.96168, 40.80215], n: [-73.95708, 40.80848], q: [-73.95662, 40.80912], o: [-73.95877, 40.80093], p: [-73.95371, 40.80789],
  u: [-73.96164, 40.81041], r: [-73.95560, 40.81865], s: [-73.95964, 40.82037] });
const AVENUES = 29; // Manhattan's grid runs this many degrees east of north
// NYU round Washington Square, cut along the same grid, counted in metres from the Arch: across the grid (east-ish) and up
// it (uptown). The park's square and the halls round it; the law school's corner west and south of it; Bobst, Stern and
// Paulson south; Broadway and Astor Place east, with a strip up to Palladium; University Place north to Union Square.
const village = cut({ a: [-74.00212, 40.73067], b: [-73.99880, 40.72927], c: [-74.00041, 40.72707], d: [-73.99668, 40.72551], e: [-73.99438, 40.72865],
  f: [-73.99168, 40.72752], g: [-73.98743, 40.73333], h: [-73.98930, 40.73411], i: [-73.98775, 40.73624], j: [-73.99148, 40.73780], k: [-73.99743, 40.73188],
  l: [-73.99868, 40.73241], m: [-74.00034, 40.73310], n: [-73.99977, 40.73091], p: [-73.99645, 40.72952], q: [-73.99536, 40.73101], r: [-73.99484, 40.73172],
  s: [-73.99194, 40.73050], t: [-73.99811, 40.73022] });

export const MAPS = {
  cornell: ground('Ithaca', 1.15 * ROOM, [
    ithaca('Downtown', 'abcde', [-76.4968, 42.4418]), ithaca('Collegetown', 'bihgfdc', [-76.4862, 42.4424]), ithaca('West Campus', 'djklm', [-76.4930, 42.4500]),
    ithaca('Central Campus', 'dfgqpolm', [-76.4868, 42.4502]), ithaca('North Campus', 'oprstu', [-76.4790, 42.4548]), ithaca('Ag Quad', 'gwvrpq', [-76.4758, 42.4500])], [
    // The bus up the hill from the Commons to campus. The real route 10 winds; this one is drawn straight, by hand.
    ['road', 'Route 10', 42.43960, -76.49790, 42.44620, -76.48360, 58],
    // Sizes on campus, side by side (/demo/mockups-conga-ithaca-sizes.html): the Arts Quad is the biggest lawn, wider than
    // Libe Slope beside it, and Schoellkopf is a football field's shape. Both are drawn about twice their real size, like the halls.
    ['green', 'Arts Quad', 42.44899, -76.48397, 220, 255], // placed by hand
    ['green', 'Libe Slope', 42.44869, -76.48661, 110, 260],
    ['green', 'Botanic Gardens', 42.44951, -76.47250, 200, 170],
    ['green', 'The Commons', 42.43957, -76.49793, 180, 44],
    ['green', 'DeWitt Park', 42.44189, -76.49854, 83, 83],
    ['field', 'Schoellkopf Field', 42.44459, -76.47874, 151, 220], // moved a little north-west by hand, so its length stays on the ground
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
    at => ({ shuttles: [{ name: 'Bus', kind: 'bus', stop: 'Statler', from: at([-76.49790, 42.43960]), to: at([-76.48400, 42.44602]), off: at([-76.48340, 42.44650]), riders: 18, ride: 36 * ROOM, stay: 5, away: 5 }] }), ITHACA_SPREAD),
  // One section, tip to tip, so it carries no section name.
  'cornell-tech': ground('Roosevelt Island', 2 * ROOM, [island('', 'abcdefgh', [-73.9552, 40.7562])], [
    // From the Manhattan end, over the island beside the tram station, and on the same line to Queens.
    ['bridge', 'Queensboro Bridge', 40.75971, -73.96129, 40.75302, -73.94593, 34],
    // Main Street, from the subway up to the Octagon, a little west of the buildings that front it. Placed by hand.
    ['road', 'Main Street', 40.75870, -73.95400, 40.76890, -73.94450, 12],
    ['green', 'Four Freedoms Park', 40.75014, -73.96098, 90, 190, GRID], // its point runs down to the island's tip
    ['green', 'Southpoint Park', 40.75300, -73.95820, 130, 170, GRID],
    ['field', 'Firefighters Field', 40.75773, -73.95293, 60, 95, GRID],
    ['green', 'Lighthouse Park', 40.77180, -73.94120, 100, 170, GRID],
    // The granite room at the point of Four Freedoms Park, at the narrow end of its lawn.
    ['hall', 'FDR Four Freedoms', 40.74937, -73.96177, 60, 60, GRID],
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
  // Columbia's Morningside campus with Barnard across Broadway, Riverside Park to the west and Morningside Park to the east
  // (scripts/conga-osm.mjs, 2026-11-23). Lawns no OSM name covers are placed by hand.
  columbia: ground('Morningside', 2.4 * ROOM, [
    morningside('Riverside', 'abhcd', [-73.96702, 40.81021]), morningside('Barnard', 'beifgh', [-73.96432, 40.80907]), morningside('Main Campus', 'ijkgf', [-73.96119, 40.80898]),
    morningside('East Campus', 'lmnkj', [-73.96077, 40.80508]), morningside('Morningside', 'mopqn', [-73.95677, 40.80629]),
    morningside('Manhattanville', 'chgurs', [-73.95980, 40.81650])], [
    ['road', 'Broadway', 40.80679, -73.96482, 40.81780, -73.95677, 40], // from 114th, where there is ground on both sides of it, to 132nd
    ['road', 'Amsterdam Avenue', 40.80553, -73.96167, 40.80922, -73.95899, 30], // from 114th: south of it the ground ends at the avenue
    ['green', 'South Lawn', 40.80702, -73.96262, 120, 70, AVENUES], // placed by hand, between College Walk and Butler
    ['green', 'Futter Field', 40.80962, -73.96446, 60, 90, AVENUES], // placed by hand, west of Barnard Hall and Milstein so neither stands on it
    ['green', 'Riverside Park', 40.81000, -73.96760, 150, 500, AVENUES], // its part beside Barnard; the real park runs on for miles
    ['green', 'Morningside Park', 40.80502, -73.95769, 220, 700, AVENUES], // placed by hand inside OSM's park, which runs further north
    ['hall', 'Low Library', 40.80822, -73.96184, 60, 61],
    ['hall', 'Butler Library', 40.80637, -73.96319, 80, 51],
    ['hall', 'St. Paul\'s Chapel', 40.80784, -73.96093, 43, 25],
    ['hall', 'Pupin Hall', 40.80998, -73.96137, 61, 19],
    ['hall', 'Lerner Hall', 40.80680, -73.96404, 64, 65],
    ['hall', 'John Jay Hall', 40.80602, -73.96227, 62, 28], // 15 metres north of OSM's, so its foot stays on the ground at 114th
    ['hall', 'Barnard Hall', 40.80914, -73.96394, 39, 53],
    ['hall', 'Milstein Center', 40.80967, -73.96365, 26, 72],
    ['hall', 'East Campus', 40.80720, -73.95909, 50, 73],
    ['hall', 'Cathedral', 40.80390, -73.96190, 183, 76], // St. John the Divine, placed by hand: OSM gives it no name
    ['hall', '116 St', 40.80722, -73.96367, 26, 26], // the station's entrance, east of Broadway's felt road, clear of the stop
    ['tower', 'Riverside Church', 40.81205, -73.96453],
    ['tower', 'Alma Mater', 40.80772, -73.96212], // on Low's steps, facing College Walk
    // Manhattanville: Columbia Business School's two halls, and the Forum at 125th.
    ['hall', 'Kravis Hall', 40.81824, -73.95952, 63, 69],
    ['hall', 'Geffen Hall', 40.81772, -73.95825, 67, 72],
    ['hall', 'The Forum', 40.81633, -73.95850, 61, 67]], // moved in by hand from the corner of 120th, which is off this ground
    // The 1 train comes up Broadway from 114th, lets its riders off at 116 St, and goes back down empty. Its stop is a
    // little north of the station, so the badge sits between Broadway's felt and Low Library, clear of South Lawn's trees.
    at => ({ shuttles: [{ name: '1 train', kind: 'train', road: 'Broadway', stop: '116 St', from: at([-73.96482, 40.80679]), to: at([-73.96316, 40.80907]), off: at([-73.96250, 40.80879]), riders: 18, ride: 8 * ROOM, stay: 5, away: 5 }] })), // quicker than the Ithaca bus, over a shorter run
  // NYU round Washington Square (scripts/conga-osm.mjs, 2026-11-23). Its own toys drawn 2026-11-23 (/demo/mockups-conga-nyu-art.html).
  nyu: ground('Washington Square', 2.4 * ROOM, [
    village('', 'npqkl', [-73.99763, 40.73084]), // no name of its own: the park's says it
    village('Law School', 'abtnlm', [-74.00095, 40.73079]), village('South', 'bcdept', [-73.99751, 40.72770]),
    village('Broadway', 'pefghsrq', [-73.99212, 40.72914]), village('University Place', 'kqrshij', [-73.99211, 40.73324])], [
    ['road', 'University Place', 40.73121, -73.99535, 40.73538, -73.99230, 20], // from Washington Square to Union Square; placed by hand on the grid
    ['green', 'Washington Square Park', 40.73084, -73.99763, 300, 150, AVENUES], // a little shallower than OSM's, so the Arch stands clear at its north edge
    ['green', 'Union Square', 40.73604, -73.99046, 120, 200, AVENUES], // placed by hand: OSM names no park here
    ['green', 'Washington Square Village', 40.72824, -73.99780, 72, 130, AVENUES], // the garden between its two slabs, placed by hand
    ['hall', 'Washington Square Arch', 40.73156, -73.99710, 19, 8], // just north of the lawn, where Fifth Avenue ends, on the path up from the fountain
    ['hall', 'The Fountain', 40.73084, -73.99763, 23, 23], // on the plaza in the middle of the park
    ['hall', 'Bobst Library', 40.72943, -73.99722, 61, 66],
    ['hall', 'Kimmel Center', 40.72978, -73.99792, 39, 66],
    ['hall', 'Stern', 40.72878, -73.99622, 50, 22], // Tisch Hall, Stern's undergraduate hall
    ['hall', 'Judson Church', 40.73019, -73.99867, 22, 32], // 15 metres west of OSM's, clear of Kimmel
    ['hall', 'Vanderbilt Hall', 40.73030, -73.99941, 60, 60], // the law school, placed by hand: OSM gives it no name
    ['hall', 'Lipton Hall', 40.73163, -73.99954, 47, 23],
    ['hall', 'W 4 St', 40.73163, -74.00074, 0, 0], // the station's entrance on Sixth Avenue
    ['hall', 'Paulson Center', 40.72657, -73.99748, 59, 114],
    ['hall', 'Silver Towers', 40.72728, -73.99796, 30, 30], // placed by hand
    ['hall', 'Hayden Hall', 40.72770, -73.99547, 56, 59],
    ['hall', 'Silver Center', 40.73034, -73.99559, 37, 60],
    ['hall', 'Tisch School', 40.72961, -73.99384, 61, 31],
    ['hall', '8 St', 40.73033, -73.99263, 0, 0], // 8th Street–NYU, on Broadway
    ['hall', 'Brittany Hall', 40.73210, -73.99174, 50, 28],
    ['hall', 'Founders Hall', 40.73206, -73.98932, 38, 43],
    ['hall', 'Palladium', 40.73331, -73.98840, 46, 60]],
    // The NYU bus comes down University Place from Union Square, lets its riders off beside Washington Square, and goes back up empty.
    at => ({ shuttles: [{ name: 'NYU bus', kind: 'bus', road: 'University Place', stop: 'Washington Sq', from: at([-73.99230, 40.73538]), to: at([-73.99535, 40.73121]), off: at([-73.99432, 40.73104]), riders: 18, ride: 20 * ROOM, stay: 5, away: 5 }] })),
};

// The other lines on each ground (index.html plays BOTS of them). In live play these are people; here each one is a bot
// with its own nerve and temper, named for a group on that campus. Every ground needs at least ten.
export const GROUPS = { cornell: ['Donlon 2F', 'CS 2110', 'Team 4', 'Risley', 'Big Red Band', 'Club Frisbee', 'Glee Club', 'West Campus', 'Olin late shift', 'Slope Day crew', 'Ag Quad lab', 'Collegetown', 'Rowing', 'Hotelies', 'Mews Hall', 'Dairy Bar line', 'Physics 1112'],
  'cornell-tech': ['Bloomberg 2F', 'Tata studio', 'The House 12', 'Studio team 4', 'Johnson MBA', 'Tram regulars', 'Jacobs', 'Health Tech', 'Connective Media', 'Urban Tech', 'Cafe line', 'Runway', 'Startup Studio', 'Ferry crew', 'Bloomberg 3F', 'Run club', 'Verizon EC'],
  columbia: ['John Jay 9', 'Lit Hum', 'CU Band', 'Butler 209', 'Core crew', 'Barnard Bears', 'Spectator', 'Varsity Show', 'Lerner late night', 'Ferris line', 'SEAS 1st years',
    'SIPA', 'Bacchanal crew', 'Carman 5', 'Frontiers', 'Hartley 4', 'Lightweight crew'],
  nyu: ['Bobst 4F', 'Stern UG', 'Tisch Drama', 'Weinstein 9', 'Rubin 6', 'Third North', 'Palladium gym', 'Courant CS', 'Gallatin', 'WSN', 'Brittany 3', 'Kimmel late night',
    'Founders 11', 'Lipton crew', 'NYU Swim', 'Writing the Essay', 'Violets fans'] };

// The school each ground belongs to (a campus's slug, as lib/campus/schools.ts schoolOf gives it), and the line the
// place picker says about it (index.html, /demo/mockups-conga-where.html A). A player's own schools' grounds are free;
// another school's come with Ink+.
// Each school's own animal, by its place on the game's animal sheet (public/animals 38 to 41, 1 on): first in the
// start card's row on that school's ground, and the animal you play as there unless you picked your own seat.
export const MASCOTS = { cornell: 38, columbia: 39, nyu: 40, cuny: 41 };
export const PLACES = { cornell: { school: 'cornell', line: 'The hill, Collegetown, downtown' }, 'cornell-tech': { school: 'cornell', line: 'Cornell Tech and the tram' },
  columbia: { school: 'columbia', line: 'College Walk, Barnard, Manhattanville' }, nyu: { school: 'nyu', line: 'Washington Square, Bobst, Union Square' } };
// Who may play which ground (openspec conga-ground-gate), read by the game's picker and by the board (lib/campus/conga-board.ts)
// so the two cannot disagree. One ground is open to everyone, signed in or not: Cornell's hill, where Loopd began. A
// school's grounds are its own people's. Every ground comes with Ink, and Ink+ which holds it (an admin has it).
export const OPEN_GROUND = 'cornell';
/** Whether `player` may play the ground `id`. `player`: { schools, ink }, or null for someone signed out. */
export const mayPlay = (player, id) => !!PLACES[id] && (!!player?.ink || id === OPEN_GROUND || (player?.schools ?? []).includes(PLACES[id].school));
