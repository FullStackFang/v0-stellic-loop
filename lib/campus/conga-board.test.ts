// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { congaBoards, saveBest, shortName } from './conga-board';
import type { CongaPlayer } from './conga';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

const PLAYER: CongaPlayer = { ink: true, plus: false, kit: 'cornell', animals: [{ face: 12, picture: null, kit: 'cornell' }, { face: 0, picture: '/animals/custom/73303245-8d46-4363-8cdc-cd8b156359eb', kit: 'cornell' }] };
const round = (best: number, more: Partial<{ map: string; seconds: number; face: number; picture: string | null }> = {}) => ({ map: 'cornell', best, seconds: 120, face: 12, picture: null, ...more });
const person = async (name: string) => (await makePerson(t.db, name)).id;

it('shortens a name to a first name and an initial', () => {
  expect(shortName('Maya Rodriguez')).toBe('Maya R.');
  expect(shortName('  Josh  ')).toBe('Josh');
  expect(shortName('ana de la cruz')).toBe('ana C.');
});

it('keeps each player\'s best of the week on a map, and ranks the top with the reader after them', async () => {
  const names = ['Maya Rodriguez', 'Josh Donlon', 'Priya Shah', 'Dev Kumar', 'Sam Taylor', 'Ana Lee', 'Theo Brown'];
  const ids = await Promise.all(names.map(person));
  for (const [n, id] of ids.entries()) expect(await saveBest(t.db, id, PLAYER, round(600 - n * 50))).toBe(true);
  // A lower line later in the week does not replace a best; a higher one does.
  await saveBest(t.db, ids[6], PLAYER, round(10));
  await saveBest(t.db, ids[5], PLAYER, round(560, { face: 0, picture: PLAYER.animals[1].picture }));
  const boards = await congaBoards(t.db, ids[6]);
  expect(Object.keys(boards)).toEqual(expect.arrayContaining(['cornell', 'cornell-tech']));
  expect(boards['cornell-tech']).toEqual([]);
  expect(boards.cornell.map(row => [row.place, row.name, row.best, row.you])).toEqual([
    [1, 'Maya R.', 600, false], [2, 'Ana L.', 560, false], [3, 'Josh D.', 550, false], [4, 'Priya S.', 500, false], [5, 'Dev K.', 450, false], [7, 'Theo B.', 300, true]]);
  expect(boards.cornell[1]).toMatchObject({ face: 0, picture: PLAYER.animals[1].picture, kit: 'cornell' });
  // Read by nobody signed in: the top alone.
  expect((await congaBoards(t.db, null)).cornell).toHaveLength(5);
});

it('refuses what no round could have made, and keeps the player\'s own animal only', async () => {
  const id = await person('Maya Rodriguez');
  expect(await saveBest(t.db, id, PLAYER, round(401, { map: 'moon' }))).toBe(false);
  expect(await saveBest(t.db, id, PLAYER, round(401, { seconds: 5 }))).toBe(false); // 401 in 5 seconds
  expect(await saveBest(t.db, id, PLAYER, round(2002))).toBe(false); // longer than a line can be
  expect(await saveBest(t.db, id, PLAYER, round(0))).toBe(false);
  expect(await saveBest(t.db, id, PLAYER, round(40, { face: 3 }))).toBe(true); // an animal that is not theirs
  expect((await congaBoards(t.db, id)).cornell).toEqual([expect.objectContaining({ best: 40, face: 12, picture: null, you: true })]);
});
