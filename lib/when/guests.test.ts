// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Mail } from '../email/resend';
import { claimGuest, guestOf, guestsOn, saveGuestAnswer, saveInviteEmail } from './guests';
import { drainWhen, type Carrier } from './outbox';
import { createPoll, pollView, saveAnswer } from './polls';
import { sendPoll } from './send';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://loopd.test'); });
afterAll(async () => { vi.unstubAllEnvs(); await t?.close(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date('2026-11-22T12:00:00Z'), TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z';
const BASE = { title: 'Pitch practice', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: '2026-11-27T23:00:00.000Z', threshold: 'two_thirds' };
const who = async (name: string) => ({ personId: (await makePerson(t.db, name)).id });
const poll = async (maker: { personId: string }) => (await createPoll(t.db, maker, BASE, NOW)).id;
const count = async (sql: string, values: unknown[] = []) => (await t.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, values)).rows[0].n;

it('keeps an answer under only a name, and finds the same guest again by the key their browser keeps', async () => {
  const maya = await who('Maya'), id = await poll(maya), other = await poll(maya);
  const { key } = await saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: '  Aaron   Lee ' }, NOW);
  expect(key).toMatch(/^[0-9a-f]{32}$/);
  expect(await count('when_guest where key_hash=$1', [key])).toBe(0);
  const guest = (await guestOf(t.db, key))!;
  expect(guest.name).toBe('Aaron Lee');
  expect(await pollView(t.db, guest, id)).toMatchObject({ answered: [{ name: 'Aaron Lee' }], counts: { [TUE7]: 1 }, mine: { slots: [TUE7], draft: false }, isOrganizer: false });
  // The same browser again: the same person, renamed if they typed another name, here and on another poll.
  expect((await saveGuestAnswer(t.db, key, { pollId: id, slots: [TUE7, TUE8], name: 'Aaron' }, NOW)).key).toBe(key);
  await saveGuestAnswer(t.db, key, { pollId: other, slots: [TUE8], name: 'Aaron' }, NOW);
  expect(await count('when_guest')).toBe(1);
  expect((await pollView(t.db, null, id))!.answered).toEqual([{ personId: guest.personId, name: 'Aaron' }]);
  expect([...(await guestsOn(t.db, id))]).toEqual([[guest.personId, { email: null }]]);
  // A key nobody was given names nobody, and makes a new guest.
  expect(await guestOf(t.db, 'f'.repeat(32))).toBeNull();
  expect(await guestOf(t.db, 'nonsense')).toBeNull();
});

it('refuses a guest answer with no name, hours the poll does not have, or a poll that is not there, and leaves nobody behind', async () => {
  const id = await poll(await who('Maya')), before = await count('person');
  await expect(saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: '   ' }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: 'x'.repeat(41) }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveGuestAnswer(t.db, undefined, { pollId: id, slots: ['2027-01-01T00:00:00.000Z'], name: 'Aaron' }, NOW)).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveGuestAnswer(t.db, undefined, { pollId: 'AAAAAAAAAAAA', slots: [], name: 'Aaron' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  expect(await count('person')).toBe(before);
  expect(await count('when_guest')).toBe(0);
});

it('takes two hundred answers on a poll and no more, though someone already in may still change theirs', async () => {
  const id = await poll(await who('Maya')), { key } = await saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: 'Aaron' }, NOW);
  await t.db.query(`with made as (insert into person(phone,name) select null,'Filler '||n from generate_series(1,199) n returning id) insert into when_answer(poll_id,person_id) select $1,id from made`, [id]);
  await expect(saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: 'Late' }, NOW)).rejects.toMatchObject({ code: 'full' });
  await saveGuestAnswer(t.db, key, { pollId: id, slots: [TUE8], name: 'Aaron' }, NOW);
  expect((await pollView(t.db, await guestOf(t.db, key), id))!.mine!.slots).toEqual([TUE8]);
});

it('sends a guest the invite at the address they typed for that poll, and nothing else', async () => {
  const maya = await who('Maya'), id = await poll(maya), mails: Mail[] = [];
  const carrier: Carrier = { from: 'when@loopd.test', email: async mail => { mails.push(mail); return { ok: true, providerId: 're_1' }; }, address: async personId => personId === maya.personId ? 'maya@cornell.edu' : null };
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7] }, NOW);
  const { key } = await saveGuestAnswer(t.db, undefined, { pollId: id, slots: [TUE7], name: 'Aaron' }, NOW), guest = (await guestOf(t.db, key))!;
  await expect(saveInviteEmail(t.db, key, { pollId: id, email: 'not an email' })).rejects.toMatchObject({ code: 'invalid' });
  await expect(saveInviteEmail(t.db, 'f'.repeat(32), { pollId: id, email: 'aaron@email.com' })).rejects.toMatchObject({ code: 'forbidden' });
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: '' }, NOW);
  // No address yet: the organizer's invite leaves, the guest's fails.
  expect(await drainWhen(t.db, carrier, { now: NOW })).toMatchObject({ sent: 1, failed: 1 });
  // They leave one after the time was set: their invite is tried again, with the calendar file.
  await saveInviteEmail(t.db, key, { pollId: id, email: '  Aaron@Email.com ' });
  expect([...(await guestsOn(t.db, id))]).toEqual([[guest.personId, { email: 'aaron@email.com' }]]);
  expect(await drainWhen(t.db, carrier, { now: NOW })).toMatchObject({ sent: 1, failed: 0 });
  expect(mails.map(mail => mail.to)).toEqual(['maya@cornell.edu', 'aaron@email.com']);
  expect(mails[1].calendar?.method).toBe('REQUEST');
});

it('moves a guest\'s answers to their account when they sign in, and keeps the account\'s own answer where it has one', async () => {
  const maya = await who('Maya'), josh = await who('Josh'), first = await poll(maya), second = await poll(maya), third = await poll(maya);
  const { key } = await saveGuestAnswer(t.db, undefined, { pollId: first, slots: [TUE7], name: 'J' }, NOW), guest = (await guestOf(t.db, key))!;
  await saveGuestAnswer(t.db, key, { pollId: second, slots: [TUE8], name: 'J' }, NOW);
  await saveGuestAnswer(t.db, key, { pollId: third, slots: [TUE8], name: 'J' }, NOW);
  await saveInviteEmail(t.db, key, { pollId: first, email: 'j@email.com' });
  // Josh's account already answered the second poll, and holds last time's draft for the third.
  await saveAnswer(t.db, josh, { pollId: second, slots: [TUE7] }, NOW);
  await t.db.query('insert into when_answer(poll_id,person_id,slots,draft) values($1,$2,$3::timestamptz[],true)', [third, josh.personId, [TUE7]]);
  expect(await claimGuest(t.db, josh, key)).toBe(2);
  expect((await pollView(t.db, josh, first))!).toMatchObject({ answered: [{ personId: josh.personId, name: 'Josh' }], mine: { slots: [TUE7], draft: false } });
  expect((await pollView(t.db, josh, second))!).toMatchObject({ answered: [{ name: 'Josh' }], mine: { slots: [TUE7] } });
  expect((await pollView(t.db, josh, third))!.mine).toEqual({ slots: [TUE8], draft: false });
  expect(await count('when_answer where invite_email is not null')).toBe(0);
  expect(await count('person where id=$1', [guest.personId])).toBe(0);
  expect(await count('when_guest')).toBe(0);
  expect(await count(`when_event where kind='response_saved' and person_id=$1`, [josh.personId])).toBe(4);
  // The key now names nobody, so a second try does nothing.
  expect(await claimGuest(t.db, josh, key)).toBe(0);
});
