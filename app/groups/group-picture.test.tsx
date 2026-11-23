import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { groupPictures } from '@/lib/emba/group-picture';
import { startGroup } from '@/lib/emba/group-start';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createInnerGroup } from '@/lib/emba/group-tree';
import { askGroupPicture, keepGroupPicture } from '@/lib/emba/group-picture';
import { joinedWords, joinPlan as givePlan, type JoinPlace } from '@/lib/campus/ink';
import GroupsPage from './page';
import MembersPage from './[namespace]/page';
import TeamPage from './[namespace]/team/page';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(), useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({}), usePathname: () => '/groups', useSearchParams: () => new URLSearchParams() }));
// The image model: a small figure, and a note of what it was asked.
const model = vi.hoisted(() => ({ asked: [] as string[], drawn: null as Uint8Array | null }));
vi.mock('ai', async original => ({ ...(await original<typeof import('ai')>()), generateImage: vi.fn(async ({ prompt }: { prompt: { text: string } }) => { model.asked.push(prompt.text); return { image: { uint8Array: model.drawn! } }; }) }));
// A press in the page calls its action outside the page's own session, so each action is run as the person looking.
const looking = vi.hoisted(() => ({ who: null as unknown }));
vi.mock('./picture-actions', async original => {
  const real = await original<typeof import('./picture-actions')>(), { withPortalTestSession: as } = await import('@/lib/emba/portal-session');
  const wrap = <A extends unknown[], R>(run: (...args: A) => R) => (...args: A) => as(looking.who as Principal, () => run(...args));
  return { drawGroupPictureAction: wrap(real.drawGroupPictureAction), keepGroupPictureAction: wrap(real.keepGroupPictureAction) };
});

// PREVIEW_DIR=… writes each state as a static page for screenshots, with the app's own style sheets and the pictures of a running dev server.
const sheet = (file: string) => `<link rel="stylesheet" href="${pathToFileURL(file).href}">`;
const preview = (name: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html data-kit="cornell"><head><meta charset="utf-8"><base href="http://localhost:3000/"><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">${['app/loop.css', 'app/c/campus.css', 'app/groups/campus-look.css', 'app/groups/group-picture.css'].map(sheet).join('')}<style>body{margin:0}.cs,.lp{--font-archivo:Archivo}</style></head><body><div class="cs gb"><div class="lp"><main class="lp-main"><div class="lp-wrap">${document.body.firstElementChild!.innerHTML}</div></main></div></div><script>const c=document.querySelector('.gp-card');if(c){const r=c.parentElement.getBoundingClientRect();c.style.left=r.left+'px';c.style.top=(r.bottom+14)+'px';c.setAttribute('popover','manual');c.showPopover()}</script></body></html>`);

let t: TestDb;
beforeAll(async () => {
  t = await openTestDb();
  model.drawn = await sharp({ create: { width: 200, height: 200, channels: 4, background: '#c60' } }).png().toBuffer();
});
afterAll(async () => { await t?.close(); });
// The save pane asks the server for its grounds (app/c/save/route.test.ts): here nothing answers.
beforeEach(async () => { await t.reset(); model.asked.length = 0; vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => [], text: async () => '' }))); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function cheapskates() {
  const owner = await person('owner@example.test'), member = await person('member@example.test');
  const { group } = await startGroup(t.db, owner, { name: 'Extreme Cheapskates', slug: 'cheapskates', parent: null, links: [], people: [], note: '', files: [] });
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
  return { owner, member, group };
}
const members = async (p: Principal) => { looking.who = p; return render(await withPortalTestSession(p, () => MembersPage({ params: Promise.resolve({ namespace: 'cheapskates' }) }))); };
const tileButton = () => screen.queryByRole('button', { name: /^Group picture of Extreme Cheapskates/ });

