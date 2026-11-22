// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { createPoll, pollView, saveAnswer } from './polls';
import { pollIcs, sendPoll, shareMessage } from './send';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://loopd.test'); });
afterAll(async () => { vi.unstubAllEnvs(); await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), TUE7 = '2026-12-02T00:00:00.000Z', THU7 = '2026-12-04T00:00:00.000Z';
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: '2026-11-27T23:00:00.000Z', threshold: 'two_thirds' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id });
const messages = async () => (await t.db.query<{ person_id: string; kind: string }>(`select person_id,kind from when_message where kind='invite' order by person_id`)).rows.map(row => row.person_id);
/** Maya's poll, answered by Maya, Josh and Priya for Tuesday at 7, and by Dana for Thursday only. */
async function answered() {
  const maya = await who('Maya'), josh = await who('Josh'), priya = await who('Priya'), dana = await who('Dana'), id = (await createPoll(t.db, maya, BASE, NOW)).id;
  for (const each of [maya, josh, priya]) await saveAnswer(t.db, each, { pollId: id, slots: [TUE7] }, NOW);
  await saveAnswer(t.db, dana, { pollId: id, slots: [THU7] }, NOW);
  return { id, maya, josh, priya, dana };
}

it('sets the time the organizer picked and queues one invite for each person who answered', async () => {
  const { id, maya, josh, priya, dana } = await answered();
  expect(await sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: '  Olin Library,  room 301. ' }, NOW)).toEqual({ sent: true });
  const view = await pollView(t.db, josh, id);
  expect(view).toMatchObject({ status: 'sent', chosen: { at: TUE7, note: 'Olin Library, room 301.' } });
  expect(view!.chosen!.in.map(each => each.name).sort()).toEqual(['Josh', 'Maya', 'Priya']);
  expect(view!.chosen!.out.map(each => each.name)).toEqual(['Dana']);
  expect(await messages()).toEqual([maya, josh, priya, dana].map(each => each.personId).sort());
  expect((await t.db.query(`select count(*)::int as n from when_event where kind='poll_sent'`)).rows).toEqual([{ n: 1 }]);
});

it('sends once, however often or however fast send is pressed', async () => {
  const { id, maya } = await answered();
  const both = await Promise.all([sendPoll(t.db, maya, { pollId: id, slot: TUE7 }, NOW), sendPoll(t.db, maya, { pollId: id, slot: THU7 }, NOW)]);
  expect(both.filter(each => each.sent)).toHaveLength(1);
  expect(await sendPoll(t.db, maya, { pollId: id, slot: THU7 }, NOW)).toEqual({ sent: false });
  expect(await messages()).toHaveLength(4);
});

it('is the organizer\'s alone to send, for a time the poll has, once someone has answered', async () => {
  const { id, maya, josh } = await answered();
  await expect(sendPoll(t.db, josh, { pollId: id, slot: TUE7 }, NOW)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(sendPoll(t.db, maya, { pollId: id, slot: '2026-12-01T10:00:00.000Z' }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: 'x'.repeat(201) }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(sendPoll(t.db, maya, { pollId: 'AAAAAAAAAAAA', slot: TUE7 }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  const empty = (await createPoll(t.db, maya, BASE, NOW)).id;
  await expect(sendPoll(t.db, maya, { pollId: empty, slot: TUE7 }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  expect(await messages()).toEqual([]);
});

it('can be sent before the poll is ready, with one answer in', async () => {
  const maya = await who('Maya'), id = (await createPoll(t.db, maya, BASE, NOW)).id;
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7] }, NOW);
  expect(await sendPoll(t.db, maya, { pollId: id, slot: TUE7 }, NOW)).toEqual({ sent: true });
  expect((await pollView(t.db, maya, id))!.chosen).toMatchObject({ at: TUE7, note: null });
});

it('still takes answers after it is sent: they move people, never the time', async () => {
  const { id, maya, dana, josh } = await answered();
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7 }, NOW);
  await saveAnswer(t.db, dana, { pollId: id, slots: [TUE7, THU7] }, NOW);
  await saveAnswer(t.db, josh, { pollId: id, slots: [] }, NOW);
  const view = await pollView(t.db, maya, id);
  expect(view!.chosen!.at).toBe(TUE7);
  expect(view!.chosen!.in.map(each => each.name).sort()).toEqual(['Dana', 'Maya', 'Priya']);
  expect(view!.chosen!.out.map(each => each.name)).toEqual(['Josh']);
  expect(await messages()).toHaveLength(4);
});

it('gives the hour as a calendar file once it is set, and words to pass on', async () => {
  const { id, maya } = await answered();
  let view = (await pollView(t.db, maya, id))!;
  expect(pollIcs(view)).toBeNull();
  expect(shareMessage(view)).toBe('Problem set night\nWhen can you make it? Add your times by Friday 27 Nov.\nhttps://loopd.test/when/' + id);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: 'Olin Library, room 301.' }, NOW);
  view = (await pollView(t.db, maya, id))!;
  const file = pollIcs(view)!, invite = pollIcs(view, { to: 'josh@cornell.edu', from: 'when@loopd.test' })!;
  for (const line of ['METHOD:PUBLISH', 'DTSTART:20261202T000000Z', 'DTEND:20261202T010000Z', 'SUMMARY:Problem set night', `UID:when-${id}@loopd.test`]) expect(file).toContain(line);
  expect(file.replace(/\r\n /g, '')).toContain('DESCRIPTION:Olin Library\\, room 301.\\nSet by Maya on Loopd.');
  expect(file).not.toContain('ATTENDEE');
  expect(invite).toContain('METHOD:REQUEST');
  expect(invite.replace(/\r\n /g, '')).toContain('mailto:josh@cornell.edu');
  expect(shareMessage(view)).toBe('Problem set night is on: Tuesday 1 Dec, 7 to 8 pm.\nAdd it to your calendar:\nhttps://loopd.test/when/' + id);
});

it('starts a quarter past and runs for as long as the organizer said, with the same people in', async () => {
  const { id, maya, josh } = await answered();
  await expect(sendPoll(t.db, maya, { pollId: id, slot: TUE7, minute: 20 }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(sendPoll(t.db, maya, { pollId: id, slot: TUE7, duration: 600 }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  expect(await sendPoll(t.db, maya, { pollId: id, slot: TUE7, minute: '15', duration: '45' }, NOW)).toEqual({ sent: true });
  const view = (await pollView(t.db, josh, id))!;
  expect(view.chosen).toMatchObject({ at: '2026-12-02T00:15:00.000Z', minutes: 45 });
  expect(view.chosen!.in.map(each => each.name).sort()).toEqual(['Josh', 'Maya', 'Priya']);
  expect(view.chosen!.out.map(each => each.name)).toEqual(['Dana']);
  expect(shareMessage(view)).toContain('is on: Tuesday 1 Dec, 7:15 to 8 pm.');
  const file = pollIcs(view, undefined, NOW)!;
  for (const line of ['DTSTART:20261202T001500Z', 'DTEND:20261202T010000Z']) expect(file).toContain(line);
});
