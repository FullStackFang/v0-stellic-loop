// @vitest-environment node
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { PHOTO } from '@/lib/campus/animals';
import { customFaceLarge, makeCustomFace } from '@/lib/campus/custom-face';
import { subscribeInkPlus } from '@/lib/campus/ink';
import { pickFace } from '@/lib/campus/people';
import { grounds, hex } from '@/lib/campus/save-shapes';
import { startGroup } from '@/lib/emba/group-start';
import { GET } from './route';

// Spec: openspec/changes/loop-save-picture/specs/save-picture.
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The two models behind a made animal: one reads the photo, one draws it.
const drawn = vi.hoisted(() => ({ png: null as Uint8Array | null }));
vi.mock('ai', async original => ({ ...(await original<typeof import('ai')>()), generateText: vi.fn(async () => ({ text: '{"animal":true,"nearest":10}' })), generateImage: vi.fn(async () => ({ image: { uint8Array: drawn.png! } })) }));

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
const ask = (who: Principal | null, query: string) => { const run = () => GET(new Request(`http://loop.test/c/save?${query}`)); return who ? withPortalTestSession(who, run) : run(); };
const picture = async (answer: Response) => { const png = Buffer.from(await answer.arrayBuffer()), seen = await sharp(png).metadata(); return { png, size: [seen.width, seen.height] }; };
const corner = async (png: Buffer) => { const { data } = await sharp(png).ensureAlpha().extract({ left: 3, top: 3, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true }); return { colour: `#${[0, 1, 2].map(at => data[at].toString(16).padStart(2, '0')).join('')}`, alpha: data[3] }; };
/** How much the strip where the mark's word sits on a profile picture varies: next to nothing when it is only ground. */
const word = async (png: Buffer) => (await sharp(await sharp(png).extract({ left: 380, top: 925, width: 320, height: 45 }).png().toBuffer()).stats()).channels[0].stdev;

it('gives a signed-in person their animal in each shape, free, with the Loop mark, and nothing to someone signed out', async () => {
  const ana = await person('ana@cornell.edu');
  expect((await ask(null, 'shape=profile')).status).toBe(401);
  const [school, , cream] = grounds('cornell');
  const profile = await ask(ana, 'shape=profile');
  expect(profile.status).toBe(200);
  expect(profile.headers.get('content-type')).toBe('image/png');
  expect(profile.headers.get('content-disposition')).toBe('inline; filename="loop-profile.png"');
  const first = await picture(profile);
  expect(first.size).toEqual([1080, 1080]);
  // Their school's colour is the ground unless they pick another.
  expect(await corner(first.png)).toEqual({ colour: hex(school.bg), alpha: 255 });
  expect(await word(first.png)).toBeGreaterThan(10);
  const tall = await ask(ana, 'shape=tall&ground=cream&dl=1');
  expect(tall.headers.get('content-disposition')).toBe('attachment; filename="loop-lock-screen.png"');
  const second = await picture(tall);
  expect(second.size).toEqual([1080, 1920]);
  expect((await corner(second.png)).colour).toBe(hex(cream.bg));
  const cut = await picture(await ask(ana, 'shape=sticker'));
  expect(cut.size).toEqual([512, 512]);
  expect((await corner(cut.png)).alpha).toBe(0);
  // The pane's preview is the same picture, small.
  expect((await picture(await ask(ana, 'shape=tall&small=1'))).size).toEqual([261, 464]);
  // A sticker's preview is the sticker itself: made smaller it would be shown blurred.
  expect((await picture(await ask(ana, 'shape=sticker&small=1'))).size).toEqual([512, 512]);
  expect((await ask(ana, 'shape=poster')).status).toBe(400);
});