it('draws a group picture from the tile: pick, the Ink+ plate, two drawings, keep one, and every member then sees it', async () => {
  const { owner, member, group } = await cheapskates();
  // A member has the rings and nothing to press.
  await members(member);
  expect(tileButton()).toBeNull();
  expect(document.querySelector('.gt-tile img')).toBeNull();
  cleanup();

  await members(owner);
  fireEvent.click(tileButton()!);
  const card = within(screen.getByRole('dialog', { name: 'Group picture' }));
  // The card opens on the group's pictures: none yet, and the tile that draws one.
  expect(card.getByText(/No picture yet/)).toBeInTheDocument();
  preview('picture-none');
  fireEvent.click(card.getByRole('button', { name: /Draw one/ }));
  // Fewer than two draws nothing.
  const go = card.getByRole('button', { name: /Draw us together/ });
  expect(go).toBeDisabled();
  fireEvent.click(card.getByRole('button', { name: 'Animal 5' }));
  fireEvent.click(card.getByRole('button', { name: 'Animal 12' }));
  expect(card.getByText('2 of 6')).toBeInTheDocument();
  preview('picture-pick');
  expect(card.getByRole('button', { name: 'Animal 5' })).toHaveAttribute('aria-pressed', 'true');

  // No Ink+ yet: the plate first, and the one Get button: one press, the account's email, no box to type it in
  // (app/c/ink/join, which the browser calls; here it signs the person looking up).
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => { const { plan, place } = JSON.parse(String(init.body)) as { plan: 'ink' | 'plus'; place: JoinPlace }; await givePlan(t.db, owner.personId, 'owner@example.test', plan, place); return new Response(JSON.stringify({ ok: true, said: joinedWords(plan, 'owner@example.test') })); }));
  fireEvent.click(go);
  expect(card.getByText('$9.99')).toBeInTheDocument();
  expect(card.queryByRole('textbox', { name: 'Email' })).toBeNull();
  preview('picture-plate');
  expect(model.asked).toEqual([]);
  fireEvent.click(card.getByRole('button', { name: 'Get Ink+ · $9.99' }));

  // Signing up draws nothing: the card asks first, with a line of the person's own and how long it may be.
  expect(await card.findByText('Draw these 2 together?')).toBeInTheDocument();
  expect(card.getByText(/Thanks for your interest\. This isn’t ready yet, so we’ve upgraded you to Ink\+ for now\./)).toBeInTheDocument();
  expect(model.asked).toEqual([]);
  fireEvent.change(card.getByRole('textbox', { name: 'Anything to add' }), { target: { value: 'party hats' } });
  expect(card.getByText(/10 of 60 letters/)).toBeInTheDocument();
  expect(card.getByText(/3 more times/)).toBeInTheDocument();
  preview('picture-sure');
  fireEvent.click(card.getByRole('button', { name: 'Yes, draw us' }));

  expect(await card.findByText('Pick your favorite.', undefined, { timeout: 20000 })).toBeInTheDocument();
  expect(model.asked[0]).toContain('The group also asks: party hats.');
  expect(card.getAllByRole('img', { name: /^Drawing/ })).toHaveLength(2);
  preview('picture-two');
  expect(model.asked).toHaveLength(2);
  expect((await t.db.query('select plan,place from campus_subscribe_ask')).rows).toEqual([{ plan: 'ink_plus', place: 'group picture: Get Ink+' }]);
  vi.unstubAllGlobals();
  expect(await groupPictures(t.db, [group.loopId])).toEqual(new Map());

  // The person's own line goes to the next drawing.
  fireEvent.click(card.getByRole('button', { name: 'Draw again' }));
  expect(model.asked).toHaveLength(2);
  expect(card.getByText(/2 more times/)).toBeInTheDocument();
  fireEvent.change(card.getByRole('textbox', { name: 'Anything to add' }), { target: { value: 'matching scarves' } });
  fireEvent.click(card.getByRole('button', { name: 'Yes, draw us' }));
  await vi.waitFor(() => expect(model.asked).toHaveLength(4), { timeout: 20000 });
  expect(model.asked[3]).toContain('The group also asks: matching scarves.');
  await card.findByText('Pick your favorite.');

  fireEvent.click(card.getAllByRole('button', { name: 'Keep this one' })[0]);
  expect(await card.findByText('Say hi to your group.')).toBeInTheDocument();
  expect(card.getByRole('button', { name: 'Kept' })).toBeDisabled();
  // The tile wears it at once, without waiting for the page to be read again.
  expect(tileButton()!.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/animals/group/'));
  // Every drawing of the group stays to choose from: the four made so far, and an earlier one can be worn instead.
  fireEvent.click(card.getByRole('button', { name: 'Pick other animals' }));
  fireEvent.click(card.getByRole('button', { name: 'Back to pictures' }));
  expect(card.getByText('Group pictures')).toBeInTheDocument();
  expect(card.getAllByRole('button', { name: /^Drawing/ })).toHaveLength(4);
  expect(card.getAllByRole('button', { name: /^Drawing/, pressed: true })).toHaveLength(1);
  expect(card.getByRole('button', { name: /Draw a new one/ })).toBeInTheDocument();
  preview('picture-drawn');
  const first = (await groupPictures(t.db, [group.loopId])).get(group.loopId)!;
  fireEvent.click(card.getAllByRole('button', { name: /^Drawing/, pressed: false })[2]);
  await vi.waitFor(async () => expect((await groupPictures(t.db, [group.loopId])).get(group.loopId)).not.toBe(first));
  const kept = (await groupPictures(t.db, [group.loopId])).get(group.loopId)!;
  await vi.waitFor(() => expect(tileButton()!.querySelector('img')).toHaveAttribute('src', `/animals/group/${kept}`));
  // The picture the group wears can be saved out of the app (openspec loop-save-picture): the pane is the account card's, for this group.
  const saved = `/c/save?shape=profile&ground=school&org=${group.orgId}&group=${group.loopId}&small=1`;
  fireEvent.click(card.getByRole('button', { name: 'Save the picture' }));
  expect(card.getByRole('img', { name: 'The picture as a profile' })).toHaveAttribute('src', saved);
  fireEvent.click(card.getByRole('button', { name: 'Done' }));
  expect(card.getByText('Group pictures')).toBeInTheDocument();
  cleanup();

  // The member sees the picture, on the members page and on the team page. They have nothing to draw: pressing it saves it.
  await members(member);
  expect(document.querySelector('.gt-tile img')).toHaveAttribute('src', `/animals/group/${kept}`);
  expect(tileButton()).toHaveAccessibleName('Group picture of Extreme Cheapskates. Save it');
  fireEvent.click(tileButton()!);
  const theirs = within(screen.getByRole('dialog', { name: 'Group picture' }));
  expect(theirs.getByRole('img', { name: 'The picture as a profile' })).toHaveAttribute('src', saved);
  expect(theirs.queryByText('Group pictures')).toBeNull();
  fireEvent.click(theirs.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  cleanup();
  render(await withPortalTestSession(member, () => TeamPage({ params: Promise.resolve({ namespace: 'cheapskates' }), searchParams: Promise.resolve({}) })));
  expect(document.querySelector('.gt-tile img')).toHaveAttribute('src', `/animals/group/${kept}`);
}, 60000);

