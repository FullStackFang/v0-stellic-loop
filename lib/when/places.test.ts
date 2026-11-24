// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { createPoll, saveAnswer } from './polls';
import { placeIdeas, placeSpot, typedPlaces } from './places';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), TUE7 = '2026-12-02T00:00:00.000Z';
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: '2026-11-27T23:00:00.000Z', threshold: 'two_thirds' };
const campusId = async (slug: string) => (await t.db.query<{ id: string }>('select id from campus where slug=$1', [slug])).rows[0].id;
/** Someone at a campus, or at none. */
const who = async (name: string, slug?: string) => {
  const personId = (await makePerson(t.db, name)).id;
  if (slug) await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)', [personId, await campusId(slug)]);
  return { personId };
};
const poll = async (maker: { personId: string }, place: string) => (await createPoll(t.db, maker, { ...BASE, place }, NOW)).id;
const ideas = (person: { personId: string }) => placeIdeas(t.db, person.personId, NOW);

it('offers a name to the one who typed it, to those who answered that poll, and to the campus only once two people there have each used it', async () => {
  const [maya, josh, priya, dana] = await Promise.all([who('Maya', 'cornell'), who('Josh', 'cornell'), who('Priya', 'cornell'), who('Dana')]);
  const id = await poll(maya, 'CTB');
  await poll(maya, '210 Linden Ave');
  // Her own, from the first use; nobody else at her campus yet.
  expect((await ideas(maya)).slice(0, 2).sort()).toEqual(['210 Linden Ave', 'CTB']);
  expect(await ideas(josh)).not.toContain('CTB');
  // Priya answered the poll, so she has been shown the name.
  await saveAnswer(t.db, priya, { pollId: id, slots: [TUE7] }, NOW);
  expect(await ideas(priya)).toContain('CTB');
  expect(await ideas(priya)).not.toContain('210 Linden Ave');
  // A second person at the campus uses it, spelled their own way: now it is the campus's, in the spelling most used.
  await poll(josh, ' ctb '); await poll(maya, 'CTB');
  const other = await who('Sam', 'cornell');
  expect(await ideas(other)).toContain('CTB');
  expect(await ideas(other)).not.toContain('210 Linden Ave');
  // Someone with no campus is offered nothing of it.
  expect(await ideas(dana)).toEqual([]);
});

it('keeps a campus to itself, and lets a name fade a year after it was last used', async () => {
  const campuses = (await t.db.query<{ slug: string }>('select slug from campus order by slug')).rows.map(row => row.slug), elsewhere = campuses.find(slug => slug !== 'cornell');
  const [maya, josh] = await Promise.all([who('Maya', 'cornell'), who('Josh', 'cornell')]);
  await poll(maya, 'City Hops'); await poll(josh, 'City Hops');
  if (elsewhere) expect(await ideas(await who('Ari', elsewhere))).not.toContain('City Hops');
  const sam = await who('Sam', 'cornell');
  expect(await ideas(sam)).toContain('City Hops');
  expect(await placeIdeas(t.db, sam.personId, new Date('2027-12-01T00:00:00Z'))).not.toContain('City Hops');
  // Their own stays theirs.
  expect(await placeIdeas(t.db, maya.personId, new Date('2027-12-01T00:00:00Z'))).toContain('City Hops');
});

it('always offers the campus list with its other names, opens a listed place at its spot, and tells the admin the names the list lacks', async () => {
  const cornell = await campusId('cornell'), [maya, josh] = await Promise.all([who('Maya', 'cornell'), who('Josh', 'cornell')]);
  await t.db.query("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Collegetown Bagels','{CTB}',42.4424,-76.4853)", [cornell]);
  expect(await ideas(josh)).toEqual(expect.arrayContaining(['Collegetown Bagels', 'CTB']));
  expect(await placeSpot(t.db, maya.personId, 'ctb')).toEqual({ name: 'Collegetown Bagels', lat: 42.4424, lon: -76.4853 });
  expect(await placeSpot(t.db, maya.personId, 'City Hops')).toBeNull();
  await poll(maya, 'CTB'); await poll(maya, 'City Hops'); await poll(josh, 'city hops'); await poll(josh, 'The Nines');
  expect(await typedPlaces(t.db, cornell, NOW)).toEqual([{ name: expect.stringMatching(/^city hops$/i), people: 2 }, { name: 'The Nines', people: 1 }]);
});

it('loads the Cornell places file, twice over, without touching a place the campus already has', async () => {
  const cornell = await campusId('cornell'), seed = readFileSync('supabase/optional-migrations/campus-places/cornell.sql', 'utf8');
  // Places outlast the reset between tests: start from none.
  await t.db.query('delete from campus_place where campus_id=$1', [cornell]);
  await t.db.query("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'CTB','{Collegetown Bagels}',1,2),($1,'olin library','{}',3,4)", [cornell]);
  await t.db.query(seed); await t.db.query(seed);
  const rows = (await t.db.query<{ name: string; other_names: string[]; lat: number }>('select name,other_names,lat from campus_place where campus_id=$1', [cornell])).rows, named = (name: string) => rows.filter(row => row.name.toLowerCase() === name.toLowerCase());
  expect(rows.length).toBeGreaterThan(100);
  expect(new Set(rows.map(row => row.name.toLowerCase())).size).toBe(rows.length);
  // Already here under another name, or in other capitals: left as it was.
  expect(named('Collegetown Bagels')).toEqual([]);
  expect(named('Olin Library')).toEqual([{ name: 'olin library', other_names: [], lat: 3 }]);
  // A loaded place carries no other names, and a name with an apostrophe arrives whole.
  expect(named('Temple of Zeus')[0].other_names).toEqual([]);
  expect(rows.some(row => row.name.includes("'"))).toBe(true);
  expect((await placeSpot(t.db, (await who('Maya', 'cornell')).personId, 'drinks at the big red barn'))?.name).toBe('Big Red Barn');
});

it.each(['columbia', 'nyu'])('loads the %s places file twice, each place once', async slug => {
  const id = await campusId(slug), seed = readFileSync(`supabase/optional-migrations/campus-places/${slug}.sql`, 'utf8');
  await t.db.query('delete from campus_place where campus_id=$1', [id]);
  await t.db.query(seed); const once = (await t.db.query('select 1 from campus_place where campus_id=$1', [id])).rows.length;
  await t.db.query(seed);
  const names = (await t.db.query<{ name: string }>('select lower(name) as name from campus_place where campus_id=$1', [id])).rows.map(row => row.name);
  expect(once).toBeGreaterThan(100);
  expect(names.length).toBe(once);
  expect(new Set(names).size).toBe(once);
});
