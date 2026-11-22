// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { planOf, signedOutAsks, subscribeAsks } from '@/lib/campus/ink';
import { GET, POST } from './route';

// Spec: openspec/changes/loop-ink-tiers/specs/ink-tiers ("Every ask signs you up").
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
const join = async (who: Principal | null, body: object, origin: string | null = 'http://loop.test') => {
  const run = async () => { const answer = await POST(new Request('http://loop.test/c/ink/join', { method: 'POST', headers: { 'content-type': 'application/json', ...origin ? { origin } : {} }, body: JSON.stringify(body) })); return { status: answer.status, body: await answer.json() }; };
  return who ? withPortalTestSession(who, run) : run();
};

it('gives the plan at once, with the account email, and records who, which plan and where', async () => {
  const ana = await person('Ana@Cornell.edu');
  expect(await join(ana, { plan: 'plus', place: 'ink page: Get Ink+' })).toEqual({ status: 200, body: { ok: true, said: 'Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink+ for now. We’ll write to ana@cornell.edu when it is.' } });
  expect(await planOf(t.db, ana.personId)).toBe('plus');
  // Signing up again changes nothing, and is recorded again.
  expect((await join(ana, { plan: 'plus', place: 'colours: Sign up' })).status).toBe(200);
  expect((await subscribeAsks(t.db)).map(({ email, plan, place }) => [email, plan, place])).toEqual([['ana@cornell.edu', 'ink_plus', 'colours: Sign up'], ['ana@cornell.edu', 'ink_plus', 'ink page: Get Ink+']]);
});

it('signs up for Ink from a game', async () => {
  const ana = await person('ana@cornell.edu');
  expect((await join(ana, { plan: 'ink', place: 'seats: Get Ink' })).body.said).toBe('Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink for now. We’ll write to ana@cornell.edu when it is.');
  expect(await planOf(t.db, ana.personId)).toBe('ink');
  expect((await subscribeAsks(t.db))[0]).toMatchObject({ plan: 'ink', place: 'seats: Get Ink' });
});

it('on the Ink page, signs someone signed out up with the email they give, and gives them the plan once they sign in with it', async () => {
  expect(await join(null, { plan: 'plus', place: 'ink page: Get Ink+', email: 'Ana@Cornell.edu ' })).toEqual({ status: 200, body: { ok: true, signedOut: true } });
  expect(await join(null, { plan: 'ink', place: 'ink page: Get Ink', email: 'ana@cornell.edu' })).toEqual({ status: 200, body: { ok: true, signedOut: true } });
  expect((await join(null, { plan: 'ink', place: 'ink page: Get Ink', email: 'nope' })).status).toBe(400);
  // Outside the Ink page, an email is not enough: sign in.
  expect((await join(null, { plan: 'ink', place: 'seats: Get Ink', email: 'ana@cornell.edu' })).status).toBe(401);
  expect((await signedOutAsks(t.db)).map(({ email, plan, claimed }) => [email, plan, claimed])).toEqual([['ana@cornell.edu', 'ink', false], ['ana@cornell.edu', 'ink_plus', false]]);
  // Signing in with that email, the Ink page gives the highest plan asked for, once.
  const ana = await person('ana@cornell.edu');
  expect(await withPortalTestSession(ana, async () => (await GET()).json())).toMatchObject({ signedIn: true, plan: 'plus' });
  await withPortalTestSession(ana, () => GET());
  expect((await subscribeAsks(t.db)).map(({ plan, place }) => [plan, place])).toEqual([['ink_plus', 'ink page: Get Ink+ (signed out)']]);
  expect((await signedOutAsks(t.db)).every(ask => ask.claimed)).toBe(true);
});

it('sends someone signed out to sign in and back, and refuses another site, an unknown place and a made-up plan', async () => {
  expect(await join(null, { plan: 'ink', place: 'ink page: Get Ink', back: '/c/ink' })).toEqual({ status: 401, body: { ok: false, signIn: '/sign-in?redirect_url=%2Fc%2Fink' } });
  expect((await join(null, { plan: 'ink', place: 'ink page: Get Ink', back: '//evil.test' })).body.signIn).toBe('/sign-in?redirect_url=%2Fc%2Fink');
  const ana = await person('ana@cornell.edu');
  expect((await join(ana, { plan: 'plus', place: 'ink page: Get Ink+' }, 'https://evil.test')).status).toBe(403);
  expect((await join(ana, { plan: 'plus', place: 'ink page: Get Ink+' }, null)).status).toBe(403);
  expect((await join(ana, { plan: 'plus', place: 'anywhere' })).status).toBe(400);
  expect((await join(ana, { plan: 'gold', place: 'ink page: Get Ink+' })).status).toBe(400);
  expect([await planOf(t.db, ana.personId), await subscribeAsks(t.db)]).toEqual(['free', []]);
});
