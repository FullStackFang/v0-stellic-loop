// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { clubAsks } from '@/lib/campus/imprint';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown, viewer: null as { personId: string } | null }));
vi.mock('@/lib/db', async original => ({ ...(await original<typeof import('@/lib/db')>()), db: () => state.db }));
vi.mock('@/lib/campus/session', () => ({ campusViewer: async () => state.viewer }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); state.db = t.db; });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); state.viewer = null; });

const post = async (body: unknown, origin = 'https://loopd.test') => {
  const { POST } = await import('./route');
  return POST(new Request('https://loopd.test/organizers/ask', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
};

it('keeps a claim from a signed-out visitor: the club, the email, the plan and where it was pressed', async () => {
  const answer = await post({ club: '  Thursday   Supper Club ', email: ' Ana@School.EDU ', plan: 'imprint' });
  expect(answer.status).toBe(200);
  expect((await clubAsks(t.db)).map(({ club, email, plan, place }) => [club, email, plan, place])).toEqual([['Thursday Supper Club', 'ana@school.edu', 'imprint', 'organizers page']]);
  expect((await t.db.query('select person_id from campus_club_ask')).rows).toEqual([{ person_id: null }]);
});

it('adds who pressed when they are signed in, and never takes it from what the page sends', async () => {
  const me = await makePerson(t.db), other = await makePerson(t.db);
  state.viewer = { personId: me.id };
  expect((await post({ club: 'Ski Club', email: 'me@school.edu', plan: 'free', personId: other.id })).status).toBe(200);
  expect((await t.db.query('select person_id from campus_club_ask')).rows).toEqual([{ person_id: me.id }]);
});

it('keeps every press, a second one too', async () => {
  await post({ club: 'Ski Club', email: 'me@school.edu', plan: 'free' }); await post({ club: 'Ski Club', email: 'me@school.edu', plan: 'imprint' });
  expect((await clubAsks(t.db)).map(ask => ask.plan).sort()).toEqual(['free', 'imprint']);
});

it.each([
  ['no club', { club: '  ', email: 'me@school.edu', plan: 'free' }],
  ['an email that is not one', { club: 'Ski Club', email: 'me at school', plan: 'free' }],
  ['a plan there is not', { club: 'Ski Club', email: 'me@school.edu', plan: 'gold' }],
  ['a club name too long', { club: 'x'.repeat(121), email: 'me@school.edu', plan: 'free' }],
  ['fields of the wrong kind', { club: 7, email: ['me@school.edu'], plan: 'free' }],
  ['something that is not an object', 'null'],
  ['text that is not JSON', '{club'],
])('turns away %s and keeps nothing', async (_what, body) => {
  expect((await post(body)).status).toBe(400);
  expect(await clubAsks(t.db)).toEqual([]);
});

it('turns away a form posted from another site', async () => {
  expect((await post({ club: 'Ski Club', email: 'me@school.edu', plan: 'free' }, 'https://elsewhere.test')).status).toBe(403);
  expect(await clubAsks(t.db)).toEqual([]);
});
