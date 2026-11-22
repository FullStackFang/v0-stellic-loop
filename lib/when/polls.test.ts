// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { createPoll, pollView, recordOpen, saveAnswer } from './polls';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z', THU7 = '2026-12-04T00:00:00.000Z';
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: '2026-11-27T23:00:00.000Z', threshold: 'two_thirds' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id });
const poll = async (maker: { personId: string }, over: Record<string, unknown> = {}) => (await createPoll(t.db, maker, { ...BASE, ...over }, NOW)).id;
const count = async (sql: string, values: unknown[] = []) => (await t.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, values)).rows[0].n;

it('makes a poll with a 12 character address, and shows it to its maker and to a visitor', async () => {
  const maya = await who('Maya'), id = await poll(maya);
  expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  const mine = await pollView(t.db, maya, id), theirs = await pollView(t.db, null, id);
  expect(mine).toMatchObject({ id, seriesId: id, title: 'Problem set night', status: 'open', ready: false, size: 7, needed: 5, answered: [], counts: {}, mine: null, best: [], chosen: null, isOrganizer: true, organizer: { name: 'Maya' }, deadline: '2026-11-27T23:00:00.000Z' });
  expect(mine!.frame).toEqual({ startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York' });
  expect(theirs!.isOrganizer).toBe(false);
  expect(await count(`when_event where kind='poll_created' and poll_id=$1`, [id])).toBe(1);
});

it('refuses a poll that makes no sense', async () => {
  const maya = await who('Maya');
  for (const bad of [{ title: '   ' }, { timezone: 'Mars/Olympus' }, { hourEnd: 17 }, { endDate: '2026-12-14' }, { endDate: '2026-11-29' }, { deadline: '2026-11-21T00:00:00.000Z' }, { deadline: 'soon' }, { expectedSize: 1 }, { threshold: 'most' }, { startDate: '2026-13-01' }])
    await expect(poll(maya, bad)).rejects.toMatchObject({ code: 'invalid' });
  expect(await count('when_poll')).toBe(0);
});

it('lets one person make ten polls in a day and no more', async () => {
  const maya = await who('Maya');
  for (let i = 0; i < 10; i++) await poll(maya);
  await expect(poll(maya)).rejects.toMatchObject({ code: 'limit' });
  expect(await createPoll(t.db, maya, { ...BASE }, new Date(NOW.getTime() + 25 * 3_600_000))).toHaveProperty('id');
});

it('keeps a person\'s hours, and a later answer replaces the earlier one', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), id = await poll(maya);
  expect(await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7, TUE8] }, NOW)).toEqual({ ready: false });
  let view = await pollView(t.db, josh, id);
  expect(view).toMatchObject({ counts: { [TUE7]: 1, [TUE8]: 1 }, answered: [{ personId: josh.personId, name: 'Josh' }], mine: { slots: [TUE7, TUE8], draft: false } });
  await saveAnswer(t.db, josh, { pollId: id, slots: [THU7] }, NOW);
  view = await pollView(t.db, josh, id);
  expect(view!.counts).toEqual({ [THU7]: 1 });
  expect(view!.answered).toHaveLength(1);
  expect(await count('when_answer')).toBe(1);
});

it('refuses an hour the poll does not have, the same hour twice, and a poll that is not there', async () => {
  const maya = await who('Maya'), id = await poll(maya);
  await expect(saveAnswer(t.db, maya, { pollId: id, slots: ['2026-12-01T10:00:00.000Z'] }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveAnswer(t.db, maya, { pollId: id, slots: [TUE7, TUE7] }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveAnswer(t.db, maya, { pollId: id, slots: 'all' }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveAnswer(t.db, maya, { pollId: 'AAAAAAAAAAAA', slots: [] }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  expect(await count('when_answer')).toBe(0);
});

it('has nothing to show for an address that is malformed or unknown', async () => {
  expect(await pollView(t.db, null, 'nope')).toBeNull();
  expect(await pollView(t.db, null, 'x'.repeat(12))).toBeNull();
  expect(await pollView(t.db, null, "x'; drop table")).toBeNull();
});

it('tells the organizer once, when the third answer gives a time enough people', async () => {
  const maya = await who('Maya'), people = [await who('Josh'), await who('Priya'), await who('Leo'), await who('Dana')], id = await poll(maya, { expectedSize: 4, threshold: 'majority' });
  expect(await saveAnswer(t.db, people[0], { pollId: id, slots: [TUE7] }, NOW)).toEqual({ ready: false });
  expect(await saveAnswer(t.db, people[1], { pollId: id, slots: [TUE7, TUE8] }, NOW)).toEqual({ ready: false });
  expect(await saveAnswer(t.db, people[2], { pollId: id, slots: [TUE7] }, NOW)).toEqual({ ready: true });
  expect(await saveAnswer(t.db, people[3], { pollId: id, slots: [TUE7] }, NOW)).toEqual({ ready: false });
  const view = await pollView(t.db, maya, id);
  expect(view).toMatchObject({ ready: true, status: 'open', size: 4, needed: 3 });
  expect(view!.best[0]).toMatchObject({ at: TUE7 });
  expect(view!.best[0].people.map(each => each.name).sort()).toEqual(['Dana', 'Josh', 'Leo', 'Priya']);
  expect((await t.db.query('select ready_met from when_poll where id=$1', [id])).rows).toEqual([{ ready_met: true }]);
  expect((await t.db.query('select person_id,kind,state from when_message')).rows).toEqual([{ person_id: maya.personId, kind: 'ready', state: 'queued' }]);
  expect(await count(`when_event where kind='poll_ready'`)).toBe(1);
});

it('tells the organizer once when two answers arrive together', async () => {
  const maya = await who('Maya'), people = [await who('Josh'), await who('Priya'), await who('Leo'), await who('Dana')], id = await poll(maya, { expectedSize: 4, threshold: 'majority' });
  await saveAnswer(t.db, people[0], { pollId: id, slots: [TUE7] }, NOW);
  await saveAnswer(t.db, people[1], { pollId: id, slots: [TUE7] }, NOW);
  const both = await Promise.all([saveAnswer(t.db, people[2], { pollId: id, slots: [TUE7] }, NOW), saveAnswer(t.db, people[3], { pollId: id, slots: [TUE7] }, NOW)]);
  expect(both.filter(each => each.ready)).toHaveLength(1);
  expect(await count('when_message')).toBe(1);
});

it('counts a browser that opens a poll once, however often it comes back', async () => {
  const id = await poll(await who('Maya')), a = 'a'.repeat(32), b = 'b'.repeat(32);
  await recordOpen(t.db, id, a); await recordOpen(t.db, id, a); await recordOpen(t.db, id, b);
  await recordOpen(t.db, id, 'not a visitor'); await recordOpen(t.db, 'AAAAAAAAAAAA', a);
  expect(await count(`when_event where kind='poll_opened'`)).toBe(2);
});

it('lets a deleted account take its polls and answers with it', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), id = await poll(maya), other = await poll(josh);
  await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7] }, NOW);
  await t.db.query('delete from person where id=$1', [josh.personId]);
  expect((await pollView(t.db, maya, id))!.answered).toEqual([]);
  expect(await pollView(t.db, maya, other)).toBeNull();
});
