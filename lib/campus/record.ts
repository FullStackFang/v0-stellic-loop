import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Q } from '../db';
import { placeFor, placeTag } from './place-tags';
import { localParts, weekOf, zoned } from './time';

// A place's record (openspec campus-venue-record): how many groups said they were coming, showed up and came back.
// Counts only. Nothing read here names, or leads to, a person.

export type RecordSpan = 4 | 8 | 'all';
export const RECORD_SPANS: readonly RecordSpan[] = [4, 8, 'all'];
/** Below this many groups that showed up, the breakdowns are not shown (design D2). */
export const RECORD_BREAKDOWN_FROM = 5;
export const RECORD_MIGRATION = 'supabase/migrations/20261124070000_campus_place_record.sql';

export type PlaceRecord = {
  /** Groups of two or more on events at the place. */ said: number;
  /** Everyone in those groups. */ people: number;
  /** Groups where two or more checked in. */ showed: number;
  /** Of those, the ones where two who checked in had checked in together there on an earlier day. */ back: number;
  /** Groups that showed up, by week (each week's Monday), oldest first. Null below five groups that showed up. */
  weeks: { week: string; showed: number }[] | null;
  sizes: { two: number; threeFour: number; fivePlus: number } | null;
  days: { monThu: number; friday: number; weekend: number } | null;
};

const DAY = 86400000;
const minusWeeks = (monday: string, n: number) => new Date(Date.parse(`${monday}T00:00:00Z`) - n * 7 * DAY).toISOString().slice(0, 10);

/** The three numbers for a place over the span, ending now, counted by the start of each event in the campus timezone (design D1, D6). */
export async function placeRecord(q: Q, placeId: string, span: RecordSpan, tz: string, now: Date): Promise<PlaceRecord> {
  const thisWeek = weekOf(tz, now), from = span === 'all' ? null : zoned(tz, `${minusWeeks(thisWeek, span - 1)}T00:00`);
  const { rows } = await q.query<{ startsAt: string; members: number; checked: number; back: boolean }>(`
    with o as (
      select o.id, l.starts_at, count(m.person_id)::int as members, count(m.checked_in_at)::int as checked
      from campus_outing o join campus_listing l on l.id=o.listing_id left join campus_outing_member m on m.outing_id=o.id
      where l.place_id=$1 and l.cancelled_at is null and l.starts_at<=$3 and ($2::timestamptz is null or l.starts_at>=$2)
      group by o.id, l.starts_at)
    select o.starts_at as "startsAt", o.members, o.checked,
      o.checked>=2 and exists(
        select 1 from campus_outing_member a
        join campus_outing_member b on b.person_id=a.person_id and b.outing_id<>a.outing_id and b.checked_in_at is not null
        join campus_listing lb on lb.id=b.listing_id
        where a.outing_id=o.id and a.checked_in_at is not null and lb.place_id=$1 and lb.cancelled_at is null
          and (lb.starts_at at time zone $4)::date<(o.starts_at at time zone $4)::date
        group by b.outing_id having count(*)>=2) as back
    from o where o.members>=2`, [placeId, from?.toISOString() ?? null, now.toISOString(), tz]);
  const shown = rows.filter(row => row.checked >= 2);
  const record: PlaceRecord = {
    said: rows.length, people: rows.reduce((n, row) => n + row.members, 0), showed: shown.length, back: shown.filter(row => row.back).length,
    weeks: null, sizes: null, days: null,
  };
  if (shown.length < RECORD_BREAKDOWN_FROM) return record;
  const byWeek = new Map<string, number>();
  for (const row of shown) { const week = weekOf(tz, row.startsAt); byWeek.set(week, (byWeek.get(week) ?? 0) + 1); }
  const first = span === 'all' ? [...byWeek.keys()].sort()[0] : minusWeeks(thisWeek, span - 1);
  record.weeks = [];
  for (let week = first; week <= thisWeek; week = minusWeeks(week, -1)) record.weeks.push({ week, showed: byWeek.get(week) ?? 0 });
  record.sizes = { two: 0, threeFour: 0, fivePlus: 0 };
  record.days = { monThu: 0, friday: 0, weekend: 0 };
  for (const row of shown) {
    record.sizes[row.checked === 2 ? 'two' : row.checked <= 4 ? 'threeFour' : 'fivePlus']++;
    const day = localParts(tz, new Date(row.startsAt)).weekday;
    record.days[day === 'Fri' ? 'friday' : day === 'Sat' || day === 'Sun' ? 'weekend' : 'monThu']++;
  }
  return record;
}