it('shows a group its picture wherever its rings were: the groups list, and the groups inside a group', async () => {
  const { owner, member, group } = await cheapskates();
  vi.stubEnv('LOOP_ADMIN', 'owner@example.test');
  const inner = await createInnerGroup(t.db, owner, { orgId: group.orgId, parentLoopId: group.loopId, name: 'Coupon Club', description: '', slug: 'coupons' });
  const drawn = async (at: { orgId: string; loopId: string }) => { const { tokens } = await askGroupPicture(t.db, owner, at, [{ face: 1 }, { face: 2 }]); await keepGroupPicture(t.db, owner, at, tokens[0]); return tokens[0]; };
  const outerPicture = await drawn(group), innerPicture = await drawn(inner);
  render(await withPortalTestSession(member, () => GroupsPage()));
  expect(screen.getByRole('link', { name: /Extreme Cheapskates/ }).querySelector('.lp-grouptile img')).toHaveAttribute('src', `/animals/group/${outerPicture}`);
  expect(screen.getByRole('link', { name: /Coupon Club/ }).querySelector('.lp-grouptile img')).toHaveAttribute('src', `/animals/group/${innerPicture}`);
  cleanup();
  render(await withPortalTestSession(member, () => TeamPage({ params: Promise.resolve({ namespace: 'cheapskates' }), searchParams: Promise.resolve({}) })));
  expect(within(screen.getByRole('navigation', { name: 'Inside this group' })).getByRole('link', { name: /Coupon Club/ }).querySelector('img')).toHaveAttribute('src', `/animals/group/${innerPicture}`);
}, 60000);

it('stops at six, and closes on Done', async () => {
  const { owner } = await cheapskates();
  await members(owner);
  fireEvent.click(tileButton()!);
  const card = within(screen.getByRole('dialog', { name: 'Group picture' }));
  fireEvent.click(card.getByRole('button', { name: /Draw one/ }));
  for (const n of [1, 2, 3, 4, 5, 6, 7]) fireEvent.click(card.getByRole('button', { name: `Animal ${n}` }));
  expect(card.getByText('6 of 6')).toBeInTheDocument();
  expect(card.getByRole('alert')).toHaveTextContent('6 is the most for now.');
  expect(card.getByRole('button', { name: 'Animal 7' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(card.getByRole('button', { name: 'Back to pictures' }));
  fireEvent.click(card.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog', { name: 'Group picture' })).toBeNull();
});
