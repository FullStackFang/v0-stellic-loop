import 'server-only';
import { z } from 'zod';
import type { Q } from '../db';
import { animal, ANIMALS, customFace, MASCOT, PREMIUM } from './animals';
import { addedSchools } from './linkedin';
import { schoolOf } from './schools';
import type { Tile } from './view';

// Which animals the picker offers, and to whom. Every picture is in one of three places, and the admin moves any of
// them (/c/admin, "Animals"): core is offered to everyone, premium to people who subscribed, off to nobody. The
// pictures shipped with the app (public/animals) start as lib/campus/animals.ts has them; an animal a person had made
// starts as theirs alone. A move changes only what can be picked from then on: whoever has a picture keeps it.

// A school's own animal (MASCOT) starts in a fourth place, school: free to people of that school. Wherever the admin
// moves it, it stays that school's alone. No row is kept for it while it is there, so the table needs no new value.
export type Tier = 'core' | 'premium' | 'school' | 'off';
export const NEEDS_PREMIUM = 'That one comes with Loop Ink.';
const BUILT = ANIMALS + PREMIUM.length;
const TIERS = ['core', 'premium', 'off'] as const;
const builtName = (face: number) => face < ANIMALS ? `Animal ${face + 1}` : PREMIUM[face - ANIMALS];

/** The tier of each picture shipped with the app, by its number. */
export async function builtTiers(q: Q): Promise<Tier[]> {
  const tiers: Tier[] = Array.from({ length: BUILT }, (_, face) => face < ANIMALS ? 'core' : MASCOT[face] ? 'school' : 'premium');
  for (const row of (await q.query<{ face: number; tier: Tier }>('select face,tier from campus_animal')).rows) if (row.face >= 0 && row.face < BUILT) tiers[row.face] = row.tier;
  return tiers;
}
type Made = { token: string; tier: 'core' | 'premium' | null; email: string | null };
const madeRows = async (q: Q) => (await q.query<Made>('select p.token::text as token,p.tier,f.email from campus_custom_picture p left join campus_custom_face f on f.person_id=p.person_id order by p.made_at,p.token')).rows;

/** The school a person is at, by the campus they were placed on. Null for a person at no school. */
export async function schoolOfPerson(q: Q, personId: string): Promise<string | null> {
  const slug = (await q.query<{ slug: string }>('select c.slug from campus_person p join campus c on c.id=p.campus_id where p.person_id=$1', [personId])).rows[0]?.slug;
  return slug ? schoolOf(slug) : null;
}
/** Every school a person has: the one they are at, then the ones their LinkedIn profile unlocked (lib/campus/linkedin.ts). */
export async function schoolsOfPerson(q: Q, personId: string): Promise<string[]> {
  const [at, { added }] = [await schoolOfPerson(q, personId), await addedSchools(q, personId)];
  return [...new Set([...(at ? [at] : []), ...added])];
}

/**
 * What the picker offers: the core animals, the premium ones, and the person's schools' own. A made animal is named by when it was made.
 * A school's own animal is offered to people who have that school among their `schools` alone; `all` is for the admin, who is offered every one.
 */
export async function picks(q: Q, schools: readonly string[] | 'all'): Promise<{ core: Tile[]; premium: Tile[]; school: Tile[] }> {
  const tiers = await builtTiers(q), made = await madeRows(q);
  const of = (tier: 'core' | 'premium' | 'school'): Tile[] => [
    ...tiers.flatMap((each, face) => each === tier && (schools === 'all' || !MASCOT[face] || schools.includes(MASCOT[face])) ? [{ face, src: animal(face), name: builtName(face) }] : []),
    ...made.flatMap((each, at) => each.tier === tier ? [{ face: null, src: customFace(each.token), name: `Made animal ${at + 1}` }] : [])];
  return { core: of('core'), premium: of('premium'), school: of('school') };
}

/** For the admin: every picture there is, with where it stands. A made animal that is nobody's but its maker's has tier null. */
export async function catalogue(q: Q): Promise<{ built: { face: number; src: string; name: string; tier: Tier }[]; made: { token: string; src: string; tier: 'core' | 'premium' | null; email: string | null }[] }> {
  const tiers = await builtTiers(q);
  return { built: tiers.map((tier, face) => ({ face, src: animal(face), name: builtName(face), tier })), made: (await madeRows(q)).map(each => ({ ...each, src: customFace(each.token) })) };
}
/** The admin moves a picture shipped with the app. */
export async function setBuiltTier(q: Q, face: number, tier: string): Promise<void> {
  // Back to its school: a school's own animal is there whenever no row says otherwise.
  if (tier === 'school' && MASCOT[face]) { await q.query('delete from campus_animal where face=$1', [face]); return; }
  if (!Number.isInteger(face) || face < 0 || face >= BUILT || !TIERS.includes(tier as (typeof TIERS)[number])) throw new Error('No such animal');
  await q.query('insert into campus_animal(face,tier) values($1,$2) on conflict(face) do update set tier=excluded.tier', [face, tier]);
}
/** The admin moves an animal a person had made: core, premium, or `own` for its maker alone. */
export async function setPictureTier(q: Q, token: string, tier: string): Promise<void> {
  if (!z.uuid().safeParse(token).success || !['core', 'premium', 'own'].includes(tier)) throw new Error('No such picture');
  if (!(await q.query('update campus_custom_picture set tier=$2 where token=$1 returning 1', [token, tier === 'own' ? null : tier])).rows.length) throw new Error('No such picture');
}
