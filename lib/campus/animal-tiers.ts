import 'server-only';
import { z } from 'zod';
import type { Q } from '../db';
import { animal, ANIMALS, customFace, MASCOT, NAMES, PREMIUM } from './animals';
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
export const NEEDS_PREMIUM = 'That one comes with Loopd Ink.';
const BUILT = ANIMALS + PREMIUM.length;
const TIERS = ['core', 'premium', 'off'] as const;
const builtName = (face: number) => face < ANIMALS ? `Animal ${face + 1}` : PREMIUM[face - ANIMALS];
const builtWords = (face: number) => NAMES[face] ? [NAMES[face]] : [];

// The admin may name any picture, and give it the words the picker finds it by (/c/admin, "Animals"). Null is what it
// shipped with: the name above, and one word for each of the first 36.
type Said = { name: string | null; words: string[] | null };
/** What the admin typed, by number and by token. Nothing while the table is not there: the migration is run by hand, after the deploy. */
// Asked of the catalogue first, not by a query that fails: a failed query aborts the transaction it is in, and every read after it in that transaction.
async function saidRows(q: Q): Promise<{ built: Map<number, Said>; made: Map<string, Said> }> {
  const { rows: [there] } = await q.query<{ ok: boolean }>("select to_regclass('campus_animal_name') is not null and exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='campus_custom_picture' and column_name='words') as ok");
  if (!there?.ok) return { built: new Map(), made: new Map() };
  const built = (await q.query<Said & { face: number }>('select face,name,words from campus_animal_name')).rows;
  const made = (await q.query<Said & { token: string }>('select token::text as token,name,words from campus_custom_picture where name is not null or words is not null')).rows;
  return { built: new Map(built.map(row => [row.face, row])), made: new Map(made.map(row => [row.token, row])) };
}

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
  const tiers = await builtTiers(q), made = await madeRows(q), said = await saidRows(q);
  const of = (tier: 'core' | 'premium' | 'school'): Tile[] => [
    ...tiers.flatMap((each, face) => each === tier && (schools === 'all' || !MASCOT[face] || schools.includes(MASCOT[face])) ? [{ face, src: animal(face), name: said.built.get(face)?.name ?? builtName(face), words: (said.built.get(face)?.words ?? builtWords(face)).join(' ') }] : []),
    ...made.flatMap((each, at) => each.tier === tier ? [{ face: null, src: customFace(each.token), name: said.made.get(each.token)?.name ?? `Made animal ${at + 1}`, words: (said.made.get(each.token)?.words ?? ['made']).join(' ') }] : [])];
  return { core: of('core'), premium: of('premium'), school: of('school') };
}

/** For the admin: every picture there is, with where it stands, its name and the words it is found by. A made animal that is nobody's but its maker's has tier null, and one the admin has not named has name null. */
export async function catalogue(q: Q): Promise<{ built: { face: number; src: string; name: string; words: string[]; tier: Tier }[]; made: { token: string; src: string; name: string | null; words: string[]; tier: 'core' | 'premium' | null; email: string | null }[] }> {
  const tiers = await builtTiers(q), said = await saidRows(q);
  return { built: tiers.map((tier, face) => ({ face, src: animal(face), name: said.built.get(face)?.name ?? builtName(face), words: said.built.get(face)?.words ?? builtWords(face), tier })),
    made: (await madeRows(q)).map(each => ({ ...each, src: customFace(each.token), name: said.made.get(each.token)?.name ?? null, words: said.made.get(each.token)?.words ?? ['made'] })) };
}
/**
 * The admin names a picture and sets the words it is found by: one shipped with the app, by number, or one a person had made, by token.
 * An empty name is the name it shipped with. Words are kept in small letters, and a word may be a phrase. Returns the words kept.
 */
export async function setAnimalName(q: Q, which: { face: number } | { token: string }, name: string, words: string[]): Promise<string[]> {
  const kept = [...new Set(words.map(word => word.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))], called = name.trim().replace(/\s+/g, ' ');
  if (called.length > 40) throw new Error('A name is 40 letters at most');
  if (kept.length > 12 || kept.some(word => word.length > 40)) throw new Error('Up to twelve words, of 40 letters at most');
  if ('face' in which) {
    if (!Number.isInteger(which.face) || which.face < 0 || which.face >= BUILT) throw new Error('No such animal');
    await q.query('insert into campus_animal_name(face,name,words) values($1,$2,$3) on conflict(face) do update set name=excluded.name,words=excluded.words', [which.face, called && called !== builtName(which.face) ? called : null, kept]);
  } else if (!z.uuid().safeParse(which.token).success || !(await q.query('update campus_custom_picture set name=$2,words=$3 where token=$1 returning 1', [which.token, called || null, kept])).rows.length) throw new Error('No such picture');
  return kept;
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
