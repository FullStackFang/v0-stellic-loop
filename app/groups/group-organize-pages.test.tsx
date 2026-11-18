import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { counting } from '@/test/team-seed';
import { setDb } from '@/lib/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { grantLease } from '@/lib/emba/consent';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { createInnerGroup } from '@/lib/emba/group-tree';
import type { GroupAddress } from '@/lib/emba/groups';
import GroupsPage from './page';
import ConnectionsPage from './connections/page';
import { archiveGroupAction, renameGroupAction, restoreGroupAction } from './organize-actions';

// Specs: openspec/changes/loop-organize-and-fix/specs/group-organizing and team-wide-grants.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const at = vi.hoisted(() => ({ params: {} as Record<string, string>, path: '/groups' }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(), useParams: () => at.params, usePathname: () => at.path, useSearchParams: () => new URLSearchParams() }));

// PREVIEW_DIR=… writes each state as a static page for screenshots.
const preview = (name: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..600&display=swap" rel="stylesheet"><link rel="stylesheet" href="loop.css"><style>.lp{--font-archivo:Archivo}</style></head><body><div class="lp"><aside class="lp-rail"></aside><main class="lp-main"><div class="lp-wrap">${document.body.firstElementChild!.innerHTML}</div></main></div></body></html>`);

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const idle = { status: 'idle' as const, message: '' };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
const scopeOf = (group: GroupAddress) => ({ orgId: group.orgId, loopId: group.loopId });

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
/** EMBA 2027 holding Team 1 (holding NBAE 6830) and Team 2. A member of the whole, and an organizer of Team 1. */
async function tree() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const cohort = await createWorkspace(t.db, owner, { name: 'EMBA 2027', description: '', namespace: 'emba-2027' });
  const inner = (parent: GroupAddress, name: string, slug: string) => createInnerGroup(t.db, owner, { orgId: parent.orgId, parentLoopId: parent.loopId, name, description: '', slug });
  const team1 = await inner(cohort, 'Team 1', 'team-1'), course = await inner(team1, 'NBAE 6830', 'nbae-6830'), team2 = await inner(cohort, 'Team 2', 'team-2');
  return { owner, cohort, team1, course, team2, member: await join(cohort, 'member@example.test', 'member'), lead: await join(team1, 'lead@example.test', 'organizer') };
}
const groupsPage = async (p: Principal) => render(await withPortalTestSession(p, () => GroupsPage()));
const act = (p: Principal, run: () => Promise<{ status: string; message: string }>) => withPortalTestSession(p, run);
const listed = () => [...document.querySelectorAll('.lp-groupitem .lp-grouprow b')].map(node => node.textContent);

