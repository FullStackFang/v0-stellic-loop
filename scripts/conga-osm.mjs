// Looks up Conga landmarks on OpenStreetMap and prints them as rows for public/conga/maps.js: where each one is and how
// big, so a new campus's ground is not placed by hand. Free (the public Overpass API), no key.
//   node scripts/conga-osm.mjs <south,west,north,east> [--turn 29] --list
//   node scripts/conga-osm.mjs <south,west,north,east> [--turn 29] "Butler Library" "Low Library=Low Memorial Library" ...
// --list prints every named building, park, field, statue and station in the box, biggest first: start there, then keep
// the rows wanted. With names, a name is matched exactly as OSM spells it (its index makes that fast), inside the box; one
// not found says so. "Label=OSM name" prints the row under the shorter label.
// --turn is the degrees the campus's street grid runs clockwise from north (Manhattan's is 29): sizes are then measured
// along the grid, as the row's last number turns them, instead of along north and east, which would make them too big.
// Each row is [kind, label, latitude, longitude, metres across, metres deep(, turn)], the kind guessed from OSM's tags.
// A single point (a statue, a station entrance) is 0 by 0 and its kind is only a guess: set both by hand.
// A name with more than one match prints every one, the biggest first, with its OSM id; keep the right one.

const args = process.argv.slice(2), at = args.indexOf('--turn'), turn = at < 0 ? 0 : Number(args.splice(at, 2)[1]);
const listing = args.includes('--list'), [box, ...wanted] = args.filter(arg => arg !== '--list');
if (!box || !wanted.length === !listing || box.split(',').length !== 4 || !Number.isFinite(turn)) {
  console.error('node scripts/conga-osm.mjs <south,west,north,east> [--turn degrees] (--list | "Name" "Label=OSM name" ...)');
  process.exit(1);
}
const names = wanted.map(each => { const [label, osm = label] = each.split('='); return { label: label.trim(), osm: osm.trim() }; });
const quote = text => text.replace(/[\\"]/g, '\\$&');
const LISTED = ['way["building"]["name"]', 'relation["building"]["name"]', 'nwr["leisure"~"^(park|garden|pitch|stadium)$"]["name"]', 'nwr["natural"="water"]["name"]',
  'node["tourism"="artwork"]["name"]', 'node["historic"]["name"]', 'nwr["railway"="station"]["name"]', 'nwr["man_made"="tower"]["name"]'];
const query = `[out:json][timeout:90];(${(listing ? LISTED : names.map(({ osm }) => `nwr["name"="${quote(osm)}"]`)).map(filter => `${filter}(${box});`).join('')});out tags geom;`;

// The public servers are often busy: each is tried in turn, and the round again after a longer wait. A query the server
// refuses (400, a bad box) is not tried again, and an answer cut short by the server's own timeout (its `remark`) counts
// as busy, so a slow server never reads as "nothing found".
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function ask() {
  let last = '';
  for (let tries = 0; tries < 3; tries++) {
    for (const server of SERVERS) {
      const answer = await fetch(server, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'conga-map-builder' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(60_000) }).catch(error => ({ ok: false, status: error.message, text: async () => '' }));
      const text = await answer.text();
      if (answer.status === 400) { console.error(`The query was refused (check the box): ${text.slice(0, 300)}`); process.exit(1); }
      const got = answer.ok ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (got && !got.remark) return got;
      last = `${server} said ${answer.status}: ${(got?.remark ?? text).slice(0, 160)}`;
    }
    await new Promise(done => setTimeout(done, 2000 * 2 ** tries));
  }
  console.error(last); process.exit(1);
}
const { elements } = await ask();

/** Every point of an element's outline, [lon, lat]. A relation is the outer ways it is made of. */
const points = el => el.type === 'node' ? [[el.lon, el.lat]] : el.type === 'way' ? (el.geometry ?? []).map(p => [p.lon, p.lat])
  : (el.members ?? []).filter(m => m.role !== 'inner').flatMap(m => (m.geometry ?? []).map(p => [p.lon, p.lat]));
const KINDS = [
  [tags => tags.natural === 'water' || tags.water || tags.leisure === 'swimming_area', 'water'],
  [tags => tags.leisure === 'pitch' || tags.leisure === 'stadium' || tags.leisure === 'track', 'field'],
  [tags => tags.man_made === 'tower' || tags.tower || tags.building === 'tower' || tags.historic === 'memorial' && !tags.building || tags.tourism === 'artwork', 'tower'],
  [tags => tags.building || tags.amenity === 'place_of_worship' || tags.railway === 'station' || tags.public_transport === 'station', 'hall'],
  [tags => tags.leisure === 'park' || tags.leisure === 'garden' || tags.landuse === 'grass' || tags.highway === 'pedestrian' || tags.place === 'square', 'green'],
];
const kindOf = tags => KINDS.find(([test]) => test(tags))?.[1] ?? 'hall';
const a = turn * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), round = (v, n) => Number(v.toFixed(n));

/** Its middle and its size along the grid, in metres. */
function measure(outline) {
  const lat0 = outline.reduce((s, p) => s + p[1], 0) / outline.length, lon0 = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const east = 111320 * Math.cos(lat0 * Math.PI / 180), north = 110540;
  // Into the ground's own frame (x east, y south), then turned with the grid, as maps.js ground() turns a landmark's box.
  const uv = outline.map(([lon, lat]) => { const x = (lon - lon0) * east, y = (lat0 - lat) * north; return [x * cos + y * sin, -x * sin + y * cos]; });
  const us = uv.map(p => p[0]), vs = uv.map(p => p[1]), mu = (Math.min(...us) + Math.max(...us)) / 2, mv = (Math.min(...vs) + Math.max(...vs)) / 2;
  const x = mu * cos - mv * sin, y = mu * sin + mv * cos;
  return { lat: lat0 - y / north, lon: lon0 + x / east, across: Math.max(...us) - Math.min(...us), deep: Math.max(...vs) - Math.min(...vs) };
}

const measured = elements.filter(el => el.tags?.name).map(el => ({ el, ...measure(points(el)) })).filter(each => Number.isFinite(each.lat)).sort((x, y) => y.across * y.deep - x.across * x.deep);
const rowOf = ({ el, lat, lon, across, deep }, label = el.tags.name) => {
  const row = [kindOf(el.tags), label, round(lat, 5), round(lon, 5), Math.round(across), Math.round(deep), ...(turn ? [turn] : [])];
  return `[${row.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(', ')}],`;
};
if (listing) for (const each of measured) console.log(`${rowOf(each)} // OSM ${each.el.type}/${each.el.id}`);
for (const { label, osm } of names) {
  const found = measured.filter(each => each.el.tags.name === osm);
  if (!found.length) { console.log(`// ${label}: not found as "${osm}" in the box; place by hand`); continue; }
  for (const [n, each] of found.entries()) console.log(`${n ? '// ' : ''}${rowOf(each, label)} // OSM ${each.el.type}/${each.el.id}${found.length > 1 ? (n ? ' (another match)' : ' (biggest of ' + found.length + ')') : ''}`);
}
