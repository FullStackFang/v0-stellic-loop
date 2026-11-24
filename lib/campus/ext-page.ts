import type { Q } from '../db';
import { there } from './there';

// The page address of the Loopd browser extension (openspec loopd-browser-extension, design D1, D2, D3). Read by the
// extension's lookup and by the feed reader, so it imports nothing heavy.

/** Whether the extension's migration (20261124090000) has been run. Until it has, every lookup answers as not connected. */
export const extReady = (q: Q) => there(q, 'campus_ext',
  "select to_regclass('campus_ext_token') is not null and exists(select 1 from information_schema.columns where table_name='campus_listing' and column_name='source_url') as ok");

/** An event page, keyed. `forms` are every way the same page may be stored; `read` is the form Loopd reads and posts. */
export type PageKey = { site: 'luma' | 'posh' | 'eventbrite' | 'campusgroups'; key: string; forms: string[]; read: string };

/** Luma's own pages: one path segment like an event's, but not one. */
const LUMA_PAGES = new Set(['discover', 'home', 'calendar', 'calendars', 'user', 'u', 'signin', 'login', 'signup', 'create', 'settings', 'explore', 'pricing', 'about', 'terms', 'privacy', 'help', 'search', 'events', 'map', 'download', 'check-in']);
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~%-]{0,199}$/;
const NUMBER = /^\d{1,12}$/;

/** The event number of a CampusGroups page: `/rsvp?id=`, `/<club>/rsvp?id=`, `/<club>/rsvp_boot?id=`, or `…/events/<base64 "<sub>:Event:<n>">`. */
function campusGroupsEvent(sub: string, parts: string[], query: URLSearchParams): string | null {
  const last = parts.at(-1)?.toLowerCase();
  if ((last === 'rsvp' || last === 'rsvp_boot') && parts.length <= 2) { const id = query.get('id'); return id && NUMBER.test(id) ? id : null; }
  const at = parts.findIndex(part => part.toLowerCase() === 'events');
  if (at < 0 || parts.length !== at + 2) return null;
  let said: string;
  try { said = Buffer.from(decodeURIComponent(parts[at + 1]).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return null; }
  const found = /^([a-z0-9-]+):Event:(\d{1,12})$/i.exec(said);
  return found && found[1].toLowerCase() === sub ? found[2] : null;
}

/**
 * The key of an event page on one of the four sites, or null for anything else: not https, another site, or a page of
 * those sites that is not a single event. The host is lower case without `www.`; the query, fragment and a trailing
 * slash are dropped, except that a CampusGroups page is its event number (design D3, task 1.1).
 */
export function normalPage(raw: unknown): PageKey | null {
  if (typeof raw !== 'string' || raw.length > 4000) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, ''), parts = url.pathname.split('/').filter(Boolean);
  if (host === 'lu.ma' || host === 'luma.com') {
    const slug = parts[0];
    if (parts.length !== 1 || !SLUG.test(slug) || LUMA_PAGES.has(slug.toLowerCase())) return null;
    return { site: 'luma', key: `https://luma.com/${slug}`, forms: [`https://luma.com/${slug}`, `https://lu.ma/${slug}`], read: `https://luma.com/${slug}` };
  }
  if (host === 'posh.vip' || host === 'eventbrite.com') {
    const slug = parts[1];
    if (parts.length !== 2 || parts[0] !== 'e' || !SLUG.test(slug)) return null;
    if (host === 'posh.vip') return { site: 'posh', key: `https://posh.vip/e/${slug}`, forms: [`https://posh.vip/e/${slug}`], read: `https://posh.vip/e/${slug}` };
    return { site: 'eventbrite', key: `https://eventbrite.com/e/${slug}`, forms: [`https://eventbrite.com/e/${slug}`, `https://www.eventbrite.com/e/${slug}`], read: `https://www.eventbrite.com/e/${slug}` };
  }
  const school = /^([a-z0-9-]{1,63})\.campusgroups\.com$/.exec(host);
  if (school) {
    const id = campusGroupsEvent(school[1], parts, url.searchParams);
    if (!id) return null;
    const key = `https://${school[1]}.campusgroups.com/rsvp?id=${id}`;
    return { site: 'campusgroups', key, forms: [key], read: key };
  }
  return null;
}

/**
 * What a feed event keeps as the page it came from (design D3): its key when it is an event page of the four sites,
 * else the address as given. Null for anything that is not an https address of 9 to 2000 characters.
 */
export function sourceUrlOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^https:\/\/\S+$/.test(text) || text.length < 9 || text.length > 2000) return null;
  try { new URL(text); } catch { return null; }
  return normalPage(text)?.key ?? text;
}
