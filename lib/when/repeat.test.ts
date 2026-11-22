// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { createPoll, pollView, saveAnswer } from './polls';
import { repeatPoll, seriesView, usualLabels } from './repeat';
import { sendPoll } from './send';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), LATER = new Date('2026-12-02T12:00:00Z'), ZONE = 'America/New_York';
const MON7 = '2026-12-01T00:00:00.000Z', TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z', THU7 = '2026-12-04T00:00:00.000Z';
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: ZONE, expectedSize: 7, deadline: '2026-11-27T23:00:00.000Z', threshold: 'two_thirds' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id });
/** Maya's first poll, sent for Tuesday at 7: Maya and Josh said Tuesday 7 and 8, Priya Monday 7 and Thursday 7. */
async function sent(over: Record<string, unknown> = {}, now = NOW) {
  const maya = await who('Maya'), josh = await who('Josh'), priya = await who('Priya'), id = (await createPoll(t.db, maya, { ...BASE, ...over }, now)).id;
  return { id, maya, josh, priya };
}
async function first() {
  const f = await sent();
  for (const each of [f.maya, f.josh]) await saveAnswer(t.db, each, { pollId: f.id, slots: [TUE7, TUE8] }, NOW);
  await saveAnswer(t.db, f.priya, { pollId: f.id, slots: [MON7, THU7] }, NOW);
  await sendPoll(t.db, f.maya, { pollId: f.id, slot: TUE7 }, NOW);
  return f;
}
const row = async (id: string) => (await t.db.query(`select series_id,previous_poll_id,organizer_id,title,start_date,end_date,hour_start,hour_end,timezone,expected_size,threshold,status,to_char(deadline at time zone 'UTC','YYYY-MM-DD"T"HH24:MI') as deadline from when_poll where id=$1`, [id])).rows[0];

it('says times the way a person would', () => {
  expect(usualLabels([THU7, TUE8, TUE7, MON7], ZONE)).toEqual(['Mon 7 pm', 'Tue 7 to 9 pm', 'Thu 7 pm']);
  expect(usualLabels(['2026-12-01T16:00:00.000Z', '2026-12-01T17:00:00.000Z'], ZONE)).toEqual(['Tue 11 am to 1 pm']);
  expect(usualLabels([], ZONE)).toEqual([]);
});

it('makes the same plan a week on, in the same series, with whoever asks as its organizer', async () => {
  const { id, josh } = await first(), next = (await repeatPoll(t.db, josh, { pollId: id }, LATER)).id;
  expect(await row(next)).toEqual({ series_id: id, previous_poll_id: id, organizer_id: josh.personId, title: 'Problem set night', start_date: '2026-12-07', end_date: '2026-12-11', hour_start: 17, hour_end: 22,
    timezone: ZONE, expected_size: 3, threshold: 'two_thirds', status: 'open', deadline: '2026-12-04T23:00' });
  expect((await t.db.query(`select count(*)::int as n from when_event where kind='repeat_created' and poll_id=$1 and series_id=$2`, [next, id])).rows).toEqual([{ n: 1 }]);
});

it('fills in each person\'s usual times as a draft, which counts only once they save', async () => {
  const { id, maya, priya } = await first(), next = (await repeatPoll(t.db, maya, { pollId: id }, LATER)).id;
  let view = (await pollView(t.db, priya, next))!;
  expect(view).toMatchObject({ answered: [], counts: {}, best: [], size: 3 });
  expect(view.mine).toEqual({ slots: ['2026-12-08T00:00:00.000Z', '2026-12-11T00:00:00.000Z'], draft: true });
  expect((await pollView(t.db, maya, next))!.mine).toEqual({ slots: ['2026-12-09T00:00:00.000Z', '2026-12-09T01:00:00.000Z'], draft: true });
  await saveAnswer(t.db, priya, { pollId: next, slots: view.mine!.slots }, LATER);
  view = (await pollView(t.db, priya, next))!;
  expect(view.mine!.draft).toBe(false);
  expect(view.answered.map(each => each.name)).toEqual(['Priya']);
  expect(view.counts).toEqual({ '2026-12-08T00:00:00.000Z': 1, '2026-12-11T00:00:00.000Z': 1 });
});

