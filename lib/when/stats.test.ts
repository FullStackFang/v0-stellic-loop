// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import StatsPage from '@/app/when/stats/page';
import { createPoll, recordOpen, saveAnswer } from './polls';
import { whenStats } from './stats';

vi.mock('server-only', () => ({}));
const missing = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({ notFound: () => { throw missing; } }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { vi.unstubAllEnvs(); });

const NOW = new Date('2026-11-22T12:00:00Z'), TUE7 = '2026-12-02T00:00:00.000Z';
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 3, deadline: '2026-11-27T23:00:00.000Z', threshold: 'majority' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id });
const visitor = (n: number) => String(n).repeat(32);
/** Four browsers open one poll and three people answer it; two polls are ready, one met; of two series one comes back in 10 days, the other in 40. */
async function known() {
  const maya = await who('Maya'), people = [await who('Josh'), await who('Priya'), await who('Leo')], a = (await createPoll(t.db, maya, BASE, NOW)).id, b = (await createPoll(t.db, maya, BASE, NOW)).id;
  for (const n of [1, 2, 3, 4]) await recordOpen(t.db, a, visitor(n));
  await recordOpen(t.db, a, visitor(1));
  for (const each of people) await saveAnswer(t.db, each, { pollId: a, slots: [TUE7] }, NOW);
  await saveAnswer(t.db, people[0], { pollId: a, slots: [] }, NOW);
  await t.db.query('update when_poll set ready_at=$2,ready_met=false where id=$1', [b, NOW.toISOString()]);
  for (const [first, days, id] of [[a, 10, 'aaaaaaaaaaaa'], [b, 40, 'bbbbbbbbbbbb']] as const)
    await t.db.query(`insert into when_poll(id,series_id,previous_poll_id,organizer_id,title,start_date,end_date,hour_start,hour_end,timezone,expected_size,deadline,threshold,created_at)
      select $2,series_id,id,organizer_id,title,start_date+7,end_date+7,hour_start,hour_end,timezone,expected_size,deadline+interval '7 days',threshold,created_at+make_interval(days=>$3) from when_poll where id=$1`, [first, id, days]);
}

it('has no rates before there is anything to count', async () => {
  expect(await whenStats(t.db)).toEqual({ opened: 0, answered: 0, answerRate: null, ready: 0, readyMet: 0, metRate: null, series: 0, repeated: 0, repeatRate: null });
});

it('counts answers per opening browser, polls that met their threshold, and groups that came back within thirty days', async () => {
  await known();
  expect(await whenStats(t.db)).toEqual({ opened: 4, answered: 3, answerRate: 0.75, ready: 2, readyMet: 1, metRate: 0.5, series: 2, repeated: 1, repeatRate: 0.5 });
});

it('shows the numbers only to someone with the key', async () => {
  await known();
  const page = (key?: string) => StatsPage({ searchParams: Promise.resolve(key === undefined ? {} : { key }) });
  await expect(page('anything')).rejects.toBe(missing);
  vi.stubEnv('WHEN_STATS_SECRET', 'the-key');
  await expect(page()).rejects.toBe(missing);
  await expect(page('the-kez')).rejects.toBe(missing);
  await expect(page('the-key-and-more')).rejects.toBe(missing);
  const { renderToStaticMarkup } = await import('react-dom/server'), html = renderToStaticMarkup(await page('the-key'));
  for (const text of ['75%', '3 of 4', '50%', '1 of 2']) expect(html).toContain(text);
});
