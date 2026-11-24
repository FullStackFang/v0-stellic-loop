import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { insertListing } from './manage';
import { campusPlaces, matchPlace, placeFor, PLACES_REQUIRED, type CampusPlace } from './places';
import { eventLink, readEventPage, type PageReader } from '../emba/event-link';
import { hostOf } from '../emba/team-link';
import { imIn } from './outings';
import { MOST_TAGS, offeredTimes, TIMES } from './line';
import { tagFor, tagListing, tagSlug } from './tags';
import { endOf, localInput, localParts, zoned } from './time';
import { goodFor } from './words';

// Plans posted by people (design D14): "running at 5", a study group. A plan appears at once, with no approval, and has
// one outing that anyone signed in can join.

export const MOST_PLANS = 3, DAYS_AHEAD = 14;
export const WHERE = 'Where do you meet? Pick a place.';
export type PlanInput = { title: string;
  /** The start on the campus's clock ('YYYY-MM-DDTHH:mm'). Without one, `day` is used and the time is left open. */
  starts?: string | null;
  /** The day ('YYYY-MM-DD'), for a plan posted with no time (openspec campus-plan-place-and-time, design D1). */
  day?: string | null;
  ends?: string | null; place?: string | null; about?: string | null;
  /** The event page the plan was filled from. Kept when the plan is posted; changing the plan leaves it as it is. */
  link?: string | null;
  /** One tag, with or without the @: short for `tags` with one in it. */
  tag?: string | null;
  /** Up to four tags, in the order typed, with or without the @. Each is made on its first use. */
  tags?: string[] | null };

/** The form's local times ('YYYY-MM-DDTHH:mm', on the campus's clock) as instants, checked. */
function times(tz: string, input: PlanInput, now: Date): { startsAt: string; endsAt: string | null; timeOpen: boolean } {
  if (!input.starts?.trim() && input.day?.trim()) return openDay(tz, input.day.trim(), now);
  let starts: Date, ends: Date | null;
  try { starts = zoned(tz, input.starts ?? ''); ends = input.ends ? zoned(tz, input.ends) : null; } catch { throw new CampusError('Say when it starts.'); }
  if (starts.getTime() <= now.getTime()) throw new CampusError('Pick a start time that has not passed.');
  if (starts.getTime() > now.getTime() + DAYS_AHEAD * 86400000) throw new CampusError(`Plans can be up to ${DAYS_AHEAD} days ahead.`);
  if (ends && ends.getTime() <= starts.getTime()) throw new CampusError('The end comes after the start.');
  if (ends && ends.getTime() > starts.getTime() + 86400000) throw new CampusError('A plan ends within a day of its start.');
  return { startsAt: starts.toISOString(), endsAt: ends?.toISOString() ?? null, timeOpen: false };
}
/** A day with no time: the whole day, 00:00 to 23:59 on the campus's clock, while "When works?" settles it (design D1, D6). */
function openDay(tz: string, day: string, now: Date): { startsAt: string; endsAt: string; timeOpen: true } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new CampusError('Say when it is.');
  let starts: Date, ends: Date;
  try { starts = zoned(tz, `${day}T00:00`); ends = zoned(tz, `${day}T23:59`); } catch { throw new CampusError('Say when it is.'); }
  const today = localParts(tz, now).date;
  if (day < today) throw new CampusError('Pick a day that has not passed.');
  if (starts.getTime() > now.getTime() + DAYS_AHEAD * 86400000) throw new CampusError(`Plans can be up to ${DAYS_AHEAD} days ahead.`);
  if (!offeredTimes(day, tz, now).length) throw new CampusError('Say a time, like 8pm.');
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString(), timeOpen: true };
}
/**
 * The plan's place (design D3, D4): the first of its tags that is a place's @name, else a place its place text names.
 * Null when it has none; on a campus that requires places, that is refused.
 */
