// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { animalOf } from '@/lib/campus/animals';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { GET } from './route';

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
/** The page as served, which is still the game, and who it was told is playing. */
const ask = async (who: Principal | null) => { const page = await (await (who ? withPortalTestSession(who, GET) : GET())).text(); expect(page).toContain('id="redo"'); return JSON.parse(/<script>window.seatsPlayer = (.*);<\/script>/.exec(page)![1]); };

it('tells the game nothing about someone signed out', async () => {
  expect(await ask(null)).toBeNull();
});

it('gives someone without Ink+ the animal they wear, and says they have no Ink+', async () => {
  const ana = await person('ana@cornell.edu');
  expect(await ask(ana)).toEqual({ ink: false, kit: 'cornell', animals: [{ face: animalOf(ana.personId) + 1, picture: null, kit: 'cornell' }] });
});

it('says who has Ink+, and gives them more animals to choose among', async () => {
  const ana = await person('ana@cornell.edu');
  await subscribeInkPlus(t.db, ana.personId, 'ana@cornell.edu');
  const player = await ask(ana);
  expect(player.ink).toBe(true);
  expect(player.animals.length).toBeGreaterThan(1);
});