it('gives the people who run a group a menu on its row, and a member none, with one more read for the archived list', async () => {
  const f = await tree();
  await groupsPage(f.owner);
  expect(listed()).toEqual(['EMBA 2027', 'Team 1', 'NBAE 6830', 'Team 2']);
  for (const name of ['EMBA 2027', 'Team 1', 'NBAE 6830', 'Team 2']) expect(screen.getByLabelText(`Manage ${name}`)).toBeInTheDocument();
  // The confirmation names what goes with the group.
  const team1 = screen.getByLabelText('Manage Team 1').closest('li') as HTMLElement;
  expect(team1.querySelector('.lp-rowmenu-archive')!.textContent).toMatch(/This hides Team 1 and the group inside it \(NBAE 6830\) from everyone, and ends assistant access given on them\. Nothing is deleted\./);
  expect(within(team1).getByRole('button', { name: 'Archive Team 1' })).toBeInTheDocument();
  expect(within(team1).getByLabelText('Name')).toHaveValue('Team 1');
  preview('groups-owner');
  cleanup();
  // An organizer of Team 1 runs it and what is inside it, and nothing above or beside.
  await groupsPage(f.lead);
  expect(listed()).toEqual(['Team 1', 'NBAE 6830']);
  expect(screen.getByRole('button', { name: 'Archive NBAE 6830' })).toBeInTheDocument();
  cleanup();
  // A member sees the tree, can fold it, and is offered nothing else.
  await groupsPage(f.member);
  expect(listed()).toEqual(['EMBA 2027', 'Team 1', 'NBAE 6830', 'Team 2']);
  expect(screen.queryByText('Manage')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Archive|^Rename|^Restore/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide the groups inside Team 1' })).toBeInTheDocument();
  cleanup();
  // The archived list is one statement, and is not read at all for a member.
  const c = counting(t.db);
  setDb(c.db);
  try {
    const member = await c.of(async () => { await withPortalTestSession(f.member, () => GroupsPage()); });
    const owner = await c.of(async () => { await withPortalTestSession(f.owner, () => GroupsPage()); });
    expect(owner).toBe(member + 1);
  } finally { setDb(t.db); }
});

it('folds a group shut, keeps it shut on the next visit, and shows nothing open first', async () => {
  const f = await tree();
  await groupsPage(f.member);
  fireEvent.click(screen.getByRole('button', { name: 'Hide the groups inside EMBA 2027' }));
  expect(listed()).toEqual(['EMBA 2027']);
  expect(screen.getByText(/3 inside/)).toBeInTheDocument();
  expect(localStorage.getItem('loop.groups.closed')).toBe(f.cohort.loopId);
  preview('groups-folded');
  cleanup();
  // The next visit starts folded.
  await groupsPage(f.member);
  expect(listed()).toEqual(['EMBA 2027']);
  fireEvent.click(screen.getByRole('button', { name: 'Show the groups inside EMBA 2027' }));
  expect(listed()).toEqual(['EMBA 2027', 'Team 1', 'NBAE 6830', 'Team 2']);
  expect(localStorage.getItem('loop.groups.closed')).toBe('');
  cleanup();
  // Before the browser's copy is read (the server's render), inner rows hold their place unseen and top-level rows show.
  const { renderToString } = await import('react-dom/server');
  const html = renderToString(await withPortalTestSession(f.member, () => GroupsPage()));
  expect(html.match(/<li class="lp-groupitem"[^>]*>/g)!.map(tag => tag.includes('data-wait'))).toEqual([false, true, true, true]);
});

it('renames, archives and restores from the page, and refuses in plain words', async () => {
  const f = await tree();
  expect(await act(f.lead, () => renameGroupAction(idle, form({ ...scopeOf(f.team1), name: ' Team One ' })))).toEqual({ status: 'success', message: 'Renamed to Team One. Its tag @emba-2027/team-1 stays.' });
  expect(await act(f.member, () => renameGroupAction(idle, form({ ...scopeOf(f.team1), name: 'Mine' })))).toMatchObject({ status: 'error', message: expect.stringMatching(/^Only the people who run this group can do that\./) });
  expect(await act(f.lead, () => renameGroupAction(idle, form({ ...scopeOf(f.team1), name: '' })))).toEqual({ status: 'error', message: 'A name is 1 to 200 characters on one line.' });
  // An organizer of Team 1 cannot archive the group above it; the owner can archive Team 1 with what is inside.
  expect((await act(f.lead, () => archiveGroupAction(idle, form(scopeOf(f.cohort))))).status).toBe('error');
  expect(await act(f.lead, () => archiveGroupAction(idle, form(scopeOf(f.team1))))).toEqual({ status: 'success', message: 'Archived Team One and the 1 group inside it. Restore it from the Archived list below.' });
  expect((await act(f.lead, () => archiveGroupAction(idle, form(scopeOf(f.team1))))).message).toBe('That already happened, or the group is gone. Reload the page.');
  await groupsPage(f.owner);
  expect(listed()).toEqual(['EMBA 2027', 'Team 2']);
  const archived = within(screen.getByRole('heading', { name: /^Archived/ }).closest('section') as HTMLElement);
  expect(archived.getByText('Team One')).toBeInTheDocument();
  expect(archived.getByText(/^Archived [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · with 1 group inside$/)).toBeInTheDocument();
  expect(archived.getAllByRole('button', { name: 'Restore' })).toHaveLength(1);
  preview('groups-archived');
  cleanup();
  // A member is shown no archived group and cannot restore one.
  await groupsPage(f.member);
  expect(screen.queryByRole('heading', { name: /^Archived/ })).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Team One/);
  expect((await act(f.member, () => restoreGroupAction(idle, form(scopeOf(f.team1))))).status).toBe('error');
  cleanup();
  // The inner group cannot come back while the group it sits in is archived.
  expect((await act(f.owner, () => restoreGroupAction(idle, form(scopeOf(f.course))))).message).toBe('This group sits inside an archived group. Restore that one first.');
  expect(await act(f.lead, () => restoreGroupAction(idle, form(scopeOf(f.team1))))).toEqual({ status: 'success', message: 'Restored Team One and the 1 group inside it. Assistant access that ended has to be given again.' });
  await groupsPage(f.owner);
  expect(listed()).toEqual(['EMBA 2027', 'Team 2', 'Team One', 'NBAE 6830']);
  expect(screen.queryByRole('heading', { name: /^Archived/ })).not.toBeInTheDocument();
});

it('says on the Assistants page that a grant covers the groups inside, and lists them on the grant', async () => {
  const f = await tree();
  for (const [name, value] of Object.entries({ LOOP_AUTH_CLIENT_IDS: 'claude-test', LOOP_AUTH_AUDIENCE: 'https://loop.example/api/mcp', LOOP_AUTH_JWKS_URL: 'https://issuer.example/jwks', LOOP_AUTH_PROVIDER: 'clerk', CLERK_SECRET_KEY: 'sk_test_x', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_bG9vcC5leGFtcGxlLmNvbSQ=', LOOP_AUTH_ISSUER: 'https://loop.example.com' })) vi.stubEnv(name, value);
  await grantLease(t.db, f.lead, { ...scopeOf(f.team1), clientId: 'claude-test', actions: ['plan:read', 'group-memory:write'], expiresAt: '2099-01-01T00:00:00Z' });
  await grantLease(t.db, f.member, { ...scopeOf(f.team2), clientId: 'claude-test', actions: ['plan:read'], expiresAt: '2099-01-01T00:00:00Z' });
  render(await withPortalTestSession(f.lead, () => ConnectionsPage()));
  expect(within(document.querySelector('.lp-grant') as HTMLElement).getByText('Covers NBAE 6830')).toBeInTheDocument();
  expect(screen.getByText('Access to a team covers every group inside it, including ones added later.')).toBeInTheDocument();
  expect(screen.getByText('In a team you run: start, rename and archive groups inside it')).toBeInTheDocument();
  expect(screen.getByText('In a team you run: invite people by email, as members')).toBeInTheDocument();
  preview('assistants-covers');
  cleanup();
  // A grant on a group with nothing inside lists nothing, and a member is not told about organizing.
  render(await withPortalTestSession(f.member, () => ConnectionsPage()));
  expect(document.querySelector('.lp-grant')!.textContent).not.toMatch(/Covers/);
  expect(screen.queryByText(/In a team you run/)).not.toBeInTheDocument();
});
