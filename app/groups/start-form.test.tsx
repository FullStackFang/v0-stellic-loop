import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { createInnerGroup } from '@/lib/emba/group-tree';
import NewGroupPage from './new/page';
import { StartForm, type StartNode } from './new/start-form';
import { startGroupAction, type StartState } from './start-actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The form posts through the real action; the test stands in for the signed-in session a browser would carry.
const session = vi.hoisted(() => ({ run: null as null | (<T>(work: () => T) => T), sent: [] as FormData[] }));
vi.mock('./start-actions', async original => {
  const real = await original<typeof import('./start-actions')>();
  return { ...real, startGroupAction: (previous: StartState, data: FormData) => { session.sent.push(data); return session.run!(() => real.startGroupAction(previous, data)); } };
});

// PREVIEW_DIR=… writes each state as a static page for screenshots.
const preview = (name: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..600&display=swap" rel="stylesheet"><link rel="stylesheet" href="loop.css"><style>.lp{--font-archivo:Archivo}</style></head><body><div class="lp"><aside class="lp-rail"></aside><main class="lp-main"><div class="lp-wrap">${document.body.firstElementChild!.innerHTML}</div></main></div></body></html>`);

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); session.sent = []; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function tree() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const cohort = await createWorkspace(t.db, owner, { name: 'EMBA 2027', description: '', namespace: 'emba-2027' });
  const team1 = await createInnerGroup(t.db, owner, { orgId: cohort.orgId, parentLoopId: cohort.loopId, name: 'Team 1', description: '', slug: 'team-1' });
  const member = await person('member@example.test');
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [cohort.orgId, member.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [cohort.orgId, cohort.loopId, member.personId]);
  return { owner, member, cohort, team1 };
}
const page = async (p: Principal, at?: string) => { session.run = work => withPortalTestSession(p, work); return render(await withPortalTestSession(p, () => NewGroupPage({ searchParams: Promise.resolve(at ? { in: at } : {}) }))); };
const box = () => screen.getByLabelText('Add anything');
const enter = (text: string) => { fireEvent.change(box(), { target: { value: text } }); fireEvent.keyDown(box(), { key: 'Enter' }); };
const lane = (title: string) => within(screen.getByRole('heading', { level: 3, name: new RegExp(`^${title}`) }).parentElement!);

it('names a group, suggests its handle, and shows the handle it will really get where it lives', async () => {
  const f = await tree();
  await page(f.owner);
  const create = screen.getByRole('button', { name: 'Create group' });
  expect(create).toBeDisabled();
  expect(screen.getByRole('button', { name: /Inside/ })).toHaveTextContent('Top level, on its own');
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'NBAE 6830 Venture' } });
  expect(screen.getByLabelText('Handle')).toHaveValue('nbae-6830-venture');
  expect(screen.getByLabelText('Handle').parentElement).toHaveTextContent('@');
  expect(create).toBeEnabled();
  // The picker: a column per level; the footer says where it goes and who can open it before anything is chosen.
  fireEvent.click(screen.getByRole('button', { name: /Inside/ }));
  const picker = within(screen.getByRole('dialog', { name: 'Where the group lives' }));
  expect(picker.getByText(/Only people you invite can open it/)).toBeInTheDocument();
  fireEvent.click(picker.getByRole('button', { name: /EMBA 2027/ }));
  fireEvent.click(picker.getByRole('button', { name: /Team 1/ }));
  expect(picker.getByText(/Everyone in Team 1 can open it/)).toBeInTheDocument();
  expect(picker.getByText('Nothing inside yet. The new group would be the first.')).toBeInTheDocument();
  // Escape closes without changing the choice.
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: /Inside/ })).toHaveTextContent('Top level, on its own');
  fireEvent.click(screen.getByRole('button', { name: /Inside/ }));
  fireEvent.click(screen.getByRole('button', { name: /EMBA 2027/ }));
  fireEvent.click(screen.getByRole('button', { name: /Team 1/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Put it here' }));
  expect(screen.getByRole('button', { name: /Inside/ })).toHaveTextContent('EMBA 2027 › Team 1');
  expect(screen.getByLabelText('Handle').parentElement).toHaveTextContent('@emba-2027/');
});

it('sorts what is put in the one box into lanes, and lets each thing be taken out', async () => {
  const f = await tree();
  await page(f.owner);
  enter('https://example.edu/syllabus priya@example.edu');
  expect(lane('Links').getByText('example.edu/syllabus')).toBeInTheDocument();
  expect(lane('People').getByText('priya@example.edu')).toBeInTheDocument();
  expect(box()).toHaveValue('');
  // A Drive folder is a link like any other: there is no Drive lane.
  expect(screen.queryByRole('heading', { name: /Drive folder/ })).toBeNull();
  enter('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  expect(lane('Links').getByText(/drive\.google\.com/)).toBeInTheDocument();
  enter('Kickoff is Thursday at 6');
  expect(screen.getByLabelText('First announcement')).toHaveValue('Kickoff is Thursday at 6');
  enter('http://');
  expect(lane('Links').getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('status')).toHaveTextContent('Nothing there Loop can keep');
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['Week 1'], 'reading.txt'), new File(['x'], 'photo.png'), new File([new Uint8Array(4 * 1024 * 1024)], 'huge.pdf')] } });
  expect(lane('Files').getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('photo.png: Loop reads .txt, .md and text PDFs.');
  expect(screen.getByRole('status')).toHaveTextContent('huge.pdf is too much to send with this form. Add it on the group’s Resources page'.replace('’', "'"));
  preview('start-lanes');
  fireEvent.click(screen.getByRole('button', { name: 'Remove priya@example.edu' }));
  expect(lane('People').queryByRole('listitem')).toBeNull();
});