it('makes one next poll however often it is asked for', async () => {
  const { id, maya, josh } = await first();
  const both = await Promise.all([repeatPoll(t.db, maya, { pollId: id }, LATER), repeatPoll(t.db, josh, { pollId: id }, LATER)]);
  expect(both[0].id).toBe(both[1].id);
  expect((await repeatPoll(t.db, maya, { pollId: id }, LATER)).id).toBe(both[0].id);
  expect((await t.db.query('select count(*)::int as n from when_poll')).rows).toEqual([{ n: 2 }]);
});

it('is for the series\' own people, and for a poll whose time is set', async () => {
  const { id, maya } = await first(), stranger = await who('Leo');
  await expect(repeatPoll(t.db, stranger, { pollId: id }, LATER)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(repeatPoll(t.db, maya, { pollId: 'AAAAAAAAAAAA' }, LATER)).rejects.toMatchObject({ code: 'not_found' });
  await expect(repeatPoll(t.db, maya, { pollId: 'nope' }, LATER)).rejects.toMatchObject({ code: 'invalid' });
  const open = (await createPoll(t.db, maya, BASE, NOW)).id;
  await expect(repeatPoll(t.db, maya, { pollId: open }, LATER)).rejects.toMatchObject({ code: 'invalid' });
  expect(await seriesView(t.db, stranger, id)).toBeNull();
});

it('moves a deadline that has gone to a day before the first hour, and refuses when that has gone too', async () => {
  const { id, maya } = await first();
  const late = new Date('2026-12-05T12:00:00Z');
  expect((await row((await repeatPoll(t.db, maya, { pollId: id }, late)).id)).deadline).toBe('2026-12-06T22:00');
  await t.db.query('delete from when_poll where previous_poll_id=$1', [id]);
  await expect(repeatPoll(t.db, maya, { pollId: id }, new Date('2026-12-07T12:00:00Z'))).rejects.toMatchObject({ code: 'invalid' });
});

it('keeps 7 pm at 7 pm when the clocks change in between', async () => {
  const now = new Date('2027-03-01T12:00:00Z'), f = await sent({ startDate: '2027-03-08', endDate: '2027-03-12', deadline: '2027-03-06T23:00:00.000Z' }, now);
  const tue7 = '2027-03-10T00:00:00.000Z';
  await saveAnswer(t.db, f.maya, { pollId: f.id, slots: [tue7] }, now);
  await sendPoll(t.db, f.maya, { pollId: f.id, slot: tue7 }, now);
  const next = (await repeatPoll(t.db, f.maya, { pollId: f.id }, new Date('2027-03-10T12:00:00Z'))).id;
  expect((await pollView(t.db, f.maya, next))!.mine!.slots).toEqual(['2027-03-16T23:00:00.000Z']);
  expect((await row(next)).deadline).toBe('2027-03-13T23:00');
});

it('shows the series to one of its people: their usual times and past sessions, newest first', async () => {
  const { id, maya, josh, priya } = await first(), next = (await repeatPoll(t.db, maya, { pollId: id }, LATER)).id;
  for (const each of [maya, josh, priya]) await saveAnswer(t.db, each, { pollId: next, slots: ['2026-12-09T01:00:00.000Z'] }, LATER);
  await sendPoll(t.db, maya, { pollId: next, slot: '2026-12-09T01:00:00.000Z' }, LATER);
  const view = (await seriesView(t.db, josh, next))!;
  expect(view.people.map(each => each.name)).toEqual(['Josh', 'Maya', 'Priya']);
  expect(view.usual).toEqual(['Tue 8 pm']);
  expect(view.next).toMatchObject({ startDate: '2026-12-14', endDate: '2026-12-18' });
  expect(view.past.map(each => [each.id, each.at, each.size, each.in.map(person => person.name).sort()])).toEqual([[next, '2026-12-09T01:00:00.000Z', 3, ['Josh', 'Maya', 'Priya']], [id, TUE7, 7, ['Josh', 'Maya']]]);
});
