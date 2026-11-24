import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { knownTo, timesOut } from './knows';
import { imInWith, outingsOn, pickOuting } from './outings';
import { firstNames } from './people';

// The person's tap (openspec campus-assistant-tools, design D6). An assistant asking to join an event, or to close the
// loop on an outing, changes nothing: it makes a one-use tap that lasts ten minutes. Only the person's press uses it,
// and only for the person it was made for. A tap has two codes: the card's, which reaches only the card, and the
// link's (/c/tap/<code>), which the assistant sees and only that page accepts. So the assistant holds no code it can send.

export const TAP_MINUTES = 10;
export type TapAction = 'join' | 'close';
export type Tap = { action: TapAction; listingId: string; outingId: string | null };
/** Where a press comes from: the in-chat card, or the page the link opens. Each accepts only its own code. */
export type TapFrom = 'card' | 'link';
/** Why a press did nothing. `refused` carries the app's own words (the event ended, it is no longer listed). */
export type TapRefusal = { done: false; reason: 'unknown' | 'not_yours' | 'used' | 'expired' } | { done: false; reason: 'refused'; message: string };
export type TapDone = { done: true; action: 'join'; listingId: string; token: string; joined: boolean } | { done: true; action: 'close'; listingId: string; checkedIn: number; of: number };

const CODE = /^[A-Za-z0-9_-]{16,64}$/;

/** A fresh tap for one person and one step, with its card's code and its link's. */
export async function makeTap(q: Q, personId: string, action: TapAction, listingId: string, outingId: string | null, now: Date = new Date()): Promise<{ card: string; link: string }> {
  const card = randomBytes(18).toString('base64url'), link = randomBytes(18).toString('base64url');
  await q.query('insert into campus_tap(code,link_code,person_id,action,listing_id,outing_id,expires_at,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [card, link, personId, action, listingId, outingId, new Date(now.getTime() + TAP_MINUTES * 60000).toISOString(), now.toISOString()]);
  return { card, link };
}

type Row = Tap & { code: string; personId: string; expired: boolean; used: boolean };
async function find(q: Q, code: string, from: TapFrom, now: Date, lock: boolean): Promise<Row | null> {
  if (!CODE.test(code)) return null;
  const { rows: [row] } = await q.query<Row>(`select code,person_id as "personId",action,listing_id as "listingId",outing_id as "outingId",expires_at<=$2::timestamptz as expired,used_at is not null as used
    from campus_tap where ${from === 'card' ? 'code' : 'link_code'}=$1${lock ? ' for update' : ''}`, [code, now.toISOString()]);
  return row ?? null;
}
const refusalOf = (row: Row | null, personId: string): TapRefusal | null =>
  !row ? { done: false, reason: 'unknown' } : row.personId !== personId ? { done: false, reason: 'not_yours' } : row.used ? { done: false, reason: 'used' } : row.expired ? { done: false, reason: 'expired' } : null;

/** What a code is for, read without using it: what the confirm page shows. Opening the page uses nothing. */
export async function readTap(q: Q, personId: string, code: string, from: TapFrom, now: Date = new Date()): Promise<Tap | TapRefusal> {
  const row = await find(q, code, from, now, false), refused = refusalOf(row, personId);
  return refused ?? { action: row!.action, listingId: row!.listingId, outingId: row!.outingId };
}

/**
 * Whether the person may close the loop on their outing of this event (design D8): they are in it, it has started, and
 * they have checked in. Returns the outing, or why not.
 */
export async function closable(q: Q, personId: string, listingId: string, now: Date = new Date()): Promise<{ outingId: string } | { reason: 'not_in' | 'not_started' | 'not_here' | 'closed' }> {
  const { rows: [row] } = await q.query<{ outingId: string; started: boolean; here: boolean; closed: boolean }>(`select m.outing_id as "outingId",l.starts_at<=$3::timestamptz and not l.time_open as started,
    m.checked_in_at is not null as here,m.closed_at is not null as closed from campus_outing_member m join campus_listing l on l.id=m.listing_id where m.listing_id=$1 and m.person_id=$2`, [listingId, personId, now.toISOString()]);
  if (!row) return { reason: 'not_in' };
  if (row.closed) return { reason: 'closed' };
  if (!row.here) return { reason: 'not_here' };
  if (!row.started) return { reason: 'not_started' };
  return { outingId: row.outingId };
}

/** The press. It does the step and marks the code used in one transaction, so a step is done once or not at all. */
export async function pressTap(db: Db, personId: string, code: string, from: TapFrom, now: Date = new Date()): Promise<TapDone | TapRefusal> {
  try {
    return await db.tx(async (q): Promise<TapDone | TapRefusal> => {
      const row = await find(q, code, from, now, true), refused = refusalOf(row, personId);
      if (refused) return refused;
      const tap = row!;
      let done: TapDone;
      if (tap.action === 'join') done = { done: true, action: 'join', listingId: tap.listingId, ...await imInWith(q, personId, tap.listingId, now) };
      else {
        const can = await closable(q, personId, tap.listingId, now);
        if ('reason' in can) throw new CampusError(can.reason === 'not_here' ? 'Check in on your phone first.' : can.reason === 'closed' ? 'You have already closed the loop on this.' : can.reason === 'not_in' ? 'You are not in a group for this event.' : 'This has not started yet.');
        await q.query('update campus_outing_member set closed_at=coalesce(closed_at,$3) where outing_id=$1 and person_id=$2', [can.outingId, personId, now.toISOString()]);
        done = { done: true, action: 'close', listingId: tap.listingId, ...await checkedInOf(q, can.outingId) };
      }
      await q.query('update campus_tap set used_at=$2 where code=$1', [tap.code, now.toISOString()]);
      return done;
    });
  } catch (error) {
    if (error instanceof CampusError) return { done: false, reason: 'refused', message: error.message };
    throw error;
  }
}

/** Who the person would be with if they joined now: the outing "I'm in" would pick, named only where they know someone. */
export async function wouldBeWith(q: Q, personId: string, listingId: string): Promise<{ known: string[]; others: number }> {
  const outings = await outingsOn(q, [listingId]), known = await knownTo(q, personId), times = await timesOut(q, personId);
  const { rows } = await q.query<{ id: string }>('select outing_id as id from campus_invite where invitee_id=$1 and outing_id=any($2::uuid[])', [personId, outings.map(outing => outing.id)]);
  const picked = pickOuting(outings, personId, known, new Set(rows.map(row => row.id)), times).outing;
  if (!picked) return { known: [], others: 0 };
  const members = picked.members.filter(member => member.personId !== personId), knownIds = members.filter(member => known.has(member.personId)).map(member => member.personId)
    .sort((a, b) => (times.get(b) ?? 0) - (times.get(a) ?? 0));
  const names = await firstNames(q, knownIds);
  return { known: knownIds.map(id => names.get(id)?.first ?? 'Someone'), others: members.length - knownIds.length };
}


/** How many of the person's outing have checked in, of how many are in it. */
export async function checkedInOf(q: Q, outingId: string): Promise<{ checkedIn: number; of: number }> {
  const { rows: [count] } = await q.query<{ here: number; of: number }>('select count(*) filter (where checked_in_at is not null)::int as here,count(*)::int as of from campus_outing_member where outing_id=$1', [outingId]);
  return { checkedIn: count.here, of: count.of };
}
