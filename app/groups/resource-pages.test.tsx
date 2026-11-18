import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { processDocument, uploadDocument } from '@/lib/emba/knowledge';
import ResourcesPage from './[namespace]/resources/page';
import TeamPage from './[namespace]/team/page';
import SourcePage from './[namespace]/resources/[id]/page';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());
async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}

it('lists resources on the team page tab for every member and hides a source after membership removal', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const member = await person('member@example.test');
  const group = await createWorkspace(t.db, owner, { name: 'Study team', description: '', namespace: 'study-team' });
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
  const doc = await uploadDocument(t.db, owner, { orgId: group.orgId, loopId: group.loopId, operationId: randomUUID(), title: 'Course notes', mediaType: 'text/plain', body: 'Private course source.' });
  await processDocument(t.db, owner, doc.id, 1);
  const params = Promise.resolve({ namespace: 'study-team' });
  // Resources are a tab of the team page; the old address leads there.
  await expect(withPortalTestSession(owner, () => ResourcesPage({ params }))).rejects.toMatchObject({ digest: expect.stringContaining('/groups/study-team/team?tab=resources') });
  const tab = (who: typeof owner) => withPortalTestSession(who, () => TeamPage({ params, searchParams: Promise.resolve({ tab: 'resources' }) }));
  // Any member adds, from the one box at the top.
  for (const who of [owner, member]) {
    const view = render(await tab(who));
    expect(screen.getByRole('textbox', { name: 'Add to resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Course notes' })).toHaveAttribute('href', `/groups/study-team/resources/${doc.id}?version=1`);
    view.unmount();
  }
  const source = await withPortalTestSession(member, () => SourcePage({ params: Promise.resolve({ namespace: 'study-team', id: doc.id }), searchParams: Promise.resolve({ version: '1' }) }));
  const sourceView = render(source);
  expect(screen.getByText('Private course source.')).toBeInTheDocument();
  sourceView.unmount();
  await t.db.query('update emba_membership set revoked_at=now() where person_id=$1', [member.personId]);
  render(await withPortalTestSession(member, () => SourcePage({ params: Promise.resolve({ namespace: 'study-team', id: doc.id }), searchParams: Promise.resolve({ version: '1' }) })));
  expect(screen.getByRole('heading', { name: 'Source unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('Private course source.')).not.toBeInTheDocument();
});
