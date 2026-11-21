// @vitest-environment node
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { subscribe } from '@/lib/campus/custom-face';
import { subscribeAsks, subscribeInkPlus } from '@/lib/campus/ink';
import { authenticate } from '@/lib/emba/access';
import { askGroupPicture, ASKS, asksMade, groupPictureImage, groupPictures, keepGroupPicture, picturePane, waitingGroupPictures, type DrawGroup, type Pick } from '@/lib/emba/group-picture';
import { startGroup } from '@/lib/emba/group-start';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { vi.unstubAllEnvs(); });

async function person(clientId?: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: `${row.id}@example.test`, clientId })))!;
}
/** A group, the person who started it (who has asked for Ink+), and a plain member of it. */
async function group() {
  const owner = await person(), { group: made } = await startGroup(t.db, owner, { name: 'Extreme Cheapskates', slug: 'cheapskates', parent: null, links: [], people: [], note: '', files: [] });
  const at = { orgId: made.orgId, loopId: made.loopId }, member = await person();
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [at.orgId, member.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [at.orgId, at.loopId, member.personId]);
  await subscribeInkPlus(t.db, owner.personId, 'owner@example.test');
  return { owner, member, at };
}
/** A stand-in for the model: a small figure with an empty edge round it, and a count of what it was asked. */
function drawer(fail: number[] = []) {
  const asked: number[] = [];
  const draw: DrawGroup = async animals => {
    asked.push(animals.length);
    if (fail.includes(asked.length)) throw new Error('model unavailable');
    return sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 120, height: 80, channels: 4, background: '#c60' } }).png().toBuffer(), left: 90, top: 60 }]).png().toBuffer();
  };
  return { draw, asked };
}
const FOUR: Pick[] = [{ face: 4 }, { face: 11 }, { face: 22 }, { face: 30 }];
const size = async (image: Uint8Array | null) => { const { width, height } = await sharp(image!).metadata(); return [width, height]; };

it('draws the picked animals twice for whoever runs the group, and the group has no picture until one is kept', async () => {
  const { owner, member, at } = await group(), { draw, asked } = drawer();
  const { tokens } = await askGroupPicture(t.db, owner, at, FOUR, draw);
  expect(tokens).toHaveLength(2);
  expect(asked).toEqual([4, 4]);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map());
  expect(await waitingGroupPictures(t.db, owner, at)).toHaveLength(2);
  // The whole drawing with its empty edge cut away, and a 192px tile.
  expect(await size(await groupPictureImage(t.db, tokens[0], true))).toEqual([120, 80]);
  expect(await size(await groupPictureImage(t.db, tokens[0]))).toEqual([192, 192]);
  expect(await groupPictureImage(t.db, '00000000-0000-4000-8000-000000000000')).toBeNull();

  await keepGroupPicture(t.db, owner, at, tokens[1]);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map([[at.loopId, tokens[1]]]));
  expect(await waitingGroupPictures(t.db, owner, at)).toEqual([]);
  // A member keeps nothing. The one set aside can be worn after all, and then the other is set aside.
  await expect(keepGroupPicture(t.db, member, at, tokens[1])).rejects.toThrow('forbidden');
  await keepGroupPicture(t.db, owner, at, tokens[0]);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map([[at.loopId, tokens[0]]]));
  expect((await picturePane(t.db, owner, at))!.drawn.sort()).toEqual([...tokens].sort());
  await keepGroupPicture(t.db, owner, at, tokens[1]);

  // A newer picture takes the place of the one the group had.
  const again = await askGroupPicture(t.db, owner, at, [{ face: 1 }, { face: 2 }], draw);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map([[at.loopId, tokens[1]]]));
  await keepGroupPicture(t.db, owner, at, again.tokens[0]);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map([[at.loopId, again.tokens[0]]]));
});

it('is for whoever runs the group on the site, with two to six different animals', async () => {
  const { owner, member, at } = await group(), { draw, asked } = drawer();
  await subscribeInkPlus(t.db, member.personId, 'member@example.test');
  await expect(askGroupPicture(t.db, member, at, FOUR, draw)).rejects.toThrow('forbidden');
  await expect(askGroupPicture(t.db, { ...owner, clientId: 'claude' }, at, FOUR, draw)).rejects.toThrow('forbidden');
  await expect(waitingGroupPictures(t.db, member, at)).rejects.toThrow('forbidden');
  for (const picked of [[{ face: 4 }], Array.from({ length: 7 }, (_, face) => ({ face })), [{ face: 4 }, { face: 4 }], [{ face: 4 }, { nothing: 1 }] as unknown as Pick[]])
    await expect(askGroupPicture(t.db, owner, at, picked, draw)).rejects.toThrow('Pick 2 to 6 animals.');
  expect(asked).toEqual([]);
  expect(await asksMade(t.db, owner.personId)).toBe(0);
});

