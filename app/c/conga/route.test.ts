// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { animalOf, PHOTO } from '@/lib/campus/animals';
import { makeCustomFace } from '@/lib/campus/custom-face';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { pickFace } from '@/lib/campus/people';
import { GET } from './route';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { vi.unstubAllEnvs(); });

async function person(email: string, name = 'Ana Lopez') {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const ask = async (who: Principal | null) => (await (who ? withPortalTestSession(who, GET) : GET())).json();

it('tells the game nothing about someone signed out', async () => {
  expect(await ask(null)).toBeNull();
});

it('gives the animal a person wears, by its place on the sheet, and no Ink+ until they have it', async () => {
  const ana = await person('ana@cornell.edu');
  expect(await ask(ana)).toEqual({ face: animalOf(ana.personId) + 1, picture: null, ink: false });
  await pickFace(t.db, ana.personId, 11);
  expect(await ask(ana)).toEqual({ face: 12, picture: null, ink: false });
  await subscribeInkPlus(t.db, ana.personId, 'ana@cornell.edu');
  expect((await ask(ana)).ink).toBe(true);
});

it('gives someone who wears their photo the animal they were given', async () => {
  const ana = await person('ana@cornell.edu');
  await pickFace(t.db, ana.personId, PHOTO);
  expect((await ask(ana)).face).toBe(animalOf(ana.personId) + 1);
});

it('gives a pet of their own as a picture', async () => {
  const ana = await person('ana@cornell.edu');
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const { token } = await makeCustomFace(t.db, ana.personId, png, 'ana@cornell.edu', async () => ({ small: png, large: png }));
  expect(await ask(ana)).toEqual({ face: 0, picture: `/animals/custom/${token}`, ink: false });
});

it('counts the admin as having Ink+', async () => {
  const ana = await person('boss@cornell.edu');
  vi.stubEnv('LOOP_ADMIN', 'boss@cornell.edu');
  expect((await ask(ana)).ink).toBe(true);
});