it('creates the group with what the lanes hold and lands on the ready page, join link shown once', async () => {
  const f = await tree();
  await page(f.owner, '@emba-2027/team-1');
  expect(screen.getByRole('button', { name: /Inside/ })).toHaveTextContent('EMBA 2027 › Team 1');
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'NBAE 6830' } });
  enter('https://example.edu/syllabus priya@example.edu');
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['Week 1: chapter 2'], 'reading.txt'), new File(['oops'], 'broken.pdf')] } });
  // Text still in the box is sorted on the way out.
  fireEvent.change(box(), { target: { value: 'Welcome to the course group.' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create group' })); });
  expect(await screen.findByRole('heading', { level: 1, name: 'NBAE 6830' })).toBeInTheDocument();
  expect(session.sent[0].get('parent')).toBe('@emba-2027/team-1');
  expect(screen.getByText('@emba-2027/nbae-6830')).toBeInTheDocument();
  expect(screen.getByText('Inside EMBA 2027 › Team 1')).toBeInTheDocument();
  expect((screen.getByLabelText('Join link') as HTMLInputElement).value).toMatch(/^http:\/\/localhost(:\d+)?\/groups\/request#token=[A-Za-z0-9_-]{22}$/);
  expect(screen.getByRole('link', { name: 'Open the group' })).toHaveAttribute('href', '/groups/emba-2027/in/nbae-6830/team');
  expect(screen.getByRole('link', { name: 'Connect an assistant' })).toHaveAttribute('href', '/groups/connections');
  preview('start-ready');
  expect(screen.getByText('Welcome to the course group.')).toBeInTheDocument();
  expect(screen.getByText('reading.txt')).toBeInTheDocument();
  expect(screen.getByText(/priya@example.edu/)).toBeInTheDocument();
  expect(within(screen.getByRole('alert')).getByText('broken.pdf')).toBeInTheDocument();
  expect((await t.db.query("select path from emba_loop where path like '%nbae-6830'")).rows).toEqual([{ path: 'emba-2027/team-1/nbae-6830' }]);
});

it('keeps everything the person entered when the handle is taken', async () => {
  const f = await tree();
  await page(f.owner);
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'EMBA 2027' } });
  enter('priya@example.edu');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create group' })); });
  expect(await screen.findByRole('alert')).toHaveTextContent('That handle is taken');
  expect(screen.getByLabelText('Group name')).toHaveValue('EMBA 2027');
  expect(lane('People').getByText('priya@example.edu')).toBeInTheDocument();
  expect((await t.db.query('select count(*)::int as n from emba_invitation')).rows).toEqual([{ n: 0 }]);
});

it('offers a member nothing to start, and never offers a place they may not use', async () => {
  const f = await tree();
  await page(f.member);
  expect(screen.queryByRole('button', { name: 'Create group' })).toBeNull();
  expect(screen.getByText(/Ask an organizer of your group/)).toBeInTheDocument();
  cleanup();
  // An organizer of Team 1 only: no top level, and the group above is not in their picker at all.
  const lead = await person('lead@example.test');
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [f.team1.orgId, lead.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'organizer')", [f.team1.orgId, f.team1.loopId, lead.personId]);
  await page(lead);
  expect(screen.getByRole('button', { name: /Inside/ })).toHaveTextContent('Team 1');
  fireEvent.click(screen.getByRole('button', { name: /Inside/ }));
  const picker = within(screen.getByRole('dialog'));
  expect(picker.queryByText('Top level, on its own')).toBeNull();
  expect(picker.queryByText('EMBA 2027')).toBeNull();
  // The server decides, whatever a form says.
  const data = new FormData(); data.set('name', 'Sneaky'); data.set('slug', 'sneaky'); data.set('parent', '@emba-2027');
  expect(await withPortalTestSession(lead, () => startGroupAction({ status: 'idle' }, data))).toMatchObject({ status: 'error', message: expect.stringContaining('cannot start a group there') });
  data.set('parent', '');
  expect(await withPortalTestSession(lead, () => startGroupAction({ status: 'idle' }, data))).toMatchObject({ status: 'error' });
});

it('shows a member of a group, in the picker, that only its organizers can start one there', () => {
  const nodes: StartNode[] = [{ id: 'a', parent: null, name: 'Mine', handle: '@mine', namespace: 'mine', canStart: true }, { id: 'b', parent: null, name: 'Theirs', handle: '@theirs', namespace: 'theirs', canStart: false }];
  render(<StartForm tree={nodes} canTop={false} initialParent="a" />);
  fireEvent.click(screen.getByRole('button', { name: /Inside/ }));
  fireEvent.click(screen.getByRole('button', { name: /Theirs/ }));
  expect(screen.getByText(/Only the organizers of/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Put it here' })).toBeDisabled();
});
