import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { readEventPage, type PageReader } from '../emba/event-link';
import { customFaces } from './custom-face';
import { CampusError } from './errors';
import { knownTo, timesOut } from './knows';
import type { Campus } from './listings';
import { imIn, leave, outingsOn, pickOuting } from './outings';
import { accountPhotos, campusOf, firstNames, pickedFaces, type Photos } from './people';
import { campusPlaces, matchPlace, PLACES_REQUIRED } from './places';
import { postPlan, readPlanLink } from './plans';
import { publicRule } from './public';
import { KIT } from './save-shapes';
import { schoolOf } from './schools';
import { facesOf } from './screen';
import { extReady, normalPage, type PageKey } from './ext-page';

// The Loopd browser extension (openspec loopd-browser-extension). On another site's event page it shows who the person
// knows that is going, and "I'm in". It sends the page's address and its own token, nothing else. The address is the
// key (design D1): one event page, one key, matched against the links of posted plans and the pages feed events came from.

export { extReady, normalPage, sourceUrlOf, type PageKey } from './ext-page';

// ---- The extension's token (design D4) ----

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new token for the person's extension. It is returned once; only its hash is kept. */
export async function connectExt(q: Q, personId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await q.query('insert into campus_ext_token(token_hash,person_id) values($1,$2)', [hashOf(token), personId]);
  return token;
}
/** The person a token belongs to, or null for an unknown or revoked one. Notes when it was last used. */
export async function personOfToken(q: Q, token: unknown, now: Date = new Date()): Promise<string | null> {
  if (typeof token !== 'string' || !TOKEN.test(token) || !await extReady(q)) return null;
  const { rows: [row] } = await q.query<{ id: string }>('update campus_ext_token set last_used_at=$2 where token_hash=$1 and revoked_at is null returning person_id as id', [hashOf(token), now.toISOString()]);
  return row?.id ?? null;
}
/** Disconnect: every token the person's extensions hold is refused from now on. */
export async function revokeExt(q: Q, personId: string, now: Date = new Date()): Promise<void> {
  await q.query('update campus_ext_token set revoked_at=$2 where person_id=$1 and revoked_at is null', [personId, now.toISOString()]);
}
/** Whether the person has an extension connected. */
export async function extConnected(q: Q, personId: string): Promise<boolean> {
  if (!await extReady(q)) return false;
  return (await q.query('select 1 from campus_ext_token where person_id=$1 and revoked_at is null limit 1', [personId])).rows.length > 0;
}

// ---- What the card shows (design D7, D8) ----

export type ExtFace = { first: string; photo: string; me?: true };
/** The campus's colours, as CSS. */
export type ExtKit = { field: string; ink: string; action: string };
export type ExtAnswer =
  /** Not connected, or connected with no school (`say` is what Loopd says then). A count only for a public event. */
  | { state: 'out'; going: number | null; connect: string; say: string | null }
  /** People the person knows are in (state 1). */
  | { state: 'known'; campus: string; kit: ExtKit; known: ExtFace[]; others: number; invite: string | null }
  /** The person is in (state 2): their face first, then the people they know in their group. */
  | { state: 'in'; campus: string; kit: ExtKit; faces: ExtFace[]; others: number; share: string; invite: string; leave: boolean }
  /** Nobody they know, or an event Loopd has not seen (state 3). */
  | { state: 'none'; campus: string; kit: ExtKit; seen: boolean; others: number }
  /** Not an event page of the four sites: no card. */
  | { state: 'not_event' };
/** What a press answers: the new state, or the app's refusal, or the posting panel to finish in. */
export type ExtPress = ExtAnswer | { state: 'refused'; message: string } | { state: 'finish'; finish: string };

export const NO_SCHOOL = 'Who is going needs a school email. Sign in to Loopd with one.';
type Options = { base: string; photos?: Photos };

