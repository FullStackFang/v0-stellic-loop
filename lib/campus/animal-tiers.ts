import 'server-only';
import { z } from 'zod';
import type { Q } from '../db';
import { animal, ANIMALS, customFace, PREMIUM } from './animals';
import type { Tile } from './view';

// Which animals the picker offers, and to whom. Every picture is in one of three places, and the admin moves any of
// them (/c/admin, "Animals"): core is offered to everyone, premium to people who subscribed, off to nobody. The
// pictures shipped with the app (public/animals) start as lib/campus/animals.ts has them; an animal a person had made
// starts as theirs alone. A move changes only what can be picked from then on: whoever has a picture keeps it.

export type Tier = 'core' | 'premium' | 'off';
export const NEEDS_PREMIUM = 'That one comes with Loop Premium.';
const BUILT = ANIMALS + PREMIUM.length;
const TIERS = ['core', 'premium', 'off'] as const;
const builtName = (face: number) => face < ANIMALS ? `Animal ${face + 1}` : PREMIUM[face - ANIMALS];

/** The tier of each picture shipped with the app, by its number. */
export async function builtTiers(q: Q): Promise<Tier[]> {
  const tiers: Tier[] = Array.from({ length: BUILT }, (_, face) => face < ANIMALS ? 'core' : 'premium');
  for (const row of (await q.query<{ face: number; tier: Tier }>('select face,tier from campus_animal')).rows) if (row.face >= 0 && row.face < BUILT) tiers[row.face] = row.tier;
  return tiers;
}
type Made = { token: string; tier: 'core' | 'premium' | null; email: string | null };
const madeRows = async (q: Q) => (await q.query<Made>('select p.token::text as token,p.tier,f.email from campus_custom_picture p left join campus_custom_face f on f.person_id=p.person_id order by p.made_at,p.token')).rows;

/** What the picker offers: the core animals, then the premium ones. A made animal is named by when it was made. */
export async function picks(q: Q): Promise<{ core: Tile[]; premium: Tile[] }> {
  const tiers = await builtTiers(q), made = await madeRows(q);
  const of = (tier: 'core' | 'premium'): Tile[] => [
    ...tiers.flatMap((each, face) => each === tier ? [{ face, src: animal(face), name: builtName(face) }] : []),
    ...made.flatMap((each, at) => each.tier === tier ? [{ face: null, src: customFace(each.token), name: `Made animal ${at + 1}` }] : [])];
  return { core: of('core'), premium: of('premium') };
}

/** Whether a person has asked to subscribe to Loop Premium. */
export const subscribed = async (q: Q, personId: string) => (await q.query('select 1 from campus_custom_face where person_id=$1', [personId])).rows.length > 0;

/** For the admin: every picture there is, with where it stands. A made animal that is nobody's but its maker's has tier null. */
export async function catalogue(q: Q): Promise<{ built: { face: number; src: string; name: string; tier: Tier }[]; made: { token: string; src: string; tier: 'core' | 'premium' | null; email: string | null }[] }> {
  const tiers = await builtTiers(q);
  return { built: tiers.map((tier, face) => ({ face, src: animal(face), name: builtName(face), tier })), made: (await madeRows(q)).map(each => ({ ...each, src: customFace(each.token) })) };
}
/** The admin moves a picture shipped with the app. */
export async function setBuiltTier(q: Q, face: number, tier: string): Promise<void> {
  if (!Number.isInteger(face) || face < 0 || face >= BUILT || !TIERS.includes(tier as Tier)) throw new Error('No such animal');
  await q.query('insert into campus_animal(face,tier) values($1,$2) on conflict(face) do update set tier=excluded.tier', [face, tier]);
}
/** The admin moves an animal a person had made: core, premium, or `own` for its maker alone. */
export async function setPictureTier(q: Q, token: string, tier: string): Promise<void> {
  if (!z.uuid().safeParse(token).success || !['core', 'premium', 'own'].includes(tier)) throw new Error('No such picture');
  if (!(await q.query('update campus_custom_picture set tier=$2 where token=$1 returning 1', [token, tier === 'own' ? null : tier])).rows.length) throw new Error('No such picture');
}
