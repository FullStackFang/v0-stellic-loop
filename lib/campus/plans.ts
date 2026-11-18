import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { insertListing } from './manage';
import { campusPlaces, matchPlace } from './places';
import { zoned } from './time';
import { goodFor } from './words';

// Plans posted by people (design D14): "running at 5", a study group. A plan appears at once, with no approval, and has
// one outing that anyone signed in can join.

export const MOST_PLANS = 3, DAYS_AHEAD = 14;
export type PlanInput = { title: string; starts: string; ends?: string | null; place?: string | null; about?: string | null };

/** The form's local times ('YYYY-MM-DDTHH:mm', on the campus's clock) as instants, checked. */
function times(tz: string, input: PlanInput, now: Date): { startsAt: string; endsAt: string | null } {
  let starts: Date, ends: Date | null;
  try { starts = zoned(tz, input.starts); ends = input.ends ? zoned(tz, input.ends) : null; } catch { throw new CampusError('Say when it starts.'); }
  if (starts.getTime() <= now.getTime()) throw new CampusError('Pick a start time that has not passed.');
  if (starts.getTime() > now.getTime() + DAYS_AHEAD * 86400000) throw new CampusError(`Plans can be up to ${DAYS_AHEAD} days ahead.`);
  if (ends && ends.getTime() <= starts.getTime()) throw new CampusError('The end comes after the start.');
  if (ends && ends.getTime() > starts.getTime() + 86400000) throw new CampusError('A plan ends within a day of its start.');
  return { startsAt: starts.toISOString(), endsAt: ends?.toISOString() ?? null };
}
function words(input: PlanInput) {
  const title = input.title.trim(), place = input.place?.trim() || null, about = input.about?.trim() || null;
  if (!title) throw new CampusError('Give the plan a title.');
  if (title.length > 200 || (place?.length ?? 0) > 300 || (about?.length ?? 0) > 1000) throw new CampusError('That is too long. Keep the title under 200 letters and the line about it under 1000.');
  return { title, place, about };
}

/** Posts a plan. The poster is counted in, in the plan's one open outing. */
export async function postPlan(db: Db, personId: string, campus: { id: string; tz: string }, input: PlanInput, now: Date = new Date()): Promise<{ id: string; token: string }> {
  const text = words(input), when = times(campus.tz, input, now);
  return db.tx(async q => {
    // Held so two plans posted at once are counted one after the other.
    await q.query('select id from person where id=$1 for update', [personId]);
    const { rows: [{ count }] } = await q.query<{ count: number }>("select count(*)::int as count from campus_listing where posted_by=$1 and origin='member' and cancelled_at is null and hidden_at is null and starts_at>$2", [personId, now.toISOString()]);
    if (count >= MOST_PLANS) throw new CampusError('You have three plans coming up. Cancel one, or wait until one has passed.');
    const listing = await insertListing(q, 'member', { campusId: campus.id, ...text, ...when }, personId);
    const token = randomBytes(12).toString('base64url');
    const { rows: [outing] } = await q.query<{ id: string }>('insert into campus_outing(listing_id,token,started_by,open_to_anyone) values($1,$2,$3,true) returning id', [listing.id, token, personId]);
    await q.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)', [outing.id, listing.id, personId]);
    return { id: listing.id, token };
  });
}

type Plan = { id: string; campusId: string; tz: string; title: string; about: string | null; placeText: string | null; startsAt: string; endsAt: string | null };
/** The plan, if this person may change it now: its poster until it starts, or the admin. Refuses otherwise. */
async function mine(q: Q, who: { personId: string; admin: boolean }, listingId: string, now: Date): Promise<Plan> {
  const { rows: [plan] } = await q.query<Plan & { postedBy: string | null; cancelled: boolean }>(`select l.id,l.campus_id as "campusId",c.tz,l.title,l.about,l.place_text as "placeText",l.starts_at as "startsAt",l.ends_at as "endsAt",l.posted_by as "postedBy",l.cancelled_at is not null as cancelled
    from campus_listing l join campus c on c.id=l.campus_id where l.id=$1 and l.origin='member' for update of l`, [listingId]);
  if (!plan || plan.cancelled || (!who.admin && plan.postedBy !== who.personId)) throw new CampusError('Only the person who posted a plan can change it.');
  if (!who.admin && Date.parse(plan.startsAt) <= now.getTime()) throw new CampusError('This plan has started, so it stays as it is.');
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
    const placeId = matchPlace(await campusPlaces(q, plan.campusId), text.place)?.id ?? null;
    await q.query(`update campus_listing set title=$2,about=$3,place_text=$4,place_id=$5,starts_at=$6,ends_at=$7,words=case when words_by_hand then words else $8 end where id=$1`,
      [listingId, text.title, text.about, text.place, placeId, when.startsAt, when.endsAt, goodFor(text.title, text.about, null)]);
  });
}

/** Cancels a plan: it leaves the list. */
export async function cancelPlan(db: Db, who: { personId: string; admin: boolean }, listingId: string, now: Date = new Date()): Promise<void> {
  await db.tx(async q => { await mine(q, who, listingId, now); await q.query('update campus_listing set cancelled_at=$2 where id=$1', [listingId, now.toISOString()]); });
}
