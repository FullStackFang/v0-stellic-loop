// A first load of what is on around Cornell Tech, to seed the New York campus (openspec loop-nyc-campus, design D9a).
// It reads the Roosevelt Islander's public events page once: the events that page serves to any visitor, about five
// weeks' worth. It is run by hand, not on a schedule, and it is not a feed: nothing here keeps the events fresh.
//
//   node --conditions=react-server --import tsx scripts/campus-seed-island.ts            shows what it would write, and where
//   node --conditions=react-server --import tsx scripts/campus-seed-island.ts --yes      writes it
//
// What is taken is the facts of each event: its name, when, and where (venue, address, coordinates). Not its picture
// and not its write-up. Each event is kept under the source "Roosevelt Islander", turned off as a feed so the hourly
// calendar reader leaves it alone. Safe to run twice: an event already there is updated, a venue already there is kept.
import { pathToFileURL } from 'node:url';
import type { Db } from '../lib/db';
import { zoned } from '../lib/campus/time';
import { goodFor } from '../lib/campus/words';

const CAMPUS = 'cornell-tech', TZ = 'America/New_York', SOURCE = 'Roosevelt Islander';
const PAGE = 'https://rooseveltislander.com/events/', DATA = 'https://portal.cityspark.com/PortalScripts/Roosevelt';

export type IslandEvent = { id: string; title: string; host: string | null; startsAt: string; endsAt: string | null; venue: string | null; placeText: string | null; at: [number, number] | null };

/** The object the page's script sets, found by matching braces. Nothing in the script is run. */
function served(script: string): { Events?: unknown } {
  const start = script.indexOf('{', script.indexOf('cSparkLocals'));
  if (start < 0) throw new Error('The page no longer carries its events the way this script reads them.');
  let depth = 0, inText = false, escaped = false;
  for (let at = start; at < script.length; at++) {
    const char = script[at];
    if (inText) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inText = false; continue; }
    if (char === '"') inText = true; else if (char === '{') depth++; else if (char === '}' && --depth === 0) return JSON.parse(script.slice(start, at + 1));
  }
  throw new Error('The page no longer carries its events the way this script reads them.');
}

const text = (value: unknown, most: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, most) || null : null;
// The page writes local time with a Z on it: the Saturday market is at "08:00:00Z" and opens at eight in the morning.
const local = (value: unknown, timed: boolean) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value) ? zoned(TZ, timed ? value.slice(0, 16) : `${value.slice(0, 10)}T00:00`).toISOString() : null;
// One plaza under two names.
const venueName = (name: string | null) => name && /motorgate plaza/i.test(name) ? 'Motorgate Plaza' : name;
const GENERIC = /^(website|more info(rmation)?|info|tickets?|register|rsvp|details|link|event( page)?|facebook|instagram|google form)$/i;

/** The events in the page's script that have not ended, as Loop keeps them. */
export function islandEvents(script: string, now: Date): IslandEvent[] {
  const list = served(script).Events;
  if (!Array.isArray(list)) return [];
  const found = new Map<string, IslandEvent>();
  for (const raw of list as Record<string, unknown>[]) {
    const id = text(raw.Id, 500), title = text(raw.Name, 200), timed = raw.HasTime !== false && raw.AllDay !== true, startsAt = local(raw.DateStart, timed);
    if (!id || !title || !startsAt) continue;
    const ends = local(raw.DateEnd, timed), endsAt = ends && ends > startsAt ? ends : null;
    if (Date.parse(endsAt ?? startsAt) + (endsAt ? 0 : 2 * 3600000) < now.getTime()) continue;
    const venue = venueName(text(raw.Venue, 120)), address = [text(raw.Address, 120), text(raw.CityState, 80)].filter(Boolean).join(', ');
    const lat = Number(raw.latitude), lon = Number(raw.longitude), links = Array.isArray(raw.Links) ? raw.Links as { name?: unknown }[] : [];
    const host = text(links[0]?.name, 200);
    found.set(id, { id, title, startsAt, endsAt, venue, host: host && !GENERIC.test(host) ? host : null,
      placeText: [text(raw.Venue, 120), address].filter(Boolean).join(', ').slice(0, 300) || null,
      at: Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0 ? [lon, lat] : null });
  }
  return [...found.values()].sort((a, b) => a.startsAt < b.startsAt ? -1 : 1);
}