async function placeOfPlan(q: Q, campus: { id: string; slug?: string }, tags: string[], placeText: string | null): Promise<{ place: CampusPlace; tag: string | null } | null> {
  const places = await campusPlaces(q, campus.id);
  for (const tag of tags) { const place = placeFor(places, tag); if (place) return { place, tag }; }
  const named = matchPlace(places, placeText);
  if (named) return { place: named, tag: null };
  if (campus.slug && PLACES_REQUIRED.has(campus.slug)) throw new CampusError(WHERE);
  return null;
}
function words(input: PlanInput) {
  const title = input.title.trim(), place = input.place?.trim() || null, about = input.about?.trim() || null;
  if (!title) throw new CampusError('Give the plan a title.');
  if (title.length > 200 || (place?.length ?? 0) > 300 || (about?.length ?? 0) > 1000) throw new CampusError('That is too long. Keep the title under 200 letters and the line about it under 1000.');
  return { title, place, about };
}

/** The stored form of a pasted link. A link typed without "https://" gets it. */
function linkOf(raw: string): { url: string; listed: boolean } {
  const typed = raw.trim();
  if (!typed) throw new CampusError('Paste the link of an event page.');
  const link = eventLink(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
  if ('problem' in link) throw new CampusError(link.problem === 'not_https' ? 'Use a link that starts with https.' : link.problem === 'too_long' ? 'That link is too long to keep.' : 'That does not look like a link to an event page.');
  return link;
}

export type LinkFill =
  | { ok: true; link: string; filled: { title: string; starts: string; ends: string; place: string; about: string } | null; note: string }
  | { ok: false; message: string };
/**
 * Reads a pasted event link for the post form (loop-group-event-links, design D11). Nothing is saved here: the person
 * checks what was read and posts it. On a site Loopd does not read, or a page it could not read, the link is kept and
 * the person types the rest. Never throws.
 */
export async function readPlanLink(campus: { tz: string }, raw: string, now: Date = new Date(), read: PageReader = readEventPage): Promise<LinkFill> {
  let link: string, listed: boolean;
  try { ({ url: link, listed } = linkOf(raw)); } catch (error) { return { ok: false, message: error instanceof CampusError ? error.message : 'That does not look like a link to an event page.' }; }
  const site = hostOf(link), page = listed ? await read(link) : { ok: false as const, reason: 'unlisted' as const };
  if (!page.ok) {
    if (page.reason === 'gone') return { ok: false, message: 'That page is gone, or says the event is off.' };
    return { ok: true, link, filled: null, note: `${page.reason === 'unlisted' ? `Loopd does not read ${site}.` : 'Loopd could not read that page.'} The link is kept: fill in the rest.` };
  }
  const { name, startsAt, endsAt, place, host } = page.facts;
  // A page time with no offset is already a time on the campus's clock.
  const instant = (at: string) => at.length === 16 ? zoned(campus.tz, at) : new Date(at);
  const starts = instant(startsAt), ends = endsAt ? instant(endsAt) : null;
  if (starts.getTime() <= now.getTime()) return { ok: false, message: 'That event has already started.' };
  if (starts.getTime() > now.getTime() + DAYS_AHEAD * 86400000) return { ok: false, message: `That event is more than ${DAYS_AHEAD} days away. Post it closer to the day.` };
  // An end the form would refuse (a festival that runs for days) is left out.
  const kept = ends && ends.getTime() > starts.getTime() && ends.getTime() <= starts.getTime() + 86400000 ? ends : null;
  return { ok: true, link, note: `Read from ${site}. Check it, then post it.`,
    filled: { title: name, starts: localInput(campus.tz, starts), ends: kept ? localInput(campus.tz, kept) : '', place: place ?? '', about: host ? `Hosted by ${host}` : '' } };
}

/**
 * Posts a plan. The poster is counted in, in the plan's one open outing. When the plan carries a link that a plan on
 * this campus already has, nothing is added: the person is counted in on that plan, and `existing` says so.
 */
export async function postPlan(db: Db, personId: string, campus: { id: string; tz: string; slug?: string }, input: PlanInput, now: Date = new Date()): Promise<{ id: string; token: string; existing?: true }> {
  const text = words(input), when = times(campus.tz, input, now), link = input.link?.trim() ? linkOf(input.link).url : null;
  const tags = [...new Set((input.tags ?? (input.tag?.trim() ? [input.tag] : [])).map(tagSlug))];
  if (tags.length > MOST_TAGS) throw new CampusError('A plan carries up to four tags.');
  const made = await db.tx(async q => {
    if (link) {
      // Held so the same link pasted twice at once makes one plan.
      await q.query('select id from campus where id=$1 for update', [campus.id]);
      const { rows: [there] } = await q.query<{ id: string; hidden: boolean }>(`select id,hidden_at is not null as hidden from campus_listing
        where campus_id=$1 and link=$2 and cancelled_at is null and coalesce(ends_at,starts_at+interval '2 hours')>$3::timestamptz order by hidden_at nulls first,created_at limit 1`, [campus.id, link, now.toISOString()]);
      if (there?.hidden) throw new CampusError('This event was taken off the list.');
      if (there) return { id: there.id, existing: true as const };
    }
    // Held so two plans posted at once are counted one after the other.
    await q.query('select id from person where id=$1 for update', [personId]);
    // A plan with no time yet counts until its day ends.
    const { rows: [{ count }] } = await q.query<{ count: number }>("select count(*)::int as count from campus_listing where posted_by=$1 and origin='member' and cancelled_at is null and hidden_at is null and (case when time_open then ends_at else starts_at end)>$2", [personId, now.toISOString()]);
    if (count >= MOST_PLANS) throw new CampusError('You have three plans coming up. Cancel one, or wait until one has passed.');
    const at = await placeOfPlan(q, campus, tags, text.place);
    const listing = await insertListing(q, 'member', { campusId: campus.id, ...text, place: at && at.tag ? at.place.name : text.place, startsAt: when.startsAt, endsAt: when.endsAt, link }, personId);
    if (when.timeOpen || at) await q.query('update campus_listing set time_open=$2,place_id=coalesce($3,place_id) where id=$1', [listing.id, when.timeOpen, at?.place.id ?? null]);
    // The @ that named the place is a place from now on, so the plan's place tag and the grouping of tags follow it.
    if (at?.tag) await q.query("update campus_tag set kind='place',sorted_at=coalesce(sorted_at,now()) where id=$1 and not by_hand", [await tagFor(q, campus.id, at.tag, personId)]);
    const token = randomBytes(12).toString('base64url');
    const { rows: [outing] } = await q.query<{ id: string }>('insert into campus_outing(listing_id,token,started_by,open_to_anyone) values($1,$2,$3,true) returning id', [listing.id, token, personId]);
    await q.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)', [outing.id, listing.id, personId]);
    // After the poster is counted in, so the count that picks a group's lead has them.
    if (tags.length) await tagListing(q, campus.id, listing.id, tags, personId);
    return { id: listing.id, token };
  });
  return 'existing' in made ? { ...made, token: (await imIn(db, personId, made.id, now)).token } : made;
}

