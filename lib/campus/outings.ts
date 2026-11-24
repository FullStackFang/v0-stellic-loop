import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { knownTo, timesOut } from './knows';
import { metres } from './sections';
import { checkInOpen, endOf } from './time';

// An outing is one group's visit to one event (design D6). Saying "I'm in" or "Register me" puts a person in one.
// The people in the same outing are the group a reward counts. A person is in at most one outing per event.

export type Outing = { id: string; listingId: string; token: string; open: boolean; createdAt: string; members: { personId: string; here: boolean; registered: boolean }[] };

/** Every outing on these events, oldest first, each with who is in it. */
export async function outingsOn(q: Q, listingIds: readonly string[]): Promise<Outing[]> {
  if (!listingIds.length) return [];
  const { rows } = await q.query<Omit<Outing, 'members'> & { personId: string | null; here: boolean; registered: boolean }>(
    `select o.id,o.listing_id as "listingId",o.token,o.open_to_anyone as open,o.created_at as "createdAt",m.person_id as "personId",m.checked_in_at is not null as here,coalesce(m.registered,false) as registered
     from campus_outing o left join campus_outing_member m on m.outing_id=o.id where o.listing_id=any($1::uuid[]) order by o.created_at,o.id,m.joined_at,m.person_id`, [listingIds]);
  const outings = new Map<string, Outing>();
  for (const { personId, here, registered, ...outing } of rows) {
    let held = outings.get(outing.id);
    if (!held) outings.set(outing.id, held = { ...outing, members: [] });
    if (personId) held.members.push({ personId, here, registered });
  }
  return [...outings.values()];
}

/**
 * The outing of one event that a person is in, or would join by pressing "I'm in": the one they were invited to, else
 * the plan's open outing, else the one whose people they have been out with most: each person they know scores one
 * plus the times the two have been out together. A tie goes to more people they know, then to the older outing.
 * Null when they would start a new one.
 */
export function pickOuting(outings: readonly Outing[], personId: string | null, known: { has(id: string): boolean }, invitedTo: { has(id: string): boolean }, times: ReadonlyMap<string, number> = new Map()): { outing: Outing | null; mine: boolean } {
  const mine = personId ? outings.find(outing => outing.members.some(member => member.personId === personId)) : undefined;
  if (mine) return { outing: mine, mine: true };
  const invited = outings.find(outing => invitedTo.has(outing.id)), open = outings.find(outing => outing.open);
  if (invited || open) return { outing: invited ?? open!, mine: false };
  // Outings come oldest first, so keeping the first of equals gives the older one.
  let best: Outing | null = null, top = 0, most = 0;
  for (const outing of outings) {
    const people = outing.members.filter(member => known.has(member.personId));
    const score = people.reduce((sum, member) => sum + 1 + (times.get(member.personId) ?? 0), 0);
    if (score > top || (score === top && people.length > most)) { best = outing; top = score; most = people.length; }
  }
  return { outing: best, mine: false };
}

type Held = { id: string; origin: string; startsAt: string; endsAt: string | null; live: boolean };
/** The event, held until the transaction ends so two people joining at once are taken one after the other. */
async function hold(q: Q, listingId: string, now: Date): Promise<Held> {
  const { rows: [listing] } = await q.query<Held>(`select id,origin,starts_at as "startsAt",ends_at as "endsAt",(hidden_at is null and cancelled_at is null and left_feed_at is null) as live
    from campus_listing where id=$1 for update`, [listingId]);
  if (!listing || !listing.live) throw new CampusError('This event is no longer on the list.');
  if (endOf(listing.startsAt, listing.endsAt) < now.getTime()) throw new CampusError('This event has ended.');
  return listing;
}
const newToken = () => randomBytes(12).toString('base64url');
const add = (q: Q, outing: { id: string; listingId: string }, personId: string, registered: boolean) =>
  q.query('insert into campus_outing_member(outing_id,listing_id,person_id,registered) values($1,$2,$3,$4)', [outing.id, outing.listingId, personId, registered]);
/** An outing nobody is in any more is removed, unless it is a plan's open one. */
const sweep = (q: Q, outingId: string) =>
  q.query('delete from campus_outing o where o.id=$1 and not o.open_to_anyone and not exists(select 1 from campus_outing_member m where m.outing_id=o.id)', [outingId]);

/**
 * "I'm in", and "Register me" for a feed event (recorded in Loopd only, marked as registered).
 * Pressing it again changes nothing. Returns the share token of the outing the person is now in.
 */
