// Turns what scripts/campus-places-osm.mjs found into SQL the founder can run to load a campus's places in one go.
//   node scripts/campus-places-osm.mjs cornell | node scripts/campus-places-seed.mjs cornell > supabase/optional-migrations/campus-places/cornell.sql
// It is kept out of supabase/migrations so the tests' database does not start with a town in it.
// The places come from OpenStreetMap, free and with no key. Read the file by eye before running it.
// What this changes from the found rows:
//   - no other names. The found short names ("first", "cornell", "hotel") are shared by several places, and an other
//     name is both offered as people type and matched inside an event's place text, so a shared one sends people to
//     the wrong spot. Nicknames are added by hand in the admin page, from the names people type.
//   - places nobody meets at are left out (LEFT_OUT below), and a place the campus already has, by its name or by
//     one of its other names, is left as it is.
import { readFileSync } from 'node:fs';

const slug = process.argv[2];
if (!/^[a-z0-9-]+$/.test(slug ?? '')) { console.error('node scripts/campus-places-osm.mjs <campus-slug> | node scripts/campus-places-seed.mjs <campus-slug>'); process.exit(1); }

/** Worship, places to sleep, offices of the town, and things to look at and not sit at. A cafe called a temple stays. */
const LEFT_OUT = /\b(church|temple|society|hotel|inn|marriott|statue|monument|bust|memorial|courthouse|city hall|town hall|white house|pop-up)\b/i, NO_ROOM = /ghost kitchen/i;
const ROW = /^\s*\('((?:[^']|'')*)', array\[[^\]]*\], '(food|park|sport|building)', (-?[\d.]+), (-?[\d.]+)\)/;

const kept = [], dropped = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
  const found = ROW.exec(line);
  if (!found) continue;
  // Two spellings of one name come joined by a semicolon: the first is kept.
  const name = found[1].split(';')[0].trim();
  (NO_ROOM.test(name) || (found[2] !== 'food' && LEFT_OUT.test(name)) ? dropped : kept).push({ name, kind: found[2], lat: found[3], lon: found[4] });
}
if (!kept.length) { console.error('No rows read. Pipe the output of scripts/campus-places-osm.mjs in.'); process.exit(1); }

console.log(`-- ${kept.length} public places for the ${slug} campus, from OpenStreetMap ${new Date().toISOString().slice(0, 10)}
-- (scripts/campus-places-osm.mjs ${slug} | scripts/campus-places-seed.mjs ${slug}). Safe to run twice: a place the campus
-- already has, by name or by another name, is left as it is. Rollback: delete the rows by name.
-- Left out, ${dropped.length}: ${dropped.map(each => each.name.replace(/''/g, "'")).join(', ') || 'none'}.
-- One statement, so it all loads or none of it does.
do $seed$ begin
  set local lock_timeout = '5s';
  create temp table place_seed(name text, kind text, lat double precision, lon double precision) on commit drop;
  insert into place_seed values
${kept.map(each => `    ('${each.name}', '${each.kind}', ${each.lat}, ${each.lon})`).join(',\n')};
  insert into campus_place(campus_id, name, lat, lon)
  select c.id, s.name, s.lat, s.lon from campus c, place_seed s
  where c.slug = '${slug}'
    and not exists (select 1 from campus_place x where x.campus_id = c.id and (lower(x.name) = lower(s.name) or lower(s.name) in (select lower(other) from unnest(x.other_names) other)));
  -- What each place is, where the campus_place.kind column is there (migration campus_plan_place_and_time).
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campus_place' and column_name = 'kind') then
    execute 'update campus_place x set kind = s.kind from campus c, place_seed s where c.slug = ' || quote_literal('${slug}') || ' and x.campus_id = c.id and lower(x.name) = lower(s.name) and x.kind is null';
  end if;
  drop table place_seed;
end $seed$;`);
