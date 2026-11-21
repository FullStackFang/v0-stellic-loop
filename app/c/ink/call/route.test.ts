// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { callAsks } from '@/lib/campus/call-ask';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { POST } from './route';
import { GET } from '../join/route';

// Spec: openspec/changes/loop-ink-tiers/specs/ink-tiers ("The Ink page knows you", "15 minutes?").
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

async function person(email: string) {
  const row = await makePerson(t.db, 'Ana Lopez');
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const as = async <T,>(who: Principal | null, run: () => Promise<T>) => who ? withPortalTestSession(who, run) : run();
const send = (who: Principal | null, body: object, origin: string | null = 'http://loop.test') => as(who, async () => {
  const answer = await POST(new Request('http://loop.test/c/ink/call', { method: 'POST', headers: { 'content-type': 'application/json', ...origin ? { origin } : {} }, body: JSON.stringify(body) }));
  return answer.status;
});
const look = (who: Principal | null) => as(who, async () => (await GET()).json());

it('tells the Ink page who is looking and which plan they have', async () => {
  expect(await look(null)).toEqual({ signedIn: false, plan: 'free', email: '' });
  const ana = await person('ana@cornell.edu');
  expect(await look(ana)).toEqual({ signedIn: true, plan: 'free', email: 'ana@cornell.edu' });
  await subscribeInkPlus(t.db, ana.personId, 'ana@cornell.edu');
  expect((await look(ana)).plan).toBe('plus');
});

it('keeps who, which they are, the days and times they typed and a note', async () => {
  const ana = await person('Ana@Cornell.edu');
  expect(await send(ana, { role: 'organizer', times: ['2026-11-24T15:00', '2026-11-25T11:30'], note: '  any   weekday after 4 ' })).toBe(200);
  // A note alone is enough.
  expect(await send(ana, { role: 'student', times: [], note: 'Mornings' })).toBe(200);
  expect((await callAsks(t.db)).map(({ email, role, times, note }) => [email, role, times, note])).toEqual([
    ['ana@cornell.edu', 'student', [], 'Mornings'], ['ana@cornell.edu', 'organizer', ['2026-11-24T15:00', '2026-11-25T11:30'], 'any weekday after 4']]);
});

it('takes a call ask from someone signed out with the email they gave on the Ink page', async () => {
  expect(await send(null, { role: 'student', times: ['2026-11-24T15:00'], email: 'ben@nyu.edu' })).toBe(200);
  expect(await send(null, { role: 'student', times: ['2026-11-24T15:00'], email: 'nope' })).toBe(401);
  expect((await callAsks(t.db)).map(({ email, role }) => [email, role])).toEqual([['ben@nyu.edu', 'student']]);
});

it('refuses someone signed out, another site, and an ask with no time and no note, a made-up role, or too many times', async () => {
  const ana = await person('ana@cornell.edu'), times = ['2026-11-24T15:00'];
  expect(await send(null, { role: 'student', times })).toBe(401);
  expect(await send(ana, { role: 'student', times }, 'https://evil.test')).toBe(403);
  expect(await send(ana, { role: 'student', times: [] })).toBe(400);
  expect(await send(ana, { role: 'dean', times })).toBe(400);
  expect(await send(ana, { role: 'student', times: ['tomorrow'] })).toBe(400);
  expect(await send(ana, { role: 'student', times: ['2026-11-21T09:00', '2026-11-22T09:00', '2026-11-23T09:00', '2026-11-24T09:00', '2026-11-25T09:00'] })).toBe(400);
  expect(await send(ana, { role: 'student', times, note: 'x'.repeat(201) })).toBe(400);
  expect(await callAsks(t.db)).toEqual([]);
});
