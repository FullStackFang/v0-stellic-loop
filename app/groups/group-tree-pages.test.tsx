import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { issueInvitation } from '@/lib/emba/invitations';
import { setMemberHandle } from '@/lib/emba/tags';
import { createInnerGroup, listGroupTree } from '@/lib/emba/group-tree';
import { groupHandle, treeOrder } from '@/lib/emba/group-path';
import type { GroupAddress } from '@/lib/emba/groups';
import TeamPage from './[namespace]/team/page';
import MembersPage from './[namespace]/page';
import InnerMembersPage from './[namespace]/in/[slug]/page';
import InnerTeamPage from './[namespace]/in/[slug]/team/page';
import ResourcesPage from './[namespace]/resources/page';
import { Rail } from './rail';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const at = vi.hoisted(() => ({ params: {} as Record<string, string>, path: '/groups' }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(), useParams: () => at.params, usePathname: () => at.path }));

// PREVIEW_DIR=… writes each state as a static page for screenshots.
const preview = (name: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..600&display=swap" rel="stylesheet"><link rel="stylesheet" href="loop.css"><style>.lp{--font-archivo:Archivo}</style></head><body><div class="lp"><aside class="lp-rail"></aside><main class="lp-main"><div class="lp-wrap">${document.body.firstElementChild!.innerHTML}</div></main></div></body></html>`);

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function join(group: GroupAddress, email: string, role: 'organizer' | 'member') {
  const p = await person(email);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [group.orgId, p.personId]);
  await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [group.orgId, group.loopId, p.personId, role]);
  return p;
}
/** EMBA 2027 holding Team 1 (holding NBAE 6830) and Team 2. */
async function tree() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const cohort = await createWorkspace(t.db, owner, { name: 'EMBA 2027', description: '', namespace: 'emba-2027' });
  const inner = (parent: GroupAddress, name: string, slug: string) => createInnerGroup(t.db, owner, { orgId: parent.orgId, parentLoopId: parent.loopId, name, description: '', slug });
  const team1 = await inner(cohort, 'Team 1', 'team-1'), course = await inner(team1, 'NBAE 6830', 'nbae-6830'), team2 = await inner(cohort, 'Team 2', 'team-2');
  return { owner, cohort, team1, course, team2, outer: await join(cohort, 'outer@example.test', 'member'), inner: await join(team1, 'inner@example.test', 'member') };
}
const team = async (p: Principal, slug?: string) => render(await withPortalTestSession(p, () => (slug ? InnerTeamPage : TeamPage)({ params: Promise.resolve({ namespace: 'emba-2027', ...(slug ? { slug } : {}) }), searchParams: Promise.resolve({}) })));
const crumbs = () => [...document.querySelectorAll('.lp-crumbs a, .lp-crumbs b')].map(node => node.textContent);

it('opens a group inside a group at its own address, under its own name, with crumbs that walk up', async () => {
  const f = await tree();
  await team(f.outer, 'nbae-6830');
  expect(screen.getByRole('heading', { level: 1, name: 'NBAE 6830' })).toBeInTheDocument();
  expect(screen.getByText('@emba-2027/nbae-6830')).toBeInTheDocument();
  preview('group-inner');
  expect(crumbs()).toEqual(['Groups', 'EMBA 2027', 'Team 1', 'NBAE 6830']);
  expect(screen.getByRole('link', { name: 'Team 1' })).toHaveAttribute('href', '/groups/emba-2027/in/team-1/team');
  expect(screen.getByRole('link', { name: 'EMBA 2027' })).toHaveAttribute('href', '/groups/emba-2027/team');
  // Its tabs stay inside it.
  expect(screen.getByRole('link', { name: /Events/ })).toHaveAttribute('href', expect.stringMatching(/^\/groups\/emba-2027\/in\/nbae-6830\/team\?tab=events/));
});

