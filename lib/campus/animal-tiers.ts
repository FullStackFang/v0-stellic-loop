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
// moves it, it stays that school's alone. No row is kept for it while it is there. The admin may also make any other
// animal, shipped or made, a school's own: its row then holds tier school and the school (migration 20261120600000).
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

/** Each picture shipped with the app, by its number: its tier, and the school it is the own animal of (null: everyone's). */
export async function builtAnimals(q: Q): Promise<{ tiers: Tier[]; schools: (string | null)[] }> {
  const tiers: Tier[] = Array.from({ length: BUILT }, (_, face) => face < ANIMALS ? 'core' : MASCOT[face] ? 'school' : 'premium');
  const schools = Array.from({ length: BUILT }, (_, face): string | null => MASCOT[face] ?? null);
  // The admin may make any of them a school's own (migration 20261120600000): its row then says which school.
  for (const row of (await q.query<{ face: number; tier: Tier; school: string | null }>('select face,tier,school from campus_animal')).rows) if (row.face >= 0 && row.face < BUILT) {
    tiers[row.face] = row.tier;
    if (row.school) schools[row.face] = row.school;
  }
  return { tiers, schools };
}
/** The tier of each picture shipped with the app, by its number. */
export const builtTiers = async (q: Q): Promise<Tier[]> => (await builtAnimals(q)).tiers;
type Made = { token: string; tier: 'core' | 'premium' | 'school' | null; school: string | null; email: string | null };
const madeRows = async (q: Q) => (await q.query<Made>('select p.token::text as token,p.tier,p.school,f.email from campus_custom_picture p left join campus_custom_face f on f.person_id=p.person_id order by p.made_at,p.token')).rows;

/** The school a person is at, by the campus they were placed on. Null for a person at no school. */
export async function schoolOfPerson(q: Q, personId: string): Promise<string | null> {
  const slug = (await q.query<{ slug: string }>('select c.slug from campus_person p join campus c on c.id=p.campus_id where p.person_id=$1', [personId])).rows[0]?.slug;
  return slug ? schoolOf(slug) : null;
}
/** The school each person is at, by the campus they were placed on: its slug and name. A person at no school is left out. */
export async function schoolsAt(q: Q, personIds: readonly string[]): Promise<Map<string, { slug: string; name: string }>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; slug: string; name: string }>('select p.person_id::text as id,c.slug,c.name from campus_person p join campus c on c.id=p.campus_id where p.person_id=any($1::uuid[])', [personIds]);
  return new Map(rows.map(row => [row.id, { slug: schoolOf(row.slug), name: row.name }]));
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
  const { tiers, schools: own } = await builtAnimals(q), made = await madeRows(q), said = await saidRows(q);
  const theirs = (school: string | null) => schools === 'all' || !school || schools.includes(school);
  const of = (tier: 'core' | 'premium' | 'school'): Tile[] => [
    ...tiers.flatMap((each, face) => each === tier && theirs(own[face]) ? [{ face, src: animal(face), name: said.built.get(face)?.name ?? builtName(face), words: (said.built.get(face)?.words ?? builtWords(face)).join(' ') }] : []),
    ...made.flatMap((each, at) => each.tier === tier && theirs(each.school) ? [{ face: null, src: customFace(each.token), name: said.made.get(each.token)?.name ?? `Made animal ${at + 1}`, words: (said.made.get(each.token)?.words ?? ['made']).join(' ') }] : [])];
  return { core: of('core'), premium: of('premium'), school: of('school') };
}

/**
 * For the admin: every picture there is, with where it stands, its name, the words it is found by, and the school it is
 * the own animal of. A made animal that is nobody's but its maker's has tier null, and one the admin has not named has name null.
 */
export async function catalogue(q: Q): Promise<{ built: { face: number; src: string; name: string; words: string[]; tier: Tier; school: string | null }[]; made: { token: string; src: string; name: string | null; words: string[]; tier: Made['tier']; school: string | null; email: string | null }[] }> {
  const { tiers, schools } = await builtAnimals(q), said = await saidRows(q);
  return { built: tiers.map((tier, face) => ({ face, src: animal(face), name: said.built.get(face)?.name ?? builtName(face), words: said.built.get(face)?.words ?? builtWords(face), tier, school: schools[face] })),
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
/**
 * The admin moves a picture shipped with the app. To School it goes with the school it is to be the own animal of
 * (`school`, a school's slug, checked by the caller); a mascot sent back to its own school needs no row.
 */
export async function setBuiltTier(q: Q, face: number, tier: string, school?: string): Promise<void> {
  if (!Number.isInteger(face) || face < 0 || face >= BUILT) throw new Error('No such animal');
  if (tier === 'school') {
    const to = school || MASCOT[face];
    if (!to) throw new Error('Pick the school it is for');
    if (to === MASCOT[face]) await q.query('delete from campus_animal where face=$1', [face]);
    else await q.query('insert into campus_animal(face,tier,school) values($1,$2,$3) on conflict(face) do update set tier=excluded.tier,school=excluded.school', [face, tier, to]);
    return;
  }
  if (!TIERS.includes(tier as (typeof TIERS)[number])) throw new Error('No such animal');
  await q.query('insert into campus_animal(face,tier,school) values($1,$2,null) on conflict(face) do update set tier=excluded.tier,school=null', [face, tier]);
}
/** The admin moves an animal a person had made: core, premium, school (with the school it is for), or `own` for its maker alone. */
export async function setPictureTier(q: Q, token: string, tier: string, school?: string): Promise<void> {
  if (!z.uuid().safeParse(token).success || !['core', 'premium', 'school', 'own'].includes(tier)) throw new Error('No such picture');
  if (tier === 'school' && !school) throw new Error('Pick the school it is for');
  if (!(await q.query('update campus_custom_picture set tier=$2,school=$3 where token=$1 returning 1', [token, tier === 'own' ? null : tier, tier === 'school' ? school : null])).rows.length) throw new Error('No such picture');
}
