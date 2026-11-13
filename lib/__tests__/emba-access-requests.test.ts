import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createWorkspace } from '@/lib/emba/workspaces';
import { accessRequestPreview, disableAccessRequests, enableAccessRequests, joinFromShare, listMembershipRequests, replaceJoinLink, requestMembership, reviewMembershipRequest, setJoinMode } from '@/lib/emba/access-requests';
import { grantLease } from '@/lib/emba/consent';
import { grantRole, revokeMembership } from '@/lib/emba/roles';
import { askShare, createAsk } from '@/lib/emba/team-asks';
import { addEvent } from '@/lib/emba/team-events';
import { eventShare, setInterest } from '@/lib/emba/team-interest';

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
  expect(await accessRequestPreview(t.db, token)).toEqual({ groupName: 'Study team', description: 'Public preview', publicLabel: 'Class project', joinMode: 'ask_first' });
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

// Specs: openspec/changes/loop-club-events-and-asks/specs/open-join.
async function club() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const group = await createWorkspace(t.db, owner, { name: 'Wine club', description: 'Tastings', namespace: 'wine-club' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const token = await enableAccessRequests(t.db, owner, { ...scope, publicLabel: 'Members' });
  return { owner, scope, token };
}
const standing = async (personId: string) => ({
  roles: (await t.db.query<{ role: string }>('select role from emba_role where person_id=$1 and revoked_at is null', [personId])).rows.map(row => row.role),
  member: (await t.db.query('select 1 from emba_membership where person_id=$1 and revoked_at is null', [personId])).rows.length === 1,
  leases: (await t.db.query('select 1 from emba_lease where person_id=$1', [personId])).rows.length,
  requests: (await t.db.query<{ state: string }>('select state from emba_group_membership_request where person_id=$1', [personId])).rows.map(row => row.state),
});

it('asks first by default, and admits on sign-in as a member and nothing more once an organizer says so', async () => {
  const { owner, scope, token } = await club();
  const first = await person('first@example.test'), second = await person('second@example.test');
  expect(await accessRequestPreview(t.db, token)).toMatchObject({ joinMode: 'ask_first' });
  expect(await requestMembership(t.db, first, token)).toEqual({ outcome: 'requested', namespace: 'wine-club', slug: 'workspace' });
  expect(await standing(first.personId)).toEqual({ roles: [], member: false, leases: 0, requests: ['pending'] });
  await setJoinMode(t.db, owner, { ...scope, mode: 'admit' });
  expect(await accessRequestPreview(t.db, token)).toMatchObject({ joinMode: 'admit' });
  // A new person, and one whose request was still waiting, both come in as members: no elevated role, no assistant grant.
  expect(await requestMembership(t.db, second, token)).toEqual({ outcome: 'joined', namespace: 'wine-club', slug: 'workspace' });
  expect(await standing(second.personId)).toEqual({ roles: ['member'], member: true, leases: 0, requests: [] });
  expect(await requestMembership(t.db, first, token)).toEqual({ outcome: 'joined', namespace: 'wine-club', slug: 'workspace' });
  expect(await standing(first.personId)).toEqual({ roles: ['member'], member: true, leases: 0, requests: ['approved'] });
  expect(await listMembershipRequests(t.db, owner, scope)).toEqual([]);
  await expect(requestMembership(t.db, second, token)).rejects.toThrow('conflict');
  // An organizer, not only the owner, can change the mode; a member cannot, and nobody's assistant can.
  await grantRole(t.db, owner, { ...scope, personId: second.personId, role: 'organizer' });
  await expect(setJoinMode(t.db, first, { ...scope, mode: 'ask_first' })).rejects.toThrow('forbidden');
  await grantLease(t.db, owner, { ...scope, clientId: 'claude', actions: ['plan:read', 'group-memory:write'], expiresAt: '2099-01-01T00:00:00Z' });
  const assistant = (await authenticate(t.db, 'test', async () => ({ issuer: owner.issuer, subject: owner.subject, clientId: 'claude', scopes: ['plan:read', 'group-memory:write'], expiresAt: Date.parse('2099-01-01') })))!;
  await expect(setJoinMode(t.db, assistant, { ...scope, mode: 'ask_first' })).rejects.toThrow('forbidden');
  await expect(replaceJoinLink(t.db, assistant, scope)).rejects.toThrow('forbidden');
  await expect(requestMembership(t.db, assistant, token)).rejects.toThrow('forbidden');
  await expect(setJoinMode(t.db, owner, { ...scope, mode: 'open' })).rejects.toThrow();
  expect(await accessRequestPreview(t.db, token)).toMatchObject({ joinMode: 'admit' });
  await setJoinMode(t.db, second, { ...scope, mode: 'ask_first' });
  // Closing the door applies to the next person; people already admitted stay.
  const third = await person('third@example.test');
  expect(await requestMembership(t.db, third, token)).toEqual({ outcome: 'requested', namespace: 'wine-club', slug: 'workspace' });
  expect(await standing(third.personId)).toMatchObject({ roles: [], member: false });
  expect(await standing(first.personId)).toMatchObject({ roles: ['member'], member: true });
});
it('does not re-admit a person who was removed, and a replaced link admits nobody', async () => {
  const { owner, scope, token } = await club();
  await setJoinMode(t.db, owner, { ...scope, mode: 'admit' });
  const removed = await person('removed@example.test'), late = await person('late@example.test');
  await requestMembership(t.db, removed, token);
  await revokeMembership(t.db, owner, { orgId: scope.orgId, personId: removed.personId });
  expect(await requestMembership(t.db, removed, token)).toEqual({ outcome: 'contact_organizer', namespace: 'wine-club', slug: 'workspace' });
  // Removal ends the membership (the old role row stays, and counts for nothing without it); the link does not bring it back.
  expect(await standing(removed.personId)).toMatchObject({ member: false, leases: 0, requests: [] });
  await expect(setInterest(t.db, removed, { ...scope, event: 'none' })).rejects.toThrow('forbidden');
  // Replacing keeps the mode; the old link stops at once and creates no request.
  await expect(replaceJoinLink(t.db, late, scope)).rejects.toThrow('forbidden');
  const next = await replaceJoinLink(t.db, owner, scope);
  expect(next).not.toBe(token);
  await expect(accessRequestPreview(t.db, token)).rejects.toThrow('not_found');
  await expect(requestMembership(t.db, late, token)).rejects.toThrow('not_found');
  expect(await standing(late.personId)).toEqual({ roles: [], member: false, leases: 0, requests: [] });
  expect(await accessRequestPreview(t.db, next)).toMatchObject({ groupName: 'Wine club', joinMode: 'admit' });
  expect(await requestMembership(t.db, late, next)).toEqual({ outcome: 'joined', namespace: 'wine-club', slug: 'workspace' });
  // A link that was turned off comes back asking first, and there is nothing to replace or set while it is off.
  await disableAccessRequests(t.db, owner, scope);
  await expect(replaceJoinLink(t.db, owner, scope)).rejects.toThrow('not_found');
  await expect(setJoinMode(t.db, owner, { ...scope, mode: 'admit' })).rejects.toThrow('not_found');
  const again = await enableAccessRequests(t.db, owner, { ...scope, publicLabel: 'Members' });
  expect(await accessRequestPreview(t.db, again)).toMatchObject({ joinMode: 'ask_first' });
});
it('offers the join step of the group from an event share link, by its mode', async () => {
  const { owner, scope } = await club();
  const added = await addEvent(t.db, owner, { ...scope, slug: 'tasting', name: 'Tasting', startsAt: '2099-02-01T19:00' });
  if (!added.saved) throw new Error('not saved');
  const share = added.event.shareUrl!.split('/').at(-1)!;
  const visitor = await person('visitor@example.test'), other = await person('other@example.test');
  expect(await eventShare(t.db, visitor, share)).toMatchObject({ view: 'outside', signedIn: true, join: { mode: 'ask_first', requested: false } });
  expect(await joinFromShare(t.db, visitor, { kind: 'event', token: share })).toEqual({ outcome: 'requested', namespace: 'wine-club', slug: 'workspace' });
  expect(await eventShare(t.db, visitor, share)).toMatchObject({ view: 'outside', join: { mode: 'ask_first', requested: true } });
  await setJoinMode(t.db, owner, { ...scope, mode: 'admit' });
  expect(await joinFromShare(t.db, other, { kind: 'event', token: share })).toEqual({ outcome: 'joined', namespace: 'wine-club', slug: 'workspace' });
  // Back on the event they opened, they are a member and can mark interest.
  expect(await eventShare(t.db, other, share)).toMatchObject({ view: 'member', detail: { event: { slug: 'tasting' } } });
  expect(await setInterest(t.db, other, { ...scope, event: 'tasting' })).toMatchObject({ saved: true, interested: true });
  expect(await standing(other.personId)).toEqual({ roles: ['member'], member: true, leases: 0, requests: [] });
  // The link of an ask does the same, and leads back to the ask.
  const asked = await createAsk(t.db, owner, { ...scope, question: 'Red or white?', kind: 'one', options: ['Red', 'White'], closesAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) });
  if (!asked.saved) throw new Error('not saved');
  const askToken = asked.ask.shareUrl.split('/').at(-1)!, third = await person('third@example.test');
  expect(await askShare(t.db, third, askToken)).toMatchObject({ view: 'outside', join: { mode: 'admit' } });
  expect(await joinFromShare(t.db, third, { kind: 'ask', token: askToken })).toEqual({ outcome: 'joined', namespace: 'wine-club', slug: 'workspace' });
  expect(await askShare(t.db, third, askToken)).toMatchObject({ view: 'member', detail: { ask: { number: asked.ask.number, open: true } } });
  expect(await standing(third.personId)).toEqual({ roles: ['member'], member: true, leases: 0, requests: [] });
  // A share link is not a way in when the join link is off, and an unknown one is nothing.
  await disableAccessRequests(t.db, owner, scope);
  const outsider = await person('outsider@example.test');
  expect(await eventShare(t.db, outsider, share)).toMatchObject({ view: 'outside', join: null });
  await expect(joinFromShare(t.db, outsider, { kind: 'event', token: share })).rejects.toThrow('not_found');
  await expect(joinFromShare(t.db, outsider, { kind: 'event', token: '0'.repeat(32) })).rejects.toThrow('not_found');
  await expect(joinFromShare(t.db, outsider, { kind: 'ask', token: share })).rejects.toThrow('not_found');
  expect(await standing(outsider.personId)).toEqual({ roles: [], member: false, leases: 0, requests: [] });
});
