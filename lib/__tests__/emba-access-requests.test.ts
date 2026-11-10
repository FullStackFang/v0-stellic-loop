import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createWorkspace } from '@/lib/emba/workspaces';
import { accessRequestPreview, disableAccessRequests, enableAccessRequests, listMembershipRequests, requestMembership, reviewMembershipRequest } from '@/lib/emba/access-requests';

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

it('publishes only an opt-in preview, deduplicates requests, and grants member access only after approval', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const requester = await person('requester@example.test');
  const unrelated = await person('other@example.test');
  const group = await createWorkspace(t.db, owner, { name: 'Study team', description: 'Public preview', namespace: 'study-team' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  await expect(listMembershipRequests(t.db, requester, scope)).rejects.toThrow('forbidden');
  const token = await enableAccessRequests(t.db, owner, { ...scope, publicLabel: 'Class project' });
  expect(await accessRequestPreview(t.db, token)).toEqual({ groupName: 'Study team', description: 'Public preview', publicLabel: 'Class project' });
  await expect(accessRequestPreview(t.db, 'a'.repeat(22))).rejects.toThrow('not_found');
  await requestMembership(t.db, requester, token);
  await requestMembership(t.db, requester, token);
  expect((await t.db.query('select state from emba_group_membership_request')).rows).toEqual([{ state: 'pending' }]);
  expect(await listMembershipRequests(t.db, owner, scope)).toEqual([expect.objectContaining({ personId: requester.personId })]);
  await expect(reviewMembershipRequest(t.db, unrelated, { ...scope, personId: requester.personId, decision: 'approve' })).rejects.toThrow('forbidden');
  await reviewMembershipRequest(t.db, owner, { ...scope, personId: requester.personId, decision: 'approve' });
  expect((await t.db.query('select role from emba_role where person_id=$1', [requester.personId])).rows).toEqual([{ role: 'member' }]);
  expect((await t.db.query('select id from emba_lease where person_id=$1', [requester.personId])).rows).toEqual([]);
  await expect(reviewMembershipRequest(t.db, owner, { ...scope, personId: requester.personId, decision: 'approve' })).rejects.toThrow('conflict');
  await disableAccessRequests(t.db, owner, scope);
  await expect(accessRequestPreview(t.db, token)).rejects.toThrow('not_found');
  await expect(requestMembership(t.db, unrelated, token)).rejects.toThrow('not_found');
});