type Plan = { id: string; campusId: string; slug: string; tz: string; title: string; about: string | null; placeText: string | null; startsAt: string; endsAt: string | null; timeOpen: boolean };
/** The plan, if this person may change it now: its poster until it starts, or the admin. Refuses otherwise. */
async function mine(q: Q, who: { personId: string; admin: boolean }, listingId: string, now: Date, until: 'start' | 'end' = 'start'): Promise<Plan> {
  const { rows: [plan] } = await q.query<Plan & { postedBy: string | null; cancelled: boolean }>(`select l.id,l.campus_id as "campusId",c.slug,c.tz,l.time_open as "timeOpen",l.title,l.about,l.place_text as "placeText",l.starts_at as "startsAt",l.ends_at as "endsAt",l.posted_by as "postedBy",l.cancelled_at is not null as cancelled
    from campus_listing l join campus c on c.id=l.campus_id where l.id=$1 and l.origin='member' for update of l`, [listingId]);
  if (!plan || plan.cancelled || (!who.admin && plan.postedBy !== who.personId)) throw new CampusError('Only the person who posted a plan can change it.');
  // A plan with no time yet can be changed through its day. Cancelling is open until the plan ends: its poster can always take it back.
  if (!who.admin && until === 'end' && endOf(plan.startsAt, plan.endsAt) <= now.getTime()) throw new CampusError('This plan is over.');
  if (!who.admin && until === 'start' && Date.parse(plan.timeOpen ? plan.endsAt ?? plan.startsAt : plan.startsAt) <= now.getTime()) throw new CampusError('This plan has started, so it stays as it is.');
  return plan;
}