/** Writes the events, and a named place for each venue that has coordinates, so the events stand on the map. */
export async function seedIsland(db: Db, events: readonly IslandEvent[]): Promise<{ added: number; updated: number; places: number }> {
  return db.tx(async q => {
    const { rows: [campus] } = await q.query<{ id: string }>('select id from campus where slug=$1', [CAMPUS]);
    if (!campus) throw new Error(`No campus "${CAMPUS}" in this database.`);
    await q.query('insert into campus_feed(campus_id,source,url,is_on) values($1,$2,$3,false) on conflict (campus_id,url) do nothing', [campus.id, SOURCE, PAGE]);
    const { rows: [feed] } = await q.query<{ id: string }>('select id from campus_feed where campus_id=$1 and url=$2', [campus.id, PAGE]);
    const known = new Map((await q.query<{ id: string; name: string }>('select id,lower(name) as name from campus_place where campus_id=$1', [campus.id])).rows.map(row => [row.name, row.id]));
    let places = 0, added = 0, updated = 0;
    for (const event of events) {
      let placeId: string | null = null;
      if (event.venue && event.at) {
        placeId = known.get(event.venue.toLowerCase()) ?? null;
        if (!placeId) {
          placeId = (await q.query<{ id: string }>('insert into campus_place(campus_id,name,lat,lon) values($1,$2,$3,$4) returning id', [campus.id, event.venue, event.at[1], event.at[0]])).rows[0].id;
          known.set(event.venue.toLowerCase(), placeId); places++;
        }
      }
      const fields = [event.title, event.host, event.placeText, placeId, event.startsAt, event.endsAt, goodFor(event.title, null, event.host)];
      const { rows: [old] } = await q.query<{ id: string }>('select id from campus_listing where feed_id=$1 and feed_item_id=$2', [feed.id, event.id]);
      if (old) { await q.query('update campus_listing set title=$2,host_name=$3,place_text=$4,place_id=$5,starts_at=$6,ends_at=$7,left_feed_at=null,words=case when words_by_hand then words else $8 end where id=$1', [old.id, ...fields]); updated++; }
      else { await q.query(`insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,host_name,place_text,place_id,starts_at,ends_at,words) values($1,'feed',$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [campus.id, feed.id, event.id, ...fields]); added++; }
    }
    await q.query('update campus_feed set last_read_at=now(),last_ok=true,last_result=$2 where id=$1', [feed.id, `Loaded by hand: ${events.length} events`]);
    return { added, updated, places };
  });
}

async function main() {
  process.loadEnvFile('.env.local');
  const response = await fetch(DATA, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; events-reader)' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`The page answered ${response.status}`);
  const events = islandEvents(await response.text(), new Date());
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  for (const event of events) console.log(`${day.format(new Date(event.startsAt)).padEnd(24)} ${event.title.slice(0, 58).padEnd(58)} ${event.venue ?? '(no venue)'}${event.at ? '' : ' (not on the map)'}`);
  const { databaseUrl } = await import('../lib/db');
  const where = (() => { try { return new URL(databaseUrl(process.env) ?? '').host; } catch { return 'no database set'; } })();
  if (!process.argv.includes('--yes')) { console.log(`\n${events.length} events for ${CAMPUS}. Nothing written. Add --yes to write them to ${where}.`); return; }
  const { db } = await import('../lib/db');
  const done = await seedIsland(db(), events);
  console.log(`\nWrote to ${where}: ${done.added} added, ${done.updated} updated, ${done.places} places added.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(() => process.exit(0), error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