it('stops the crumbs at the highest group a person can open and never names the group above', async () => {
  const f = await tree();
  await team(f.inner, 'nbae-6830');
  expect(crumbs()).toEqual(['Groups', 'Team 1', 'NBAE 6830']);
  expect(document.body.textContent).not.toMatch(/EMBA 2027|Team 2/);
  cleanup();
  // The group above, and the one beside, are as absent as a group that does not exist.
  for (const slug of [undefined, 'team-2', 'no-such-group']) {
    await team(f.inner, slug);
    expect(screen.getByRole('heading', { name: 'Group unavailable' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/EMBA 2027|Team 2/);
    cleanup();
  }
  render(await withPortalTestSession(f.inner, () => ResourcesPage({ params: Promise.resolve({ namespace: 'emba-2027' }) })));
  expect(document.body.textContent).not.toMatch(/EMBA 2027/);
});

it('lists the groups inside a group, and offers to start one only to a person who may', async () => {
  const f = await tree();
  await team(f.owner);
  const inside = within(screen.getByRole('navigation', { name: 'Inside this group' }));
  preview('group-top');
  expect(inside.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/groups/emba-2027/in/team-1/team', '/groups/emba-2027/in/team-2/team', '/groups/new?in=%40emba-2027']);
  cleanup();
  await team(f.owner, 'team-1');
  expect(within(screen.getByRole('navigation', { name: 'Inside this group' })).getByRole('link', { name: /Start a group here/ })).toHaveAttribute('href', '/groups/new?in=%40emba-2027%2Fteam-1');
  cleanup();
  await team(f.outer, 'team-1');
  const member = within(screen.getByRole('navigation', { name: 'Inside this group' }));
  expect(member.getByRole('link', { name: /NBAE 6830/ })).toBeInTheDocument();
  expect(member.queryByRole('link', { name: /Start a group here/ })).toBeNull();
  cleanup();
  // Nothing inside and no right to start one: no list at all.
  await team(f.outer, 'nbae-6830');
  expect(screen.queryByRole('navigation', { name: 'Inside this group' })).toBeNull();
});

it('offers to leave on the top-level group only, where leaving ends the whole membership', async () => {
  const f = await tree();
  const members = async (slug?: string) => render(await withPortalTestSession(f.outer, () => (slug ? InnerMembersPage : MembersPage)({ params: Promise.resolve({ namespace: 'emba-2027', ...(slug ? { slug } : {}) }) })));
  await members();
  expect(screen.getByRole('button', { name: 'Leave group' })).toBeInTheDocument();
  cleanup();
  await members('team-1');
  expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
  expect(screen.getByText(/ask one of its owners or organizers to remove you/)).toBeInTheDocument();
});

it('shows an owner the roster beside the join link, the invitation form and who is waiting', async () => {
  const f = await tree();
  const add = async (name: string, role: string) => { const row = await makePerson(t.db, name); await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]); await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [f.cohort.orgId, row.id]); await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [f.cohort.orgId, f.cohort.loopId, row.id, role]); };
  await add('Elena Costa', 'organizer'); await add('Dev Malhotra', 'member');
  await setMemberHandle(t.db, f.outer, { orgId: f.cohort.orgId, handle: 'outer-tag' });
  await issueInvitation(t.db, f.owner, { orgId: f.cohort.orgId, loopId: f.cohort.loopId, recipientEmail: 'jordan.lee@example.test', role: 'member', expiresAt: '2099-01-01T00:00:00.000Z' });
  const members = async (p: Principal) => render(await withPortalTestSession(p, () => MembersPage({ params: Promise.resolve({ namespace: 'emba-2027' }) })));
  await members(f.owner);
  preview('members-owner');
  const roster = within(screen.getByRole('region', { name: /In the group/ }));
  // The owner, the outer member and the two added: the person in an inner group only is not on this list.
  expect(roster.getAllByRole('combobox', { name: /^Role of/ }).map(select => (select as HTMLSelectElement).value).sort()).toEqual(['member', 'member', 'organizer', 'owner']);
  expect(roster.getByText('@emba-2027/outer-tag')).toBeInTheDocument();
  expect(roster.getByLabelText('Your tag')).toHaveValue('');
  expect(roster.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
  expect(screen.getByText('4 people')).toBeInTheDocument();
  for (const name of ['Join link', 'Invite by email', /^Waiting/]) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('jordan.lee@example.test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  // One meaning per page: resources live on the Resources page.
  expect(screen.queryByRole('heading', { name: 'Resources' })).toBeNull();
  // Removing asks once more in place.
  fireEvent.click(roster.getAllByRole('button', { name: 'Remove' })[0]);
  expect(roster.getByRole('button', { name: 'Confirm: remove' })).toBeInTheDocument();
  cleanup();
  // A member sees their own row and none of the panel.
  await members(f.outer);
  expect(screen.getAllByLabelText('Your tag')).toHaveLength(1);
  expect(screen.queryByRole('combobox')).toBeNull();
  for (const name of ['Join link', 'Invite by email']) expect(screen.queryByRole('heading', { name })).toBeNull();
  expect(screen.queryByText('Elena Costa')).toBeNull();
});

it('gives a long roster a find box and a filter by role, inside one frame', async () => {
  const f = await tree();
  const first = ['Aisha', 'Ben', 'Carla', 'Diego', 'Emi', 'Farid', 'Grace', 'Hugo'], last = ['Adeyemi', 'Brooks', 'Chen', 'Dubois', 'Eriksen'];
  for (let n = 0; n < 40; n++) { const row = await makePerson(t.db, `${first[n % 8]} ${last[Math.floor(n / 8)]}`); await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]); await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [f.cohort.orgId, row.id]); await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [f.cohort.orgId, f.cohort.loopId, row.id, n % 9 === 0 ? 'organizer' : 'member']); }
  render(await withPortalTestSession(f.owner, () => MembersPage({ params: Promise.resolve({ namespace: 'emba-2027' }) })));
  preview('members-many');
  const rows = () => within(screen.getByLabelText('People in the group')).queryAllByRole('combobox');
  expect(rows()).toHaveLength(42);
  expect(screen.getByRole('button', { name: /^Organizers/ })).toHaveTextContent('Organizers5');
  fireEvent.click(screen.getByRole('button', { name: /^Organizers/ }));
  expect(rows()).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: /^Everyone/ }));
  fireEvent.change(screen.getByLabelText('Find a person'), { target: { value: 'aisha' } });
  expect(rows()).toHaveLength(5);
  fireEvent.change(screen.getByLabelText('Find a person'), { target: { value: 'nobody-here' } });
  expect(screen.getByText(/Nobody matches/)).toBeInTheDocument();
});