/** A plan as its poster may edit it, or null when they may not. The times are on the campus's clock. */
export async function editablePlan(db: Db, who: { personId: string; admin: boolean }, listingId: string, now: Date = new Date()): Promise<Plan | null> {
  return db.tx(q => mine(q, who, listingId, now)).catch(error => { if (error instanceof CampusError) return null; throw error; });
}

/** Changes a plan. The people in it stay in. */
export async function changePlan(db: Db, who: { personId: string; admin: boolean }, listingId: string, input: PlanInput, now: Date = new Date()): Promise<void> {
  const text = words(input);
  await db.tx(async q => {
    const plan = await mine(q, who, listingId, now), when = times(plan.tz, input, now);
    const placeId = (await placeOfPlan(q, { id: plan.campusId, slug: plan.slug }, [], text.place))?.place.id ?? null;
    await q.query(`update campus_listing set title=$2,about=$3,place_text=$4,place_id=$5,starts_at=$6,ends_at=$7,time_open=$9,words=case when words_by_hand then words else $8 end where id=$1`,
      [listingId, text.title, text.about, text.place, placeId, when.startsAt, when.endsAt, goodFor(text.title, text.about, null), when.timeOpen]);
    if (!when.timeOpen) await q.query('delete from campus_time_pick where listing_id=$1', [listingId]);
  });
}

/**
 * "When works for you?" (design D6): marks one of the offered times on a plan whose time is not set, or unmarks it when
 * it was marked. Only for the people in the plan other than its poster, who sets the time.
 */
export async function pickTime(db: Db, personId: string, listingId: string, at: string, now: Date = new Date()): Promise<{ marked: boolean }> {
  return db.tx(async q => {
    const { rows: [plan] } = await q.query<{ tz: string; startsAt: string; timeOpen: boolean; postedBy: string | null; cancelled: boolean; isIn: boolean }>(`select c.tz,l.starts_at as "startsAt",l.time_open as "timeOpen",l.posted_by as "postedBy",l.cancelled_at is not null as cancelled,
        exists(select 1 from campus_outing_member m where m.listing_id=l.id and m.person_id=$2) as "isIn"
      from campus_listing l join campus c on c.id=l.campus_id where l.id=$1 and l.origin='member' for update of l`, [listingId, personId]);
    if (!plan || plan.cancelled || !plan.isIn) throw new CampusError("Say I'm in first.");
    if (!plan.timeOpen) throw new CampusError('This plan has its time now.');
    if (plan.postedBy === personId) throw new CampusError('You set the time: pick one and send it.');
    if (!offeredTimes(localParts(plan.tz, new Date(plan.startsAt)).date, plan.tz, now).includes(at)) throw new CampusError('That time is not on offer.');
    const { rows } = await q.query('delete from campus_time_pick where listing_id=$1 and person_id=$2 and at=$3::time returning at', [listingId, personId, at]);
    if (!rows.length) await q.query('insert into campus_time_pick(listing_id,person_id,at) values($1,$2,$3::time)', [listingId, personId, at]);
    return { marked: !rows.length };
  });
}

/** Sends the time of a plan whose time is not set: its poster or the admin, to one of the times still ahead. The marks go. */
export async function setTime(db: Db, who: { personId: string; admin: boolean }, listingId: string, at: string, now: Date = new Date()): Promise<void> {
  await db.tx(async q => {
    const plan = await mine(q, who, listingId, now);
    if (!plan.timeOpen) throw new CampusError('This plan has its time now.');
    if (!TIMES.includes(at)) throw new CampusError('That time is not on offer.');
    const starts = zoned(plan.tz, `${localParts(plan.tz, new Date(plan.startsAt)).date}T${at}`);
    if (starts.getTime() <= now.getTime()) throw new CampusError('That time has passed. Pick a later one.');
    await q.query('update campus_listing set starts_at=$2,ends_at=null,time_open=false,time_set_at=$3 where id=$1', [listingId, starts.toISOString(), now.toISOString()]);
    await q.query('delete from campus_time_pick where listing_id=$1', [listingId]);
  });
}

/** Cancels a plan: it leaves the list. */
export async function cancelPlan(db: Db, who: { personId: string; admin: boolean }, listingId: string, now: Date = new Date()): Promise<void> {
  await db.tx(async q => { await mine(q, who, listingId, now, 'end'); await q.query('update campus_listing set cancelled_at=$2 where id=$1', [listingId, now.toISOString()]); });
}
