// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { POST } from './route';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The browser's number (app/c/seen's lp_v cookie), as each test sets it.
const jar = vi.hoisted(() => ({ visitor: null as string | null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === 'lp_v' && jar.visitor ? { value: jar.visitor } : undefined }) }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('truncate conga_round'); jar.visitor = null; });
const rounds = async () => (await t.db.query<{ person_id: string | null; visitor: string | null; map: string; line: number }>('select person_id,visitor,map,line from conga_round order by id')).rows;

async function person(email: string, name: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const send = (who: Principal | null, body: unknown) => {
  const call = () => POST(new Request('http://loopd.test/conga/score', { method: 'POST', body: JSON.stringify(body) }));
  return who ? withPortalTestSession(who, call) : call();
};

it('keeps a signed-in player\'s round and answers with the board', async () => {
  const ana = await person('ana@cornell.edu', 'Ana Lopez');
  const answer = await send(ana, { map: 'cornell', best: 401, seconds: 300, face: 99 });
  expect(answer.status).toBe(200);
  expect((await answer.json()).boards.cornell).toEqual([expect.objectContaining({ place: 1, name: 'Ana L.', best: 401, kit: 'cornell', you: true })]);
});

it('keeps nobody signed out, and refuses a round that could not have happened', async () => {
  expect((await send(null, { map: 'cornell', best: 40, seconds: 60 })).status).toBe(401);
  const ana = await person('ana@cornell.edu', 'Ana Lopez');
  expect((await send(ana, { map: 'cornell', best: 900, seconds: 10 })).status).toBe(400);
  expect((await send(ana, 'nonsense')).status).toBe(400);
});

it('counts every round that ends: a guest by their browser, a player by who they are, and not a round sent again', async () => {
  const guest = 'a'.repeat(32);
  jar.visitor = guest;
  expect((await send(null, { map: 'cornell', best: 40, seconds: 60 })).status).toBe(401);
  const ana = await person('ana@cornell.edu', 'Ana Lopez');
  await send(ana, { map: 'cornell', best: 120, seconds: 90, again: true }); // the guest's round, replayed after signing in
  await send(ana, { map: 'nyu', best: 50, seconds: 60 });
  await send(null, { map: 'cornell', best: 900, seconds: 10 }); // could not have happened
  expect(await rounds()).toEqual([{ person_id: null, visitor: guest, map: 'cornell', line: 40 }, { person_id: ana.personId, visitor: null, map: 'nyu', line: 50 }]);
});