it('draws the rail as the tree a person can open', async () => {
  const f = await tree();
  const rail = async (p: Principal) => treeOrder(await listGroupTree(t.db, p)).map(group => ({ namespace: group.namespace, slug: group.slug, name: group.orgName, handle: groupHandle(group), depth: group.depth }));
  expect((await rail(f.outer)).map(group => `${group.depth} ${group.name}`)).toEqual(['0 EMBA 2027', '1 Team 1', '2 NBAE 6830', '1 Team 2']);
  const mine = await rail(f.inner);
  expect(mine.map(group => `${group.depth} ${group.name} ${group.handle}`)).toEqual(['0 Team 1 @emba-2027/team-1', '1 NBAE 6830 @emba-2027/nbae-6830']);
  at.params = { namespace: 'emba-2027', slug: 'nbae-6830' }; at.path = '/groups/emba-2027/in/nbae-6830/team';
  render(<Rail groups={mine} account={null} />);
  expect(document.querySelector('.lp-switch-name')).toHaveTextContent('NBAE 6830');
  expect(screen.getByRole('link', { name: 'Record' })).toHaveAttribute('href', '/groups/emba-2027/in/nbae-6830/team');
  expect(screen.getByRole('link', { name: 'Record' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Resources' })).toHaveAttribute('href', '/groups/emba-2027/in/nbae-6830/resources');
  expect(screen.getByRole('link', { name: /Team 1/ })).toHaveAttribute('href', '/groups/emba-2027/in/team-1/team');
});