export async function imIn(db: Db, personId: string, listingId: string, now: Date = new Date()): Promise<{ token: string; joined: boolean }> {
  return db.tx(async q => {
    const listing = await hold(q, listingId, now), outings = await outingsOn(q, [listingId]);
    const { rows: invites } = await q.query<{ id: string }>('select outing_id as id from campus_invite where invitee_id=$1 and outing_id=any($2::uuid[])', [personId, outings.map(outing => outing.id)]);
    const picked = pickOuting(outings, personId, await knownTo(q, personId), new Set(invites.map(row => row.id)), await timesOut(q, personId));
    if (picked.mine) return { token: picked.outing!.token, joined: false };
    const outing = picked.outing ?? (await q.query<{ id: string; listingId: string; token: string }>('insert into campus_outing(listing_id,token,started_by) values($1,$2,$3) returning id,listing_id as "listingId",token', [listingId, newToken(), personId])).rows[0];
    await add(q, outing, personId, listing.origin === 'feed');
    return { token: outing.token, joined: true };
  });
}

/** The outing behind a share link, or null. */
export async function outingByToken(q: Q, token: string): Promise<{ id: string; listingId: string; campusId: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return (await q.query<{ id: string; listingId: string; campusId: string }>('select o.id,o.listing_id as "listingId",l.campus_id as "campusId" from campus_outing o join campus_listing l on l.id=o.listing_id where o.token=$1', [token])).rows[0] ?? null;
}

/** "Join" from a share link. A person in another outing of the same event is moved to this one. */
export async function joinByToken(db: Db, personId: string, token: string, now: Date = new Date()): Promise<{ listingId: string; joined: boolean }> {
  return db.tx(async q => {
    const outing = await outingByToken(q, token);
    if (!outing) throw new CampusError('This link does not lead to a group any more.');
    const listing = await hold(q, outing.listingId, now);
    // Looked up before the hold; its last member may have left in between.
    if (!await outingByToken(q, token)) throw new CampusError('This link does not lead to a group any more.');
    const { rows: [current] } = await q.query<{ outingId: string; here: boolean }>('select outing_id as "outingId",checked_in_at is not null as here from campus_outing_member where listing_id=$1 and person_id=$2', [outing.listingId, personId]);
    if (current?.outingId === outing.id) return { listingId: outing.listingId, joined: false };
    if (current?.here) throw new CampusError('You have already checked in with another group.');
    if (current) {
      await q.query('delete from campus_outing_member where outing_id=$1 and person_id=$2', [current.outingId, personId]);
      await q.query('delete from campus_invite where outing_id=$1 and inviter_id=$2', [current.outingId, personId]);
      await sweep(q, current.outingId);
    }
    await add(q, outing, personId, listing.origin === 'feed');
    return { listingId: outing.listingId, joined: true };
  });
}

/** Leaving, which is possible until the person has checked in. */
export async function leave(db: Db, personId: string, listingId: string): Promise<void> {
  await db.tx(async q => {
    // The same hold joining takes, so a group is never removed under someone who is joining it.
    await q.query('select id from campus_listing where id=$1 for update', [listingId]);
    const { rows: [gone] } = await q.query<{ outingId: string }>('delete from campus_outing_member where listing_id=$1 and person_id=$2 and checked_in_at is null returning outing_id as "outingId"', [listingId, personId]);
    if (!gone) {
      const { rows } = await q.query('select 1 from campus_outing_member where listing_id=$1 and person_id=$2', [listingId, personId]);
      if (rows.length) throw new CampusError('You have checked in, so you are staying in.');
      return;
    }
    await q.query('delete from campus_invite where outing_id=$1 and inviter_id=$2', [gone.outingId, personId]);
    await sweep(q, gone.outingId);
  });
}

/** Where the browser says the person is. `accuracy` is its own guess of how far off that is, in metres. */
export type Spot = { lat: number; lon: number; accuracy: number };
/** How close to an event's place a check-in must be, and how much of a rough reading is allowed for on top. */
export const NEAR = 150, ROUGH = 100;

/**
 * "Check in", inside the window. At an event with a known place the person must be there: within NEAR metres of it,
 * allowing up to ROUGH metres for the reading's own error. Where they are is checked and not kept. At an event with
 * no known place the press is enough. A second press keeps the first time.
 */
