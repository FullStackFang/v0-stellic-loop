// Looks up a campus's public places on OpenStreetMap and prints them as SQL rows for campus_place (openspec
// campus-plan-place-and-time, design D3): every named place inside the campus's map sections that people can meet at.
// Free (the public Overpass API), no key. Read the output by eye before it goes into a migration.
//   node scripts/campus-places-osm.mjs <campus-slug> [section-id ...]
// With no section ids, every section of the campus is asked. Each row is (name, other_names, kind, lat, lon): the other
// name is the short @name (the name's first word that is not "the", e.g. "Southpoint Park" → 'southpoint'); fix by hand
// where two places would share one. Homes, dormitories, schools, plant rooms, garages and toilets are left out.
import { landOf } from '../lib/campus/sections.ts';

const [slug, ...only] = process.argv.slice(2);
const land = slug ? landOf(slug) : null;
if (!land) { console.error('node scripts/campus-places-osm.mjs <campus-slug> [section-id ...]  (a campus with sections in lib/campus/sections.ts)'); process.exit(1); }
const sections = land.filter(section => !only.length || only.includes(section.id));
if (!sections.length) { console.error(`No such section. ${slug} has: ${land.map(section => section.id).join(', ')}`); process.exit(1); }

// What counts as a place to meet, by kind. The first test a place passes gives its kind.
const FILTERS = [
  'nwr["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|food_court|biergarten)$"]["name"]',
  'nwr["leisure"~"^(park|garden|playground|dog_park|picnic_site)$"]["name"]',
  'nwr["leisure"~"^(pitch|sports_centre|stadium|track|fitness_centre|swimming_pool)$"]["name"]',
  'nwr["amenity"~"^(library|community_centre|theatre|arts_centre|cinema|townhall|place_of_worship|marketplace)$"]["name"]',
  'nwr["tourism"~"^(museum|attraction|viewpoint|hotel|gallery)$"]["name"]',
  'nwr["historic"]["name"]', 'nwr["railway"="station"]["name"]', 'nwr["aerialway"="station"]["name"]', 'nwr["public_transport"="station"]["name"]',
];
const KINDS = [
  [tags => /^(restaurant|cafe|bar|pub|fast_food|ice_cream|food_court|biergarten)$/.test(tags.amenity ?? ''), 'food'],
  [tags => /^(pitch|sports_centre|stadium|track|fitness_centre|swimming_pool)$/.test(tags.leisure ?? ''), 'sport'],
  [tags => /^(park|garden|playground|dog_park|picnic_site)$/.test(tags.leisure ?? '') || tags.tourism === 'viewpoint', 'park'],
];
const kindOf = tags => KINDS.find(([test]) => test(tags))?.[1] ?? 'building';
const NOT_PUBLIC = tags => /^(residential|apartments|dormitory|house|garage|garages|service|industrial)$/.test(tags.building ?? '')
  || /^(school|toilets|parking|kindergarten|college|university|clinic|hospital)$/.test(tags.amenity ?? '') || !!tags.man_made || tags.power || tags.access === 'private';

const poly = section => section.ring.map(([lon, lat]) => `${lat} ${lon}`).join(' ');
const query = `[out:json][timeout:90];(${sections.flatMap(section => FILTERS.map(filter => `${filter}(poly:"${poly(section)}");`)).join('')});out tags center;`;

// The public servers are often busy: each is tried in turn, and the round again after a longer wait (as scripts/conga-osm.mjs).
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function ask() {
  let last = '';
  for (let tries = 0; tries < 3; tries++) {
    for (const server of SERVERS) {
      const answer = await fetch(server, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'campus-places' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(60_000) }).catch(error => ({ ok: false, status: error.message, text: async () => '' }));
      const text = await answer.text();
      if (answer.status === 400) { console.error(`The query was refused: ${text.slice(0, 300)}`); process.exit(1); }
      const got = answer.ok ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (got && !got.remark) return got;
      last = `${server} said ${answer.status}: ${(got?.remark ?? text).slice(0, 160)}`;
    }
    await new Promise(done => setTimeout(done, 2000 * 2 ** tries));
  }
  console.error(last); process.exit(1);
}
const { elements } = await ask();

const tagOf = name => (name.toLowerCase().replace(/^the\s+/, '').match(/[a-z0-9]+/)?.[0] ?? '').slice(0, 30);
const sql = text => `'${text.replace(/'/g, "''")}'`;
const seen = new Map();
for (const el of elements) {
  const tags = el.tags ?? {}, lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (!tags.name || NOT_PUBLIC(tags) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  // One row per name: a station mapped as a node and a way is one place.
  if (!seen.has(tags.name.toLowerCase())) seen.set(tags.name.toLowerCase(), { name: tags.name, kind: kindOf(tags), lat, lon, id: `${el.type}/${el.id}` });
}
const rows = [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
const tags = new Map();
for (const row of rows) tags.set(tagOf(row.name), [...(tags.get(tagOf(row.name)) ?? []), row.name]);
console.log(`-- ${rows.length} places for ${slug} (${sections.map(section => section.id).join(', ')}), from OpenStreetMap ${new Date().toISOString().slice(0, 10)}.`);
for (const row of rows) {
  const tag = tagOf(row.name), clash = tags.get(tag).length > 1 ? ` -- @${tag} also: ${tags.get(tag).filter(name => name !== row.name).join(', ')}` : '';
  console.log(`  (${sql(row.name)}, array[${sql(tag)}], ${sql(row.kind)}, ${row.lat.toFixed(7)}, ${row.lon.toFixed(7)}), -- OSM ${row.id}${clash}`);
}
