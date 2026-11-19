// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { openTestDb, type TestDb } from '@/test/db';
import { catalogue, picks, setAnimalName, setBuiltTier } from '@/lib/campus/animal-tiers';

// The admin names a picture and sets the words the picker finds it by (/c/admin, "Animals").
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); }); afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_animal_name'); await t.db.query('delete from campus_animal'); });

const BOBCAT = 39;   // 'NYU bobcat', one of NYU's own
const tile = async (face: number) => { const all = await picks(t.db, 'all'); return [...all.core, ...all.premium, ...all.school].find(each => each.face === face)!; };

it('an animal has the name and the word it shipped with until the admin says otherwise', async () => {
  expect(await tile(9)).toMatchObject({ name: 'Animal 10', words: 'cat' });
  expect(await tile(BOBCAT)).toMatchObject({ name: 'NYU bobcat', words: '' });
});

it('the words the admin sets are what the picker finds it by, phrases too, and the name is the one typed', async () => {
  expect(await setAnimalName(t.db, { face: BOBCAT }, ' Bobcat ', ['NYU', 'New  York University', 'ny university', 'nyu', ''])).toEqual(['nyu', 'new york university', 'ny university']);
  expect(await tile(BOBCAT)).toMatchObject({ name: 'Bobcat', words: 'nyu new york university ny university' });
  expect((await catalogue(t.db)).built[BOBCAT]).toMatchObject({ name: 'Bobcat', words: ['nyu', 'new york university', 'ny university'], tier: 'school' });
  // Moving it, and moving it back, keeps what was typed.
  await setBuiltTier(t.db, BOBCAT, 'core'); await setBuiltTier(t.db, BOBCAT, 'school');
  expect(await tile(BOBCAT)).toMatchObject({ name: 'Bobcat', words: 'nyu new york university ny university' });
});

it('an empty name is the name it shipped with, and no words is no words', async () => {
  await setAnimalName(t.db, { face: 9 }, 'Tabby', ['kitten']);
  expect(await tile(9)).toMatchObject({ name: 'Tabby', words: 'kitten' });
  await setAnimalName(t.db, { face: 9 }, '', []);
  expect(await tile(9)).toMatchObject({ name: 'Animal 10', words: '' });
});

it('refuses a picture there is none of, a long name, and too many words', async () => {
  await expect(setAnimalName(t.db, { face: 42 }, 'Nobody', [])).rejects.toThrow('No such animal');
  await expect(setAnimalName(t.db, { token: '00000000-0000-4000-8000-000000000000' }, 'Nobody', [])).rejects.toThrow('No such picture');
  await expect(setAnimalName(t.db, { face: 9 }, 'x'.repeat(41), [])).rejects.toThrow('40 letters');
  await expect(setAnimalName(t.db, { face: 9 }, 'Cat', Array.from({ length: 13 }, (_, at) => `word ${at}`))).rejects.toThrow('twelve');
});

it('before the migration is run, every animal is as it shipped', async () => {
  await t.db.query('alter table campus_animal_name rename to campus_animal_name_later');
  try { expect(await tile(9)).toMatchObject({ name: 'Animal 10', words: 'cat' }); }
  finally { await t.db.query('alter table campus_animal_name_later rename to campus_animal_name'); }
});