export async function checkIn(db: Db, personId: string, listingId: string, now: Date = new Date(), at: Spot | null = null): Promise<{ at: string }> {
  return db.tx(async q => {
    const { rows: [row] } = await q.query<{ outingId: string; startsAt: string; endsAt: string | null; placeName: string | null; lat: number | null; lon: number | null; here: boolean; timeOpen: boolean }>(
      `select m.outing_id as "outingId",l.time_open as "timeOpen",l.starts_at as "startsAt",l.ends_at as "endsAt",p.name as "placeName",p.lat,p.lon,m.checked_in_at is not null as here
      from campus_outing_member m join campus_listing l on l.id=m.listing_id left join campus_place p on p.id=l.place_id
      where m.listing_id=$1 and m.person_id=$2 and l.cancelled_at is null for update of m`, [listingId, personId]);
    if (!row) throw new CampusError('Say you are in before checking in.');
    if (row.timeOpen) throw new CampusError('Checking in opens once the plan has its time.');
    if (!checkInOpen(row.startsAt, row.endsAt, now)) throw new CampusError('Checking in opens 30 minutes before the start and closes when the event ends.');
    if (!row.here && row.placeName !== null && row.lat !== null && row.lon !== null) {
      if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) throw new CampusError(`Turn on location to check in: it only checks that you are at ${row.placeName}.`);
      const away = metres([at.lon, at.lat], [row.lon, row.lat]);
      if (away - Math.min(Math.max(at.accuracy, 0) || 0, ROUGH) > NEAR) throw new CampusError(`You look about ${Math.round(away / 50) * 50} m from ${row.placeName}. Check in when you get there.`);
    }
    const { rows: [saved] } = await q.query<{ at: string }>('update campus_outing_member set checked_in_at=coalesce(checked_in_at,$3) where outing_id=$1 and person_id=$2 returning checked_in_at as at', [row.outingId, personId, now.toISOString()]);
    return saved;
  });
}

/**
 * Who to suggest in "Invite people": up to four people the person knows who are not in their outing, each with how
 * they are known and whether they have been invited. People already invited come first, so an invite stays in view;
 * then the people they have been out with most.
 */
export async function inviteChoices(q: Q, personId: string, outing: Outing, known: ReadonlyMap<string, string>, times: ReadonlyMap<string, number> = new Map()): Promise<{ personId: string; why: string; invited: boolean }[]> {
  const { rows } = await q.query<{ id: string }>('select invitee_id as id from campus_invite where outing_id=$1 and inviter_id=$2', [outing.id, personId]);
  const invited = new Set(rows.map(row => row.id)), inside = new Set(outing.members.map(member => member.personId)), out = (id: string) => times.get(id) ?? 0;
  return [...known].filter(([id]) => !inside.has(id)).map(([id, why]) => ({ personId: id, why, invited: invited.has(id) }))
    .sort((a, b) => Number(b.invited) - Number(a.invited) || out(b.personId) - out(a.personId) || a.why.localeCompare(b.why) || a.personId.localeCompare(b.personId)).slice(0, 4);
}

async function myOuting(q: Q, personId: string, listingId: string): Promise<string> {
  const { rows: [row] } = await q.query<{ id: string }>('select outing_id as id from campus_outing_member where listing_id=$1 and person_id=$2', [listingId, personId]);
  if (!row) throw new CampusError('Say you are in before inviting people.');
  return row.id;
}
/** Records an invite to someone the person knows. Nothing is sent: the copied link is how an invite travels. */
export async function invite(db: Db, personId: string, listingId: string, inviteeId: string): Promise<void> {
  await db.tx(async q => {
    const outingId = await myOuting(q, personId, listingId);
    if (!(await knownTo(q, personId)).has(inviteeId)) throw new CampusError('You can invite people you share a group with or have been out with. For anyone else, copy the link.');
    const { rows } = await q.query('select 1 from campus_outing_member where outing_id=$1 and person_id=$2', [outingId, inviteeId]);
    if (rows.length) return;
    await q.query('insert into campus_invite(outing_id,inviter_id,invitee_id) values($1,$2,$3) on conflict do nothing', [outingId, personId, inviteeId]);
  });
}
export async function uninvite(db: Db, personId: string, listingId: string, inviteeId: string): Promise<void> {
  await db.query('delete from campus_invite i using campus_outing o where o.id=i.outing_id and o.listing_id=$1 and i.inviter_id=$2 and i.invitee_id=$3', [listingId, personId, inviteeId]);
}
