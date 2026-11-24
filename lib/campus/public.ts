import 'server-only';
import type { Q } from '../db';
import { dealsReady, reviewReady, type Campus } from './listings';
import { placeFor, placeTag } from './place-tags';
import { recordReady } from './record';
import { landOf, walkMinutes } from './sections';
import { localParts, zoned } from './time';

// What anyone may read about a campus without signing in (openspec campus-public-places): feed and hand-entered events,
// the places they are at, and how many are going. Plain facts only. Nothing read here names, or leads to, a person.

export type PublicCampus = { slug: string; name: string; tz: string };
export type PublicEvent = {
  id: string; title: string; about: string | null; host: string | null;
  /** The feed's name ("Luma"); null for an event the admin entered. Never its link. */
  source: string | null;
  startsAt: string; endsAt: string | null;
  place: { name: string; tag: string } | null;
  /** How many are in, the number the signed-out campus list already shows. */
  going: number;
  campus: PublicCampus;
};
export type PublicPlace = { id: string; campusId: string; name: string; tag: string; lat: number; lon: number; /** Minutes on foot from the campus, when its ground is drawn. */ walk: number | null; recordPublic: boolean; campus: PublicCampus };

/** A place has a page while it has a public event within this many days (design D1). */
export const PUBLIC_PLACE_DAYS = 14;
const DAY = 86400000;

/** The rule for a public event (design D1), on campus_listing as `l`. `$now` is the parameter holding now. */
async function publicRule(q: Q, now: string) {
  const [deals, review] = await Promise.all([dealsReady(q), reviewReady(q)]);
  return `l.origin in ('feed','hand') and l.hidden_at is null and l.cancelled_at is null and l.left_feed_at is null
    and coalesce(l.ends_at,l.starts_at+interval '2 hours')>${now}::timestamptz${deals ? ' and l.deal_id is null' : ''}${review ? ' and not l.waiting' : ''}`;
}

type Row = Omit<PublicEvent, 'place' | 'campus'> & { placeName: string | null; otherNames: string[] | null; slug: string; campusName: string; tz: string };
const EVENT = `l.id,l.title,l.about,l.host_name as host,f.source,l.starts_at as "startsAt",l.ends_at as "endsAt",
  p.name as "placeName",p.other_names as "otherNames",c.slug,c.name as "campusName",c.tz,
  (select count(*)::int from campus_outing_member m where m.listing_id=l.id) as going
  from campus_listing l join campus c on c.id=l.campus_id left join campus_feed f on f.id=l.feed_id left join campus_place p on p.id=l.place_id`;
const shape = ({ placeName, otherNames, slug, campusName, tz, ...row }: Row): PublicEvent => ({
  ...row, place: placeName === null ? null : { name: placeName, tag: placeTag({ name: placeName, otherNames: otherNames ?? [] }) }, campus: { slug, name: campusName, tz } });

/** A campus's public events that are on at some point between `from` and `to`, soonest first. */
export async function publicEvents(q: Q, campus: Pick<Campus, 'id'>, { from, to, placeId, now = new Date(), limit }: { from: Date; to: Date; placeId?: string; now?: Date; limit?: number }): Promise<PublicEvent[]> {
  const { rows } = await q.query<Row>(`select ${EVENT}
    where l.campus_id=$1 and ${await publicRule(q, '$2')}
      and coalesce(l.ends_at,l.starts_at+interval '2 hours')>$3::timestamptz and l.starts_at<$4::timestamptz and ($5::uuid is null or l.place_id=$5)
    order by l.starts_at,l.title,l.id ${limit ? `limit ${Math.floor(limit)}` : ''}`, [campus.id, now.toISOString(), from.toISOString(), to.toISOString(), placeId ?? null]);
  return rows.map(shape);
}

