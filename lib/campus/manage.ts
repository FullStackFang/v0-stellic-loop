import 'server-only';
import type { Q } from '../db';
import { campusPlaces, matchPlace } from './places';
import { validTimezone } from './time';
import { cleanWords, goodFor } from './words';

// What the admin does by hand (specs: campus-listings, "Managing a campus by hand"). These do not check who is asking:
// the admin page and each of its actions do, before calling them.

const domain = (typed: string) => typed.trim().toLowerCase().replace(/^@/, '');

export async function addCampus(q: Q, input: { slug: string; name: string; tz: string; domains: string[]; listSource?: string }): Promise<{ id: string }> {
  if (!validTimezone(input.tz)) throw new Error('Not a timezone Loop knows, such as America/New_York');
  const domains = [...new Set(input.domains.map(domain).filter(Boolean))];
  if (!domains.length || domains.some(name => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name))) throw new Error('A campus needs at least one email domain, such as cornell.edu');
  return (await q.query<{ id: string }>('insert into campus(slug,name,tz,domains,list_source) values($1,$2,$3,$4,$5) returning id', [input.slug.trim().toLowerCase(), input.name.trim(), input.tz, domains, input.listSource?.trim() || 'CampusGroups'])).rows[0];
}

export async function addFeed(q: Q, input: { campusId: string; source: string; url: string }): Promise<{ id: string }> {
  // webcal: is how calendar apps write the same https address.
  const url = input.url.trim().replace(/^webcal:/i, 'https:');
  return (await q.query<{ id: string }>('insert into campus_feed(campus_id,source,url) values($1,$2,$3) returning id', [input.campusId, input.source.trim(), url])).rows[0];
}
export async function setFeedOn(q: Q, feedId: string, on: boolean) {
  await q.query('update campus_feed set is_on=$2 where id=$1', [feedId, on]);
}

export type ListingInput = { campusId: string; title: string; startsAt: string; endsAt?: string | null; place?: string | null; host?: string | null; about?: string | null };
const text = (value: string | null | undefined) => value?.trim() || null;

/** Inserts an event with its "good for" words and its matched place. Shared by hand-entered events and posted plans. */
export async function insertListing(q: Q, origin: 'hand' | 'member', input: ListingInput, postedBy: string | null = null): Promise<{ id: string }> {
  const title = input.title.trim(), about = text(input.about), host = text(input.host), place = text(input.place);
  const placeId = matchPlace(await campusPlaces(q, input.campusId), place)?.id ?? null;
  return (await q.query<{ id: string }>(`insert into campus_listing(campus_id,origin,title,about,host_name,place_text,place_id,starts_at,ends_at,words,posted_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, [input.campusId, origin, title, about, host, place, placeId, input.startsAt, input.endsAt || null, goodFor(title, about, host), postedBy])).rows[0];
}
export const addHandListing = (q: Q, input: ListingInput) => insertListing(q, 'hand', input);

/** Replaces an event's "good for" words with the admin's. A later read of its feed leaves them alone. */
export async function setWords(q: Q, listingId: string, typed: string): Promise<string[]> {
  const words = cleanWords(typed);
  await q.query('update campus_listing set words=$2,words_by_hand=true where id=$1', [listingId, words]);
  return words;
}
export async function setHidden(q: Q, listingId: string, hidden: boolean) {
  await q.query('update campus_listing set hidden_at=case when $2 then coalesce(hidden_at,now()) end where id=$1', [listingId, hidden]);
}

/** Changes a campus's email domains and the name of its complete list ("All of CampusGroups"). */
export async function setCampus(q: Q, campusId: string, input: { domains: string[]; listSource: string }) {
  const domains = [...new Set(input.domains.map(domain).filter(Boolean))];
  if (!domains.length || domains.some(name => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name))) throw new Error('A campus needs at least one email domain, such as cornell.edu');
  if (!input.listSource.trim()) throw new Error('Name the source of the complete list, such as CampusGroups');
  await q.query('update campus set domains=$2,list_source=$3 where id=$1', [campusId, domains, input.listSource.trim()]);
}

export type Feed = { id: string; source: string; url: string; on: boolean; lastReadAt: string | null; lastOk: boolean | null; lastResult: string | null };
export async function campusFeeds(q: Q, campusId: string): Promise<Feed[]> {
  return (await q.query<Feed>('select id,source,url,is_on as "on",last_read_at as "lastReadAt",last_ok as "lastOk",last_result as "lastResult" from campus_feed where campus_id=$1 order by created_at,id', [campusId])).rows;
}

export type AdminListing = { id: string; title: string; origin: string; source: string | null; host: string | null; placeText: string | null; matched: boolean; startsAt: string; words: string[]; hidden: boolean };
/** The events the admin can edit: everything not yet over, hidden ones included, soonest first. `search` narrows by title or host. */
export async function adminListings(q: Q, campusId: string, search: string, limit = 60): Promise<{ rows: AdminListing[]; total: number }> {
  const where = `l.campus_id=$1 and l.cancelled_at is null and l.left_feed_at is null and coalesce(l.ends_at,l.starts_at+interval '2 hours')>now() and ($2='' or l.title ilike '%'||$2||'%' or l.host_name ilike '%'||$2||'%')`;
  const like = search.trim().replace(/[%_\\]/g, '\\$&');
  const { rows } = await q.query<AdminListing>(`select l.id,l.title,l.origin,f.source,l.host_name as host,l.place_text as "placeText",l.place_id is not null as matched,l.starts_at as "startsAt",l.words,l.hidden_at is not null as hidden
    from campus_listing l left join campus_feed f on f.id=l.feed_id where ${where} order by l.starts_at,l.title limit $3`, [campusId, like, limit]);
  const { rows: [{ total }] } = await q.query<{ total: number }>(`select count(*)::int as total from campus_listing l where ${where}`, [campusId, like]);
  return { rows, total };
}
