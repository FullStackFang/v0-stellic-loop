// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { animalOf, PHOTO } from '@/lib/campus/animals';
import { makeCustomFace } from '@/lib/campus/custom-face';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { subscribe } from '@/lib/campus/custom-face';
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
const ask = async (who: Principal | null) => { const page = await (await (who ? withPortalTestSession(who, GET) : GET())).text(); expect(page).toContain('<canvas id="game"'); return JSON.parse(/<script>window.congaPlayer = (.*);<\/script>/.exec(page)![1]); };

it('tells the game nothing about someone signed out', async () => {
  expect(await ask(null)).toBeNull();
});

it('gives the animal a person wears, by its place on the sheet, in their school\'s colours, and no more without Ink+', async () => {
  const ana = await person('ana@cornell.edu');
  expect(await ask(ana)).toEqual({ ink: false, plus: false, kit: 'cornell', animals: [{ face: animalOf(ana.personId) + 1, picture: null, kit: 'cornell' }] });
  await pickFace(t.db, ana.personId, 11);
  expect((await ask(ana)).animals).toEqual([{ face: 12, picture: null, kit: 'cornell' }]);
});

it('gives someone who wears their photo the animal they were given', async () => {
  const ana = await person('ana@cornell.edu');
  await pickFace(t.db, ana.personId, PHOTO);
  expect((await ask(ana)).animals[0].face).toBe(animalOf(ana.personId) + 1);
});

it('gives a pet of their own as a picture', async () => {
  const ana = await person('ana@cornell.edu');
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const { token } = await makeCustomFace(t.db, ana.personId, png, 'ana@cornell.edu', async () => ({ small: png, large: png }));
  // Making a pet takes Ink, so the pet leads, and Ink's animals follow it.
  const { animals } = await ask(ana);
  expect(animals[0]).toEqual({ face: 0, picture: `/animals/custom/${token}`, kit: 'cornell' });
  expect(animals.map((each: { face: number }) => each.face)).toContain(37);
});

it('with Ink+ offers their school\'s animal and the premium ones too, the one worn first and none twice', async () => {
  const ana = await person('ana@cornell.edu');
  await pickFace(t.db, ana.personId, 11);
  await subscribeInkPlus(t.db, ana.personId, 'ana@cornell.edu');
  const told = await ask(ana), faces = told.animals.map((each: { face: number }) => each.face);
  expect([told.ink, told.plus]).toEqual([true, true]);
  expect(told.animals[0]).toEqual({ face: 12, picture: null, kit: 'cornell' });
  // public/animals: 37 is the dachshund (premium), 38 Cornell's bear, 39 Columbia's lion, which is not hers.
  expect(faces).toContain(37);
  expect(faces).toContain(38);
  expect(faces).not.toContain(39);
  expect(new Set(faces).size).toBe(faces.length);
});

// Your own animal is Ink's (openspec loop-ink-tiers): Ink+ adds only the sparkle.
it('with Ink plays as your own animal, without the sparkle', async () => {
  const ana = await person('ana@cornell.edu');
  await subscribe(t.db, ana.personId, 'ana@cornell.edu');
  const told = await ask(ana);
  expect([told.ink, told.plus]).toEqual([true, false]);
  expect(told.animals.map((each: { face: number }) => each.face)).toContain(37);
});

it('counts the admin as having Ink+, and offers every school\'s animal in that school\'s colours', async () => {
  const ana = await person('boss@cornell.edu');
  vi.stubEnv('LOOP_ADMIN', 'boss@cornell.edu');
  const told = await ask(ana);
  expect([told.ink, told.plus]).toEqual([true, true]);
  expect(told.animals).toContainEqual({ face: 38, picture: null, kit: 'cornell' });
  expect(told.animals).toContainEqual({ face: 39, picture: null, kit: 'columbia' });
});