it('takes only animals the person could wear: their own made ones, and the Ink ones, which Ink+ holds', async () => {
  const { owner, member, at } = await group(), { draw, asked } = drawer();
  const pet = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#963' } }).png().toBuffer();
  const made = async (personId: string) => (await t.db.query<{ token: string }>("insert into campus_custom_picture(person_id,image) values($1,decode($2,'base64')) returning token::text as token", [personId, pet.toString('base64')])).rows[0].token;
  const mine = await made(owner.personId), theirs = await made(member.personId);
  // Another person's made animal is not theirs. Ink animals (36 is the first) are: drawing needs Ink+, which holds Ink (openspec loop-ink-tiers).
  await expect(askGroupPicture(t.db, owner, at, [{ face: 4 }, { token: theirs }], draw)).rejects.toThrow('Pick from your own animals.');
  expect(asked).toEqual([]);
  expect((await askGroupPicture(t.db, owner, at, [{ face: 4 }, { face: 36 }, { token: mine }], draw)).tokens).toHaveLength(2);
  expect(asked).toEqual([3, 3]);
});

it('asks for Ink+ first, stops at the limit, and never asks or stops the admin', async () => {
  const { owner, at } = await group(), { draw } = drawer();
  await t.db.query('delete from campus_ink_plus');
  await expect(askGroupPicture(t.db, owner, at, FOUR, draw)).rejects.toThrow('comes with Loopd Ink+');
  expect(await subscribeInkPlus(t.db, owner.personId, 'not an email')).toBe(false);
  expect(await subscribeInkPlus(t.db, owner.personId, ' Owner@Example.test ')).toBe(true);
  for (let n = 0; n < ASKS; n++) await askGroupPicture(t.db, owner, at, FOUR, draw);
  await expect(askGroupPicture(t.db, owner, at, FOUR, draw)).rejects.toThrow(`drawn ${ASKS} times`);
  expect(await asksMade(t.db, owner.personId)).toBe(ASKS);

  const admin = await person();
  vi.stubEnv('LOOP_ADMIN', admin.subject);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [at.orgId, admin.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'organizer')", [at.orgId, at.loopId, admin.personId]);
  // No Ink+, more than the limit, and an Ink animal with no Ink.
  for (let n = 0; n <= ASKS; n++) expect((await askGroupPicture(t.db, admin, at, [{ face: 4 }, { face: 36 }], draw)).tokens).toHaveLength(2);
});

it('gives the card what it shows, to whoever runs the group alone, and passes the person\'s own line to the drawing', async () => {
  const { owner, member, at } = await group(), said: (string | undefined)[] = [];
  const draw: DrawGroup = (animals, note) => { said.push(note); return drawer().draw(animals); };
  expect(await picturePane(t.db, member, at)).toBeNull();
  const before = (await picturePane(t.db, owner, at))!;
  expect(before).toMatchObject({ fewest: 2, most: 6, plus: true, asksLeft: ASKS, waiting: [], kept: null });
  // Everyone's 36, and the Ink ones, since Ink+ holds Ink.
  expect(before.choices.filter(one => one.kind === 'core')).toHaveLength(36);
  expect(before.choices.some(one => one.kind === 'ink')).toBe(true);
  const { tokens } = await askGroupPicture(t.db, owner, at, FOUR, draw, '  matching <b>scarves</b>!  ');
  expect(said).toEqual(['matching b scarves b', 'matching b scarves b']);
  await keepGroupPicture(t.db, owner, at, tokens[0]);
  expect(await picturePane(t.db, owner, at)).toMatchObject({ asksLeft: ASKS - 1, waiting: [], kept: tokens[0] });
});

it('records every press of Subscribe, with the plan and where it was pressed', async () => {
  const one = await person();
  await subscribe(t.db, one.personId, 'One@Example.test');
  await subscribeInkPlus(t.db, one.personId, 'one@example.test');
  await subscribeInkPlus(t.db, one.personId, 'one@example.test', 'save picture');
  expect(await subscribeInkPlus(t.db, one.personId, 'nope', 'save picture')).toBe(false);
  expect((await subscribeAsks(t.db)).map(({ email, plan, place }) => [email, plan, place])).toEqual([
    ['one@example.test', 'ink_plus', 'save picture'], ['one@example.test', 'ink_plus', 'group picture'], ['one@example.test', 'ink', 'own animal']]);
});

it('offers the one drawing that worked, and counts nothing when neither did', async () => {
  const { owner, at } = await group();
  const one = await askGroupPicture(t.db, owner, at, FOUR, drawer([1]).draw);
  expect(one.tokens).toHaveLength(1);
  await keepGroupPicture(t.db, owner, at, one.tokens[0]);
  expect(await asksMade(t.db, owner.personId)).toBe(1);
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(askGroupPicture(t.db, owner, at, FOUR, drawer([1, 2]).draw)).rejects.toThrow('could not be drawn just now');
  quiet.mockRestore();
  expect(await asksMade(t.db, owner.personId)).toBe(1);
  expect(await groupPictures(t.db, [at.loopId])).toEqual(new Map([[at.loopId, one.tokens[0]]]));
});
