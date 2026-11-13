import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { issueInvitation } from '@/lib/emba/invitations';
import GroupsPage from './page';
import { acceptInvite } from './actions';
import { tokenFrom } from './invitation-paste';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.location.hash = ''; });

async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function invite(owner: Principal, name: string, namespace: string, email: string) {
  const group = await createWorkspace(t.db, owner, { name, description: '', namespace });
  return issueInvitation(t.db, owner, { orgId: group.orgId, loopId: group.loopId, recipientEmail: email, role: 'member', expiresAt: '2099-11-19T12:00:00Z' });
}
const view = async (principal: Principal) => render(await withPortalTestSession(principal, () => GroupsPage()));
// PREVIEW_DIR=… writes each state as a static page for screenshots.
const preview = (name: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..600&display=swap" rel="stylesheet"><link rel="stylesheet" href="loop.css"><style>.lp{--font-archivo:Archivo}</style></head><body><div class="lp"><aside class="lp-rail"></aside><main class="lp-main"><div class="lp-wrap">${document.body.firstElementChild!.innerHTML}</div></main></div></body></html>`);

it('reads only a real invitation link out of what is pasted', () => {
  expect(tokenFrom('https://loop.example/groups#invite=abcdefghij_KLMNOP-1234')).toBe('abcdefghij_KLMNOP-1234');
  expect(tokenFrom('/groups#invite=short')).toBeNull();
  expect(tokenFrom('abcdefghij_KLMNOP-1234')).toBeNull();
});

it('with nothing to accept, the plate waits for an invitation and takes a pasted link', async () => {
  const me = await person('me@example.test');
  await view(me);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Waiting for your invitation.');
  const accept = screen.getByRole('button', { name: 'Accept' });
  expect(accept).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Invitation link'), { target: { value: 'https://loop.example/groups#invite=abcdefghij_KLMNOP-1234' } });
  expect(accept).toBeEnabled();
  expect(screen.getByText('Invited at another email?')).toBeInTheDocument();
  preview('empty');
});

it('an invitation is the plate, and accepting it puts the group in the list', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const me = await person('me@example.test');
  const first = await invite(owner, 'Study team 4', 'study-team-4', 'me@example.test');
  await invite(owner, 'Product Club', 'product-club', 'me@example.test');
  await view(me);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Join Product Club.');
  expect(screen.getByRole('heading', { name: /More invitations/ })).toBeInTheDocument();
  preview('invited');
  cleanup();

  expect((await withPortalTestSession(me, () => acceptInvite({ status: 'idle', message: '' }, (() => { const d = new FormData(); d.set('id', first.id); return d; })()))).status).toBe('success');
  await view(me);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Join Product Club.');
  expect(screen.getByRole('link', { name: /Study team 4/ })).toHaveAttribute('href', '/groups/study-team-4');
  preview('invited-with-group');
  cleanup();

  // The owner sees their groups under a plain plate, with Start a private group beside the list.
  await view(owner);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your groups');
  expect(screen.getAllByRole('link', { name: /@study-team-4|Study team 4/ }).length).toBeGreaterThan(0);
  expect(screen.getByText('Start a private group')).toBeInTheDocument();
  preview('groups');
});
