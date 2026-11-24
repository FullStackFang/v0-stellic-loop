import 'server-only';
import ICAL from 'ical.js';
import type { Db } from '../db';
import { reviewReady } from './listings';
import { campusPlaces, matchPlace } from './places';
import { zoned } from './time';
import { goodFor } from './words';

// Reading calendar feeds (design D12). Every feed that is on is read each hour: an item in the next 30 days becomes an
// event, matched by feed and item id; an item that changed updates its event; an item gone from the feed hides its event.

export type FeedItem = { id: string; title: string; about: string | null; host: string | null; place: string | null; startsAt: string; endsAt: string | null; cancelled: boolean };
export type Fetcher = (url: string) => Promise<string>;

const WINDOW = 30 * 86400000;
// CampusGroups marks a title as quoted-printable; the bytes are UTF-8.
const unquote = (value: string) => /=[0-9A-F]{2}/.test(value) ? Buffer.from(value.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8') : value;
const line = (value: unknown, most: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, most) || null : null;
/** The about text with nothing that leads out of Loopd: lines holding a link, and the rule above them, are dropped. */
function about(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const kept = value.split(/\r?\n/).map(part => part.trim()).filter(part => part && !/https?:\/\/|www\.|^-{3,}$/i.test(part) && !/^address:$/i.test(part));
  return kept.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
}
// A public CampusGroups feed puts this where the place would be.
const place = (value: unknown) => { const text = line(value, 300); return text && !/^sign in to /i.test(text) ? text : null; };

function instant(time: ICAL.Time | null | undefined, tz: string): string | null {
  if (!time) return null;
  // A whole-day event starts at midnight on the campus; a time with no zone is a time on the campus.
  if (time.isDate || time.zone === ICAL.Timezone.localTimezone) {
    const two = (n: number) => String(n).padStart(2, '0');
    return zoned(tz, `${time.year}-${two(time.month)}-${two(time.day)}T${two(time.isDate ? 0 : time.hour)}:${two(time.isDate ? 0 : time.minute)}`).toISOString();
  }
  return time.toJSDate().toISOString();
}

/** The events in a calendar feed. Throws when the text is not a calendar. */
export function parseFeed(text: string, tz: string): FeedItem[] {
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) throw new Error('Not a calendar feed');
  const calendar = new ICAL.Component(ICAL.parse(text));
  const items: FeedItem[] = [];
  for (const part of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(part), summary = part.getFirstProperty('summary');
    const quoted = String(summary?.getParameter('encoding') ?? '').toUpperCase() === 'QUOTED-PRINTABLE';
    const title = line(quoted ? unquote(String(event.summary ?? '')) : event.summary, 200), startsAt = instant(event.startDate, tz);
    if (!event.uid || !title || !startsAt) continue;
    const ends = part.hasProperty('dtend') || part.hasProperty('duration') ? instant(event.endDate, tz) : null;
    const organizer = part.getFirstProperty('organizer')?.getParameter('cn');
    // An occurrence of a repeating event shares its uid, so its own date tells it apart.
    const occurrence = part.getFirstPropertyValue('recurrence-id');
    items.push({
      id: `${event.uid}${occurrence ? `#${String(occurrence)}` : ''}`.slice(0, 500), title, about: about(event.description),
      host: line(organizer ?? part.getFirstPropertyValue('x-hosts') ?? calendar.getFirstPropertyValue('x-wr-calname'), 200),
      place: place(event.location), startsAt, endsAt: ends && ends > startsAt ? ends : null,
      cancelled: String(part.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
    });
  }
  return items;
}

const MOST_FEED = 30_000_000;
async function download(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/calendar' }, signal: AbortSignal.timeout(25000), cache: 'no-store' });
  if (!response.ok) throw new Error(`The feed answered ${response.status}`);
  const text = await response.text();
  if (text.length > MOST_FEED) throw new Error('The feed is too large to read');
  return text;
}

/**
 * Reads every feed that is on, or the one named. A feed that fails leaves its events as they were, has the failure
 * recorded on it, and does not stop the others.
 */
export async function readFeeds(db: Db, options: { fetch?: Fetcher; now?: Date; feedId?: string } = {}): Promise<{ feeds: number; failed: number }> {
  const read = options.fetch ?? download, now = options.now ?? new Date(), ready = await reviewReady(db);
  const { rows: feeds } = await db.query<{ id: string; campusId: string; url: string; tz: string; review: boolean }>(
    `select f.id,f.campus_id as "campusId",f.url,c.tz,${ready ? 'f.review' : 'false'} as review from campus_feed f join campus c on c.id=f.campus_id where ${options.feedId ? 'f.id=$1' : 'f.is_on'} order by f.created_at,f.id`, options.feedId ? [options.feedId] : []);
  let failed = 0;
  for (const feed of feeds) {
    try {
      const items = parseFeed(await read(feed.url), feed.tz);
      const soon = await db.tx(async q => {
        // The hourly read and "Read now" on the same feed go one after the other.
        await q.query('select id from campus_feed where id=$1 for update', [feed.id]);
        const places = await campusPlaces(q, feed.campusId);
        // Events that ended more than two days ago are left as they are, so an hour's work does not grow with the feed's history.
        const { rows } = await q.query<{ id: string; item: string; old: boolean }>("select id,feed_item_id as item,coalesce(ends_at,starts_at)<$2::timestamptz-interval '2 days' as old from campus_listing where feed_id=$1", [feed.id, now.toISOString()]);
        const old = new Set(rows.filter(row => row.old).map(row => row.item));
        const known = new Map(rows.map(row => [row.item, row.id])), seen = new Set<string>();
        let inWindow = 0;
        for (const item of items) {
          if (item.cancelled || seen.has(item.id) || old.has(item.id)) continue;
          const start = Date.parse(item.startsAt), wanted = Date.parse(item.endsAt ?? item.startsAt) >= now.getTime() && start < now.getTime() + WINDOW;
          if (wanted) inWindow++;
          const id = known.get(item.id), placeId = matchPlace(places, item.place)?.id ?? null, words = goodFor(item.title, item.about, item.host);
          // An event Loopd already holds follows its item wherever it moved, except for a place the admin set; a new one
          // is taken only inside the 30 days. On a reviewed feed a new one waits, hidden, for the admin.
          if (id) await q.query(`update campus_listing set title=$2,about=$3,host_name=$4,${ready ? 'place_text=case when place_by_hand then place_text else $5 end,place_id=case when place_by_hand then place_id else $6 end' : 'place_text=$5,place_id=$6'},starts_at=$7,ends_at=$8,left_feed_at=null,
            words=case when words_by_hand then words else $9 end where id=$1`, [id, item.title, item.about, item.host, item.place, placeId, item.startsAt, item.endsAt, words]);
          else if (wanted) await q.query(`insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,about,host_name,place_text,place_id,starts_at,ends_at,words${feed.review ? ',waiting,hidden_at' : ''})
            values($1,'feed',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11${feed.review ? ',true,$12' : ''})`, [feed.campusId, feed.id, item.id, item.title, item.about, item.host, item.place, placeId, item.startsAt, item.endsAt, words, ...feed.review ? [now.toISOString()] : []]);
          else continue;
          seen.add(item.id);
        }
        // Hidden, not deleted: an outing on it keeps its event.
        const gone = rows.filter(row => !row.old && !seen.has(row.item)).map(row => row.id);
        if (gone.length) await q.query('update campus_listing set left_feed_at=$2 where id=any($1::uuid[]) and left_feed_at is null', [gone, now.toISOString()]);
        return inWindow;
      });
      await db.query('update campus_feed set last_read_at=$2,last_ok=true,last_result=$3 where id=$1', [feed.id, now.toISOString(), `Read ${items.length} ${items.length === 1 ? 'event' : 'events'}, ${soon} in the next 30 days`]);
    } catch (error) {
      failed++;
      const why = error instanceof Error && error.message ? error.message : 'The feed could not be read';
      await db.query('update campus_feed set last_read_at=$2,last_ok=false,last_result=$3 where id=$1', [feed.id, now.toISOString(), why.slice(0, 300)]).catch(() => {});
    }
  }
  return { feeds: feeds.length, failed };
}
