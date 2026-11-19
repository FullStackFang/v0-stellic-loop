// The grounds the game is played on: the real outlines of each campus's sections, copied from lib/campus/sections.ts
// (a plain page cannot import it), and the landmarks that stand on them. When the game moves into the app it reads the
// sections directly. Points here are [longitude, latitude]; ground() turns them into game units.
//
// A landmark is [kind, name, latitude, longitude, metres across, metres deep, degrees turned clockwise from north].
// Halls, towers and water are solid: everyone walks around them. Greens and fields are painted on the ground.
// Positions and sizes are OpenStreetMap's, looked up 2026-11-19, with sizes trimmed from its bounding boxes.
// Those marked "placed by hand" were not found there and are put where I know them to be.

const PAD = 14; // how far outside a solid landmark's wall a walker's middle is stopped, so faces do not overlap the wall
const TOWER = 48; // a tower is drawn this many game units across whatever the map's scale, or it would be a dot
const SOLID = ['hall', 'tower', 'water'];

/** `scale` is game units to a metre: it sets how much room the lines have, not the shape. */
function ground(name, scale, sections, landmarks = [], more = () => ({})) {
  const all = sections.flatMap(section => section.ring), lons = all.map(p => p[0]), lats = all.map(p => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2, lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, east = 111320 * Math.cos(lat0 * Math.PI / 180) * scale, north = 110540 * scale;
  const at = ([lon, lat]) => [(lon - lon0) * east, (lat0 - lat) * north];
  const things = landmarks.map(([kind, label, lat, lon, across, deep, turned = 0]) => {
    if (kind === 'bridge' || kind === 'road') return { kind, name: label, from: at([lon, lat]), to: at([deep, across]), w: turned * scale }; // a bridge is two ends and a width
    const [x, y] = at([lon, lat]), size = kind === 'tower' ? [TOWER, TOWER] : [across * scale, deep * scale];
    return { kind, name: label, x, y, w: size[0], h: size[1], turn: turned * Math.PI / 180 };
  });
  const outline = ({ kind, x, y, w, h, turn }) => {
    const a = w / 2 + PAD, b = h / 2 + PAD, cos = Math.cos(turn), sin = Math.sin(turn);
    const corners = kind === 'hall' ? [[-a, -b], [a, -b], [a, b], [-a, b]] : Array.from({ length: 20 }, (_, n) => [Math.cos(n * Math.PI / 10) * a, Math.sin(n * Math.PI / 10) * b]);
    return corners.map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
  };
  return { name, ...more(at, scale), rings: sections.map(section => section.ring.map(at)), holes: things.filter(thing => SOLID.includes(thing.kind)).map(outline), things,
    zones: sections.filter(section => section.name).map(section => ({ name: section.name, at: at(section.rest) })) };
}
const cut = corners => (name, ring, rest) => ({ name, ring: [...ring].map(key => corners[key]), rest });

const ithaca = cut({ a: [-76.5005, 42.4378], b: [-76.4908, 42.4370], c: [-76.4915, 42.4410], d: [-76.4910, 42.4437], e: [-76.5008, 42.4432], f: [-76.4856, 42.4443], g: [-76.4802, 42.4436], h: [-76.4806, 42.4380], i: [-76.4852, 42.4362],
  j: [-76.4962, 42.4462], k: [-76.4952, 42.4510], l: [-76.4898, 42.4518], m: [-76.4893, 42.4472], o: [-76.4845, 42.4528], p: [-76.4796, 42.4516], q: [-76.4792, 42.4472], r: [-76.4722, 42.4530], s: [-76.4728, 42.4585], t: [-76.4800, 42.4600], u: [-76.4850, 42.4570], v: [-76.4708, 42.4482], w: [-76.4725, 42.4428] });
const island = cut({ a: [-73.9622, 40.7492], b: [-73.9570, 40.7500], c: [-73.9478, 40.7600], d: [-73.9385, 40.7722], e: [-73.9395, 40.7740], f: [-73.9440, 40.7715], g: [-73.9530, 40.7625], h: [-73.9600, 40.7545] });
const GRID = 38; // Roosevelt Island's buildings stand along the island, which runs this many degrees east of north

export const MAPS = {
  cornell: ground('Ithaca', 1.15, [
    ithaca('Downtown', 'abcde', [-76.4968, 42.4418]), ithaca('Collegetown', 'bihgfdc', [-76.4862, 42.4424]), ithaca('West Campus', 'djklm', [-76.4930, 42.4500]),
    ithaca('Central Campus', 'dfgqpolm', [-76.4868, 42.4502]), ithaca('North Campus', 'oprstu', [-76.4790, 42.4548]), ithaca('Ag Quad', 'gwvrpq', [-76.4758, 42.4500])], [
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
    ['hall', 'CTB', 42.44225, -76.48547, 40, 40]]),
  // One section, tip to tip, so it carries no section name.
  'cornell-tech': ground('Roosevelt Island', 2, [island('', 'abcdefgh', [-73.9552, 40.7562])], [
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
      // The tram comes over from Second Avenue beside the bridge. Its Manhattan end is placed by hand.
      tram: { from: at([-73.96413, 40.76127]), to: at([-73.9540884, 40.7573223]) },
      // It lets its riders off on the plaza just past the station.
      drops: [{ name: 'Tram', at: at([-73.95383, 40.75757]), every: 40, count: 9 }] })),
};