it('takes the mark off only for Ink+ and for the admin, and decides it on the server', async () => {
  const ana = await person('ana@cornell.edu');
  const refused = await ask(ana, 'shape=profile&mark=0');
  expect(refused.status).toBe(403);
  expect(await refused.text()).toMatch(/Ink\+/);
  expect(await subscribeInkPlus(t.db, ana.personId, 'ana@cornell.edu', 'save picture')).toBe(true);
  expect((await t.db.query<{ place: string }>('select place from campus_subscribe_ask where person_id=$1', [ana.personId])).rows).toEqual([{ place: 'save picture' }]);
  const plain = await ask(ana, 'shape=profile&mark=0');
  expect(plain.status).toBe(200);
  expect(plain.headers.get('content-disposition')).toBe('inline; filename="profile.png"');
  expect(await word((await picture(plain)).png)).toBeLessThan(1);
  const omar = await person('omar@cornell.edu', 'Omar');
  expect((await ask(omar, 'shape=sticker&mark=0')).status).toBe(403);
  vi.stubEnv('LOOP_ADMIN', 'omar@cornell.edu');
  expect((await ask(omar, 'shape=sticker&mark=0')).status).toBe(200);
});

it('keeps a made animal large and saves from that, and has nothing to save for someone wearing their own photo', async () => {
  const ana = await person('ana@cornell.edu');
  drawn.png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 800, height: 600, channels: 4, background: '#c60' } }).png().toBuffer(), left: 100, top: 200 }]).png().toBuffer();
  const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).jpeg().toBuffer();
  const { token } = await makeCustomFace(t.db, ana.personId, photo, 'ana@cornell.edu');
  const large = await sharp(Buffer.from((await customFaceLarge(t.db, token))!)).metadata();
  // The drawing with its empty edge cut away, not the 192px face.
  expect([large.width, large.height]).toEqual([800, 600]);
  const saved = await picture(await ask(ana, 'shape=profile'));
  // The figure fills its box edge to edge: 700 wide, from 190 to 890.
  const { data } = await sharp(saved.png).extract({ left: 200, top: 468, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]]).toEqual([0xcc, 0x66, 0x00]);
  // An animal from before the large one was kept is saved from its small picture.
  await t.db.query('update campus_custom_picture set large=null where token=$1', [token]);
  expect((await ask(ana, 'shape=sticker')).status).toBe(200);
  await pickFace(t.db, ana.personId, PHOTO);
  const none = await ask(ana, 'shape=profile');
  expect(none.status).toBe(409);
  expect(await none.text()).toBe('Pick an animal as your picture to save it.');
});

it("gives a group's drawn picture to its members, with the group's name, and to nobody else", async () => {
  const owner = await person('owner@cornell.edu', 'Owen'), member = await person('member@cornell.edu', 'Mia'), stranger = await person('else@cornell.edu', 'Sam');
  const { group } = await startGroup(t.db, owner, { name: 'Extreme Cheapskates', slug: 'cheapskates', parent: null, links: [], people: [], note: '', files: [] });
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
  const of = `org=${group.orgId}&group=${group.loopId}`;
  // No drawing yet.
  expect((await ask(member, `shape=tall&${of}`)).status).toBe(409);
  const image = (await sharp({ create: { width: 900, height: 700, channels: 4, background: '#369' } }).png().toBuffer()).toString('base64');
  await t.db.query("insert into emba_group_picture(org_id,loop_id,made_by,ask,picks,image,small,kept_at) values($1,$2,$3,gen_random_uuid(),'[]',decode($4,'base64'),decode($4,'base64'),now())", [group.orgId, group.loopId, owner.personId, image]);
  const saved = await ask(member, `shape=tall&${of}`);
  expect(saved.status).toBe(200);
  const tall = await picture(saved);
  expect(tall.size).toEqual([1080, 1920]);
  const { data } = await sharp(tall.png).extract({ left: 540, top: 1010, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]]).toEqual([0x33, 0x66, 0x99]);
  expect((await ask(stranger, `shape=tall&${of}`)).status).toBe(404);
  expect((await ask(member, `shape=tall&org=${group.orgId}&group=${group.orgId}`)).status).toBe(404);
  expect((await ask(member, 'shape=tall&group=nonsense')).status).toBe(404);
});
