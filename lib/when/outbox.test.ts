// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Mail, SendResult } from '@/lib/email/resend';
import { GET as stopPage, POST as stopPost } from '@/app/api/when/stop/[token]/route';
import { drainWhen, type Carrier } from './outbox';
import { createPoll, saveAnswer } from './polls';
import { sendPoll } from './send';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://loopd.test'); });
afterAll(async () => { vi.unstubAllEnvs(); await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), DEADLINE = '2026-11-27T23:00:00.000Z', TUE7 = '2026-12-02T00:00:00.000Z', THU7 = '2026-12-04T00:00:00.000Z';
const hoursBefore = (hours: number) => new Date(Date.parse(DEADLINE) - hours * 3_600_000), AFTER = new Date('2026-11-28T00:00:00Z');
const BASE = { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: DEADLINE, threshold: 'two_thirds' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id, name });
const poll = async (maker: { personId: string }, over: Record<string, unknown> = {}) => (await createPoll(t.db, maker, { ...BASE, ...over }, NOW)).id;
/** A carrier that keeps what it was asked to send. Everyone's address is their name at cornell.edu unless told otherwise. */
function carrier(o: { answer?: SendResult; none?: string[] } = {}) {
  const mails: Mail[] = [];
  const it: Carrier = { from: 'when@loopd.test', email: async mail => { mails.push(mail); return o.answer ?? { ok: true, providerId: 're_1' }; },
    address: async personId => { const { rows: [row] } = await t.db.query<{ name: string }>('select name from person where id=$1', [personId]); return o.none?.includes(row.name) ? null : `${row.name.toLowerCase()}@cornell.edu`; } };
  return { mails, it };
}
const states = async () => (await t.db.query<{ name: string; kind: string; state: string; attempts: number }>('select p.name,m.kind,m.state,m.attempts from when_message m join person p on p.id=m.person_id order by m.kind,p.name')).rows;

it('tells the organizer once the deadline has passed with an answer in, and only once', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), id = await poll(maya), { mails, it: c } = carrier();
  await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7] }, NOW);
  expect(await drainWhen(t.db, c, { now: hoursBefore(1) })).toMatchObject({ readied: 0, sent: 0 });
  expect(await drainWhen(t.db, c, { now: AFTER })).toMatchObject({ readied: 1, sent: 1 });
  expect(await drainWhen(t.db, c, { now: AFTER })).toMatchObject({ readied: 0, sent: 0 });
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ to: 'maya@cornell.edu', from: '"Loopd" <when@loopd.test>', subject: 'Problem set night is ready to set' });
  expect(mails[0].text).toContain('Tuesday 1 Dec at 7 pm works for 1 of 7.');
  expect(mails[0].text).toContain('Nothing has been sent. You pick the time.');
  expect(mails[0].calendar).toBeUndefined();
  expect((await t.db.query('select ready_met from when_poll')).rows).toEqual([{ ready_met: false }]);
});

it('leaves a poll alone when its deadline passes with no answers', async () => {
  await poll(await who('Maya'));
  const { mails, it: c } = carrier();
  expect(await drainWhen(t.db, c, { now: AFTER })).toEqual({ readied: 0, queued: 0, sent: 0, failed: 0, retrying: 0 });
  expect(mails).toEqual([]);
});

it('says once more at the deadline when a poll was ready early and is still not sent', async () => {
  const maya = await who('Maya'), id = await poll(maya, { expectedSize: 3, threshold: 'majority' }), { mails, it: c } = carrier();
  for (const name of ['Josh', 'Priya', 'Leo']) await saveAnswer(t.db, await who(name), { pollId: id, slots: [TUE7] }, NOW);
  await drainWhen(t.db, c, { now: NOW });
  await drainWhen(t.db, c, { now: AFTER });
  await drainWhen(t.db, c, { now: AFTER });
  expect(mails.map(mail => mail.subject)).toEqual(['Problem set night is ready to set', 'Problem set night: the deadline has passed']);
});