/** One public event, or null when there is no such event or it is not public. */
export async function publicEvent(q: Q, id: string, now: Date = new Date()): Promise<PublicEvent | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { rows: [row] } = await q.query<Row>(`select ${EVENT} where l.id=$1 and ${await publicRule(q, '$2')}`, [id, now.toISOString()]);
  return row ? shape(row) : null;
}

type PlaceRow = { id: string; name: string; otherNames: string[]; lat: number; lon: number; recordPublic: boolean; live: boolean };
async function placeRows(q: Q, campusId: string, now: Date): Promise<PlaceRow[]> {
  const record = await recordReady(q);
  const { rows } = await q.query<PlaceRow>(`select p.id,p.name,p.other_names as "otherNames",p.lat,p.lon,${record ? 'p.record_public' : 'false'} as "recordPublic",
      exists(select 1 from campus_listing l where l.place_id=p.id and ${await publicRule(q, '$2')} and l.starts_at<$3::timestamptz) as live
    from campus_place p where p.campus_id=$1 order by lower(p.name)`, [campusId, now.toISOString(), new Date(now.getTime() + PUBLIC_PLACE_DAYS * DAY).toISOString()]);
  return rows;
}
const placeOf = (row: PlaceRow, campusId: string, campus: PublicCampus): PublicPlace => {
  const rest = landOf(campus.slug)?.[0]?.rest;
  return { id: row.id, campusId, name: row.name, tag: placeTag(row), lat: row.lat, lon: row.lon, walk: rest ? walkMinutes(rest, [row.lon, row.lat]) : null, recordPublic: row.recordPublic, campus };
};

/** The place a public address names, when it has a public event in the next 14 days or a public record; else null. */
export async function publicPlace(q: Q, campusSlug: string, tag: string, now: Date = new Date()): Promise<PublicPlace | null> {
  const { rows: [campus] } = await q.query<{ id: string; slug: string; name: string; tz: string }>('select id,slug,name,tz from campus where slug=$1', [campusSlug]);
  if (!campus) return null;
  const row = placeFor(await placeRows(q, campus.id, now), tag);
  return row && (row.live || row.recordPublic) ? placeOf(row, campus.id, { slug: campus.slug, name: campus.name, tz: campus.tz }) : null;
}

/** Every public place of a campus, by name. */
export async function publicPlaces(q: Q, campus: Pick<Campus, 'id' | 'slug' | 'name' | 'tz'>, now: Date = new Date()): Promise<PublicPlace[]> {
  return (await placeRows(q, campus.id, now)).filter(row => row.live || row.recordPublic).map(row => placeOf(row, campus.id, { slug: campus.slug, name: campus.name, tz: campus.tz }));
}

export const ASK_WHEN = ['today', 'tonight', 'tomorrow', 'week'] as const;
export type AskWhen = typeof ASK_WHEN[number];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The span a `when` asks about, on the campus clock: today is now to midnight; tonight is 5pm (or now, if later) to
 * 4am; tomorrow is the whole next day; week is now to the end of the seventh day.
 */
export function askWindow(when: AskWhen, tz: string, now: Date): { from: Date; to: Date } {
  const today = localParts(tz, now).date, at = (date: string, time: string) => zoned(tz, `${date}T${time}`);
  const later = (a: Date) => a > now ? a : now;
  switch (when) {
    case 'today': return { from: now, to: at(addDays(today, 1), '00:00') };
    case 'tonight': return { from: later(at(today, '17:00')), to: at(addDays(today, 1), '04:00') };
    case 'tomorrow': return { from: at(addDays(today, 1), '00:00'), to: at(addDays(today, 2), '00:00') };
    case 'week': return { from: now, to: at(addDays(today, 7), '00:00') };
  }
}

/** A public page's full address, for the sitemap, the guide file and the ask answer. */
export function siteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '') || 'http://localhost:3000';
  return `${base}${path}`;
}
export const placePath = (campusSlug: string, tag: string) => `/places/${campusSlug}/${tag}`;
export const eventPath = (id: string) => `/events/${id}`;