/** Whether the record migration has been run. Until it has, no record opens and the admin is told which file to run. */
let migrated = false;
export async function recordReady(q: Q): Promise<boolean> {
  if (!migrated) migrated = !!(await q.query<{ ok: boolean }>("select exists(select 1 from information_schema.columns where table_name='campus_place' and column_name='record_token') as ok")).rows[0]?.ok;
  return migrated;
}

const newKey = () => randomBytes(18).toString('base64url');

/** The place's private key, made the first time it is asked for. */
export async function recordLink(q: Q, placeId: string): Promise<string> {
  const { rows: [row] } = await q.query<{ key: string }>('update campus_place set record_token=coalesce(record_token,$2) where id=$1 returning record_token as key', [placeId, newKey()]);
  if (!row) throw new Error('No such place');
  return row.key;
}

/** A new private key for the place. The old link stops opening the record. */
export async function renewRecordLink(q: Q, placeId: string): Promise<string> {
  const { rows: [row] } = await q.query<{ key: string }>('update campus_place set record_token=$2 where id=$1 returning record_token as key', [placeId, newKey()]);
  if (!row) throw new Error('No such place');
  return row.key;
}

export async function setRecordPublic(q: Q, placeId: string, on: boolean): Promise<void> {
  const { rows } = await q.query('update campus_place set record_public=$2 where id=$1 returning id', [placeId, on]);
  if (!rows.length) throw new Error('No such place');
}

/** Each place's key and switch, for the admin's Places tab. */
export async function recordStates(q: Q, campusId: string): Promise<Map<string, { key: string | null; public: boolean }>> {
  if (!await recordReady(q)) return new Map();
  const { rows } = await q.query<{ id: string; key: string | null; public: boolean }>('select id,record_token as key,record_public as public from campus_place where campus_id=$1', [campusId]);
  return new Map(rows.map(row => [row.id, { key: row.key, public: row.public }]));
}

/** The record's address, with the key when it is private. */
export const recordPath = (campusSlug: string, place: { name: string; otherNames: readonly string[] }, key?: string | null) =>
  `/places/${campusSlug}/${placeTag(place)}/record${key ? `?k=${encodeURIComponent(key)}` : ''}`;

export type RecordPlace = { id: string; name: string; public: boolean; campus: { slug: string; name: string; tz: string } };

/** The place a record address names, when the key is its key or the record is public; else null. */
export async function findRecord(q: Q, campusSlug: string, tag: string, key: string | null | undefined): Promise<RecordPlace | null> {
  if (!await recordReady(q)) return null;
  const { rows } = await q.query<{ id: string; name: string; otherNames: string[]; key: string | null; public: boolean; slug: string; campusName: string; tz: string }>(
    'select p.id,p.name,p.other_names as "otherNames",p.record_token as key,p.record_public as public,c.slug,c.name as "campusName",c.tz from campus_place p join campus c on c.id=p.campus_id where c.slug=$1', [campusSlug]);
  const place = placeFor(rows, tag);
  if (!place || !(place.public || (!!key && !!place.key && key === place.key))) return null;
  return { id: place.id, name: place.name, public: place.public, campus: { slug: place.slug, name: place.campusName, tz: place.tz } };
}