it('reminds the people of a series who have not answered, 48 and 24 hours before, and nobody on a first poll', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), priya = await who('Priya'), leo = await who('Leo'), first = await poll(maya), { mails, it: c } = carrier();
  for (const each of [josh, priya, leo]) await saveAnswer(t.db, each, { pollId: first, slots: [TUE7] }, NOW);
  await sendPoll(t.db, maya, { pollId: first, slot: TUE7 }, NOW);
  await t.db.query('delete from when_message');
  const second = await poll(maya);
  expect(await drainWhen(t.db, c, { now: hoursBefore(47) })).toMatchObject({ queued: 0, sent: 0 });
  await t.db.query('update when_poll set series_id=$1,previous_poll_id=$1 where id=$2', [first, second]);
  await saveAnswer(t.db, josh, { pollId: second, slots: [TUE7] }, NOW);
  await t.db.query(`insert into when_answer(poll_id,person_id,draft,reminders_off) values($1,$2,true,true)`, [second, leo.personId]);
  expect(await drainWhen(t.db, c, { now: hoursBefore(60) })).toMatchObject({ queued: 0 });
  expect(await drainWhen(t.db, c, { now: hoursBefore(47) })).toMatchObject({ queued: 1, sent: 1 });
  expect(await drainWhen(t.db, c, { now: hoursBefore(40) })).toMatchObject({ queued: 0, sent: 0 });
  expect(await drainWhen(t.db, c, { now: hoursBefore(23) })).toMatchObject({ queued: 1, sent: 1 });
  expect(mails.map(mail => [mail.to, mail.subject])).toEqual([['priya@cornell.edu', 'Maya is waiting on your times for Problem set night'], ['priya@cornell.edu', 'Maya is waiting on your times for Problem set night']]);
  expect(mails[1].text).toContain('This is the last reminder.');
  expect(mails[0].unsubscribeUrl).toMatch(/^https:\/\/loopd\.test\/api\/when\/stop\/[0-9a-f]{32}$/);
  expect((await t.db.query(`select count(*)::int as n from when_event where kind='reminder_sent'`)).rows).toEqual([{ n: 2 }]);
});

it('drops a reminder whose person answered before it went', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), first = await poll(maya), { mails, it: c } = carrier();
  await saveAnswer(t.db, josh, { pollId: first, slots: [TUE7] }, NOW);
  const second = await poll(maya);
  await t.db.query('update when_poll set series_id=$1 where id=$2', [first, second]);
  await drainWhen(t.db, { ...c, email: null }, { now: hoursBefore(47) });
  expect(await states()).toEqual([{ name: 'Josh', kind: 'reminder_48', state: 'queued', attempts: 0 }]);
  await saveAnswer(t.db, josh, { pollId: second, slots: [TUE7] }, NOW);
  await drainWhen(t.db, c, { now: hoursBefore(46) });
  expect(mails).toEqual([]);
  expect(await states()).toEqual([]);
});

it('sends each invite from the organizer by name, with the calendar file for that one person', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), dana = await who('Dana'), id = await poll(maya), { mails, it: c } = carrier();
  await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7] }, NOW);
  await saveAnswer(t.db, dana, { pollId: id, slots: [THU7] }, NOW);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: 'Olin Library, room 301.' }, NOW);
  expect(await drainWhen(t.db, c, { now: NOW, pollId: id })).toMatchObject({ sent: 3, failed: 0 });
  expect(mails.map(mail => mail.to).sort()).toEqual(['dana@cornell.edu', 'josh@cornell.edu', 'maya@cornell.edu']);
  const toJosh = mails.find(mail => mail.to === 'josh@cornell.edu')!, toDana = mails.find(mail => mail.to === 'dana@cornell.edu')!;
  expect(toJosh).toMatchObject({ from: '"Maya via Loopd" <when@loopd.test>', replyTo: 'maya@cornell.edu', subject: 'Problem set night is on: Tue 1 Dec, 7 pm' });
  expect(toJosh.calendar!.content.replace(/\r\n /g, '')).toContain('mailto:josh@cornell.edu');
  expect(toJosh.calendar!.content).toContain('DTSTART:20261202T000000Z');
  expect(toJosh.text).toContain("Tuesday at 7 pm. It's on.");
  expect(toJosh.text).toContain('Maya: Olin Library, room 301.');
  expect(toJosh.text).toContain(`Add to my calendar: https://loopd.test/when/${id}/calendar.ics`);
  expect(toJosh.text).not.toContain("can't make");
  expect(toDana.text).toContain("You said you can't make this one.");
  expect(toJosh.html).not.toContain('—');
  expect(await states()).toEqual(['Dana', 'Josh', 'Maya'].map(name => ({ name, kind: 'invite', state: 'sent', attempts: 1 })));
  expect(await drainWhen(t.db, c, { now: NOW })).toMatchObject({ sent: 0 });
});