const live = `l.hidden_at is null and l.cancelled_at is null and l.left_feed_at is null and coalesce(l.ends_at,l.starts_at+interval '2 hours')>$3::timestamptz`;
/** The event on this campus whose page this is, or null. */
async function recognised(q: Q, campusId: string, page: PageKey, now: Date): Promise<{ id: string } | null> {
  const { rows: [row] } = await q.query<{ id: string }>(`select l.id from campus_listing l where l.campus_id=$1 and (l.link=any($2::text[]) or l.source_url=any($2::text[])) and ${live}
    order by l.starts_at,l.created_at limit 1`, [campusId, page.forms, now.toISOString()]);
  return row ?? null;
}
const kitOf = (campus: Campus): ExtKit => {
  const kit = KIT[schoolOf(campus.slug)] ?? KIT.loop, css = ([l, c, h]: readonly number[]) => `oklch(${Math.round(l * 1000) / 10}% ${c} ${h})`;
  return { field: css(kit.field), ink: css(kit.ink), action: css(kit.action) };
};

/** The card for someone not connected (state 4): a count only for a public event (feed or hand-entered), never for a posted plan. */
async function signedOut(q: Q, page: PageKey, now: Date, base: string, say: string | null = null): Promise<ExtAnswer> {
  const connect = `${base}/ext/connect`;
  if (!await extReady(q)) return { state: 'out', going: null, connect, say };
  const { rows: [row] } = await q.query<{ going: number }>(`select (select count(*)::int from campus_outing_member m where m.listing_id=l.id) as going from campus_listing l
    where (l.link=any($1::text[]) or l.source_url=any($1::text[])) and ${await publicRule(q, '$2')} order by l.starts_at limit 1`, [page.forms, now.toISOString()]);
  return { state: 'out', going: row?.going ?? null, connect, say };
}

/**
 * What the card shows for this person on this page. `personId` is null when the extension is not connected. Only the
 * people the person knows are named or shown, as in the app; everyone else is a count.
 */
export async function lookUp(db: Db, personId: string | null, url: unknown, now: Date, options: Options): Promise<ExtAnswer> {
  const page = normalPage(url);
  if (!page) return { state: 'not_event' };
  if (!personId) return signedOut(db, page, now, options.base);
  const campus = await campusOf(db, { personId, verifiedEmail: null });
  if (!campus) return signedOut(db, page, now, options.base, NO_SCHOOL);
  const listing = await recognised(db, campus.id, page, now), kit = kitOf(campus);
  if (!listing) return { state: 'none', campus: campus.name, kit, seen: false, others: 0 };
  return cardOf(db, personId, campus, listing.id, options);
}

async function cardOf(db: Db, me: string, campus: Campus, listingId: string, { base, photos = accountPhotos }: Options): Promise<ExtAnswer> {
  const [outings, known, times] = await Promise.all([outingsOn(db, [listingId]), knownTo(db, me), timesOut(db, me)]);
  const { rows: invites } = await db.query<{ id: string }>('select outing_id as id from campus_invite where invitee_id=$1 and outing_id=any($2::uuid[])', [me, outings.map(outing => outing.id)]);
  const picked = pickOuting(outings, me, known, new Set(invites.map(row => row.id)), times), mine = picked.mine ? picked.outing! : null;
  const everyone = [...new Set(outings.flatMap(outing => outing.members.map(member => member.personId)))];
  const byTimes = (a: string, b: string) => (times.get(b) ?? 0) - (times.get(a) ?? 0);
  // In their own group, they see the people they know there; otherwise the people they know in any group.
  const shown = (mine ? mine.members.map(member => member.personId) : everyone).filter(id => id !== me && known.has(id)).sort(byTimes);
  const ids = mine ? [me, ...shown] : shown;
  const [names, picks, pictures, made] = await Promise.all([firstNames(db, ids), pickedFaces(db, ids), photos(db, ids), customFaces(db, ids)]);
  const { picture } = facesOf({ picks, photos: pictures, made }), at = (path: string) => path.startsWith('/') ? `${base}${path}` : path;
  const face = (id: string): ExtFace => ({ first: names.get(id)?.first ?? 'Someone', photo: at(picture(id)), ...id === me ? { me: true as const } : {} });
  const kit = kitOf(campus);
  if (mine) {
    const here = mine.members.find(member => member.personId === me)!.here, link = `${base}/o/${mine.token}`;
    return { state: 'in', campus: campus.name, kit, faces: ids.map(face), others: mine.members.length - ids.length, share: link, invite: link, leave: !here };
  }
  const others = everyone.length - shown.length;
  if (!shown.length) return { state: 'none', campus: campus.name, kit, seen: true, others };
  return { state: 'known', campus: campus.name, kit, known: shown.map(face), others, invite: picked.outing ? `${base}/o/${picked.outing.token}` : null };
}

