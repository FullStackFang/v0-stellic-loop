import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import type { Db, Q } from '../db';
import { clerkIssuer, clerkPortalConfigured } from '../emba/clerk-identity';
import { UNNAMED } from '../emba/member-name';
import { ANIMALS, CUSTOM, PREMIUM } from './animals';
import { builtTiers, NEEDS_PREMIUM, subscribed } from './animal-tiers';
import { CampusError } from './errors';
import { listCampuses, type Campus } from './listings';
import { schoolOfEmail } from './schools';

/**
 * The campus a person belongs to (design D21). They are placed the first time they are seen, at the school their
 * verified email ends in, and stay there. Null for an address at no school: that person has no campus.
 */
export async function campusOf(db: Db, who: { personId: string; verifiedEmail: string | null }): Promise<Campus | null> {
  const campuses = await listCampuses(db);
  const placed = async () => (await db.query<{ id: string }>('select campus_id as id from campus_person where person_id=$1', [who.personId])).rows[0]?.id;
  let id = await placed();
  if (!id) {
    const school = schoolOfEmail(campuses, who.verifiedEmail);
    if (!school) return null;
    await db.query('insert into campus_person(person_id,campus_id) values($1,$2) on conflict do nothing', [who.personId, school.id]);
    id = await placed();
  }
  return campuses.find(campus => campus.id === id) ?? null;
}

/** First names, by person. Someone whose name Loop does not have yet is "Someone". */
export async function firstNames(q: Q, personIds: readonly string[]): Promise<Map<string, { first: string; name: string }>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; name: string }>('select id,name from person where id=any($1::uuid[])', [personIds]);
  return new Map(rows.map(row => { const name = row.name === UNNAMED ? 'Someone' : row.name.trim(); return [row.id, { first: name.split(/\s+/)[0], name }]; }));
}

/** The face each person picked: an animal's number, or PHOTO. A person who has not picked is left out. */
export async function pickedFaces(q: Q, personIds: readonly string[]): Promise<Map<string, number>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; face: number }>('select person_id as id,face from campus_face where person_id=any($1::uuid[])', [personIds]);
  return new Map(rows.map(row => [row.id, row.face]));
}
/** A person picks their face: one of the animals, a premium one, PHOTO for the photo of their sign-in account, or CUSTOM for the animal they had made. */
export async function pickFace(q: Q, personId: string, face: number, premium = false): Promise<void> {
  if (!Number.isInteger(face) || face < CUSTOM || face >= ANIMALS + PREMIUM.length) throw new CampusError('Pick one of the animals.');
  // A premium animal is for someone who subscribed (`premium` is also true for the admin); one that is off is for nobody.
  const tier = face >= 0 ? (await builtTiers(q))[face] : 'core';
  if (tier === 'off') throw new CampusError('Pick one of the animals.');
  if (tier === 'premium' && !premium && !(await subscribed(q, personId))) throw new CampusError(NEEDS_PREMIUM);
  if (face === CUSTOM && !(await q.query('select 1 from campus_custom_picture p where p.token=(select coalesce(c.picture,f.token) from (select $1::uuid as id) i left join campus_face c on c.person_id=i.id left join campus_custom_face f on f.person_id=i.id)', [personId])).rows.length) throw new CampusError('Pick one of the animals.');
  await q.query('insert into campus_face(person_id,face) values($1,$2) on conflict(person_id) do update set face=excluded.face,picked_at=now()', [personId, face]);
}

export type Photos =(db: Db, personIds: string[]) => Promise<Record<string, string>>;

/** Photos come from the sign-in account (design D19), read when a page needs them, for people who picked theirs as their face. Loop keeps no copy. A person with none is left out. */
export const accountPhotos: Photos = async (db, personIds) => {
  const issuer = clerkIssuer();
  if (!issuer || !clerkPortalConfigured() || !personIds.length) return {};
  const { rows } = await db.query<{ personId: string; subject: string }>('select person_id as "personId",subject from emba_identity i where person_id=any($1::uuid[]) and issuer=$2 and revoked_at is null', [personIds, issuer]);
  const found: Record<string, string> = {};
  try {
    const client = await clerkClient();
    for (let at = 0; at < rows.length; at += 100) {
      const part = rows.slice(at, at + 100);
      const { data } = await client.users.getUserList({ userId: part.map(row => row.subject), limit: 100 });
      for (const user of data) { const row = part.find(candidate => candidate.subject === user.id); if (row && user.hasImage && user.imageUrl) found[row.personId] = user.imageUrl; }
    }
  } catch { /* A screen with initials is better than no screen. */ }
  return found;
};
