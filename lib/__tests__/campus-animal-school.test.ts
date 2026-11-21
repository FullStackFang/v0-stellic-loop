// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { catalogue, picks, setBuiltTier, setPictureTier } from '@/lib/campus/animal-tiers';
import { useCustomFace } from '@/lib/campus/custom-face';

// The admin may make any animal a school's own (/c/admin, "Animals", School): free to that school, and nobody else's.
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); }); afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_animal'); });

const CAT = 9, BOBCAT = 39;   // a core animal, and NYU's own
const schoolFaces = async (schools: string[]) => (await picks(t.db, schools)).school.map(each => each.face ?? each.src);
const offered = async (schools: string[]) => { const all = await picks(t.db, schools); return [...all.core, ...all.premium, ...all.school].map(each => each.face ?? each.src); };
const made = async () => {
  const person = await makePerson(t.db, 'Maker');
  return (await t.db.query<{ token: string }>("insert into campus_custom_picture(person_id,image) values($1,'\\x00') returning token::text as token", [person.id])).rows[0].token;
};

it('makes an animal shipped with the app the own animal of the school picked, and takes it back to everyone', async () => {
  await setBuiltTier(t.db, CAT, 'school', 'columbia');
  expect(await schoolFaces(['columbia'])).toContain(CAT);
  expect(await offered(['cornell'])).not.toContain(CAT);
  expect((await catalogue(t.db)).built[CAT]).toMatchObject({ tier: 'school', school: 'columbia' });
  await setBuiltTier(t.db, CAT, 'core');
  expect(await offered(['cornell'])).toContain(CAT);
  expect((await catalogue(t.db)).built[CAT]).toMatchObject({ tier: 'core', school: null });
});

it('gives a mascot to another school, and back to its own with no row kept', async () => {
  await setBuiltTier(t.db, BOBCAT, 'school', 'cuny');
  expect(await schoolFaces(['cuny'])).toContain(BOBCAT);
  expect(await offered(['nyu'])).not.toContain(BOBCAT);
  await setBuiltTier(t.db, BOBCAT, 'school', 'nyu');
  expect((await t.db.query('select 1 from campus_animal where face=$1', [BOBCAT])).rows).toEqual([]);
  expect(await schoolFaces(['nyu'])).toContain(BOBCAT);
});

it('makes an animal a person had made a school’s own, and back to its maker alone', async () => {
  const token = await made(), src = `/animals/custom/${token}`;
  await setPictureTier(t.db, token, 'school', 'cornell');
  expect(await schoolFaces(['cornell'])).toContain(src);
  expect(await offered(['nyu'])).not.toContain(src);
  expect((await catalogue(t.db)).made.find(each => each.token === token)).toMatchObject({ tier: 'school', school: 'cornell' });
  await setPictureTier(t.db, token, 'own');
  expect(await offered(['cornell'])).not.toContain(src);
  expect((await catalogue(t.db)).made.find(each => each.token === token)).toMatchObject({ tier: null, school: null });
});

it('refuses a made school animal to someone of another school, and lets the admin wear it', async () => {
  const token = await made(), outsider = await makePerson(t.db, 'Outsider');
  await setPictureTier(t.db, token, 'school', 'cornell');
  await expect(useCustomFace(t.db, outsider.id, token)).rejects.toThrow('Pick one of the animals.');
  await useCustomFace(t.db, outsider.id, token, true);
  expect((await t.db.query<{ picture: string }>('select picture::text as picture from campus_face where person_id=$1', [outsider.id])).rows[0].picture).toBe(token);
});

it('will not make an animal a school’s own without the school', async () => {
  await expect(setBuiltTier(t.db, CAT, 'school')).rejects.toThrow('Pick the school');
  await expect(setPictureTier(t.db, await made(), 'school')).rejects.toThrow('Pick the school');
});