const refusal = (error: unknown): ExtPress => { if (error instanceof CampusError) return { state: 'refused', message: error.message }; throw error; };

/**
 * "I'm in" from the card (design D6). An event Loopd knows: the same "I'm in" as the app. One it has not seen: its page
 * is read and posted as a plan with that link, as pasting the link does, and the person is in it. Where Loopd cannot
 * fill the plan from the page, or the campus needs a listed place and the page names none, the answer is the posting
 * panel with the link in it.
 */
export async function inFromPage(db: Db, personId: string, url: unknown, now: Date, options: Options & { read?: PageReader }): Promise<ExtPress> {
  const page = normalPage(url);
  if (!page) return { state: 'not_event' };
  const campus = await campusOf(db, { personId, verifiedEmail: null });
  if (!campus) return { state: 'refused', message: NO_SCHOOL };
  const there = await recognised(db, campus.id, page, now);
  try {
    if (there) { await imIn(db, personId, there.id, now); return await cardOf(db, personId, campus, there.id, options); }
    const finish: ExtPress = { state: 'finish', finish: `${options.base}/c/${campus.slug}?post=${encodeURIComponent(page.read)}` };
    const fill = await readPlanLink(campus, page.read, now, options.read ?? readEventPage);
    if (!fill.ok) return { state: 'refused', message: fill.message };
    if (!fill.filled) return finish;
    const { title, starts, ends, place, about } = fill.filled;
    if (PLACES_REQUIRED.has(campus.slug) && !matchPlace(await campusPlaces(db, campus.id), place)) return finish;
    const posted = await postPlan(db, personId, campus, { title, starts, ends: ends || null, place: place || null, about: about || null, link: fill.link }, now);
    return await cardOf(db, personId, campus, posted.id, options);
  } catch (error) { return refusal(error); }
}

/** "Leave" from the card: the same as the app, until the person has checked in. */
export async function leaveFromPage(db: Db, personId: string, url: unknown, now: Date, options: Options): Promise<ExtPress> {
  const page = normalPage(url);
  if (!page) return { state: 'not_event' };
  const campus = await campusOf(db, { personId, verifiedEmail: null });
  if (!campus) return { state: 'refused', message: NO_SCHOOL };
  const there = await recognised(db, campus.id, page, now);
  if (!there) return lookUp(db, personId, url, now, options);
  try { await leave(db, personId, there.id); } catch (error) { return refusal(error); }
  return cardOf(db, personId, campus, there.id, options);
}

// ---- The three routes (design D8) ----

const answer = (body: ExtPress, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
/** Where the card's links lead: the app's own address, else the address the request came to. */
const baseOf = (request: Request) => (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '') || new URL(request.url).origin;

/**
 * GET /api/ext/event?url=, POST /api/ext/in and POST /api/ext/leave with `{ url }`. Only the extension may call them:
 * a request from a web page carries that page's origin and is refused. The token comes as a bearer header; with none,
 * an unknown one or a revoked one the answer is the not-connected card, with no people.
 */
export async function handleExt(db: Db, request: Request, act: 'look' | 'in' | 'leave', now: Date = new Date(), more: { photos?: Photos; read?: PageReader } = {}): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && !origin.startsWith('chrome-extension://')) return answer({ state: 'refused', message: 'Only the Loopd extension can ask this.' }, 403);
  let url: unknown;
  if (act === 'look') url = new URL(request.url).searchParams.get('url');
  else url = ((await request.json().catch(() => null)) as { url?: unknown } | null)?.url;
  const options = { base: baseOf(request), ...more }, bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const personId = await personOfToken(db, bearer, now);
  if (act === 'look' || !personId) return answer(await lookUp(db, personId, url, now, options), act === 'look' || !normalPage(url) ? 200 : 401);
  return answer(act === 'in' ? await inFromPage(db, personId, url, now, options) : await leaveFromPage(db, personId, url, now, options));
}