it('marks one person failed when they have no address, and still sends to the rest', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), id = await poll(maya), { mails, it: c } = carrier({ none: ['Josh'] });
  await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7] }, NOW);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7 }, NOW);
  expect(await drainWhen(t.db, c, { now: NOW })).toMatchObject({ sent: 1, failed: 1 });
  expect(mails.map(mail => mail.to)).toEqual(['maya@cornell.edu']);
  expect(await states()).toEqual([{ name: 'Josh', kind: 'invite', state: 'failed', attempts: 1 }, { name: 'Maya', kind: 'invite', state: 'sent', attempts: 1 }]);
});

it('tries a message again later, four times in all, then gives up', async () => {
  const maya = await who('Maya'), id = await poll(maya), { it: c } = carrier({ answer: { ok: false, retry: true } });
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7] }, NOW);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7 }, NOW);
  expect(await drainWhen(t.db, c, { now: NOW })).toMatchObject({ retrying: 1, failed: 0 });
  expect(await states()).toEqual([{ name: 'Maya', kind: 'invite', state: 'queued', attempts: 1 }]);
  await drainWhen(t.db, c, { now: NOW }); await drainWhen(t.db, c, { now: NOW });
  expect(await drainWhen(t.db, c, { now: NOW })).toMatchObject({ retrying: 0, failed: 1 });
  expect(await states()).toEqual([{ name: 'Maya', kind: 'invite', state: 'failed', attempts: 4 }]);
  const refused = carrier({ answer: { ok: false, retry: false } }), other = await poll(maya);
  await saveAnswer(t.db, maya, { pollId: other, slots: [TUE7] }, NOW);
  await sendPoll(t.db, maya, { pollId: other, slot: TUE7 }, NOW);
  expect(await drainWhen(t.db, refused.it, { now: NOW, pollId: other })).toMatchObject({ failed: 1 });
});

it('queues and sends nothing, and fails nothing, with no email provider', async () => {
  const maya = await who('Maya'), id = await poll(maya), { it: c } = carrier();
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7] }, NOW);
  expect(await drainWhen(t.db, { ...c, email: null }, { now: AFTER })).toEqual({ readied: 1, queued: 0, sent: 0, failed: 0, retrying: 0 });
  expect(await states()).toEqual([{ name: 'Maya', kind: 'ready', state: 'queued', attempts: 0 }]);
});

it('stops reminders from the stop link, on a press and never on a look', async () => {
  const maya = await who('Maya'), id = await poll(maya);
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7] }, NOW);
  const { rows: [{ token }] } = await t.db.query<{ token: string }>('select stop_token as token from when_answer');
  const off = async () => (await t.db.query<{ off: boolean }>('select reminders_off as off from when_answer')).rows[0].off, params = (value: string) => ({ params: Promise.resolve({ token: value }) });
  expect((await stopPage()).status).toBe(200);
  expect(await off()).toBe(false);
  expect((await stopPost(new Request('https://loopd.test/x', { method: 'POST' }), params('f'.repeat(32)))).status).toBe(404);
  expect((await stopPost(new Request('https://loopd.test/x', { method: 'POST' }), params('nope'))).status).toBe(404);
  expect((await stopPost(new Request('https://loopd.test/x', { method: 'POST' }), params(token))).status).toBe(204);
  expect(await off()).toBe(true);
  const pressed = await stopPost(new Request('https://loopd.test/x', { method: 'POST', headers: { accept: 'text/html' } }), params(token));
  expect(await pressed.text()).toContain('Stopped.');
});
