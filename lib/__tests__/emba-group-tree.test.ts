import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, canAccessLoop, canAccessLoops, type Principal } from '@/lib/emba/access';
import { createWorkspace } from '@/lib/emba/workspaces';
import { createInnerGroup, listGroupTree } from '@/lib/emba/group-tree';
import { listPortalGroups, resolveGroup, type GroupAddress } from '@/lib/emba/groups';
import { accessRequestPreview, enableAccessRequests, requestMembership, reviewMembershipRequest, setJoinMode } from '@/lib/emba/access-requests';
import { acceptInvitation, issueInvitation, listReceivedInvitations } from '@/lib/emba/invitations';
import { listOrganizationMembers, listScopedRoles, revokeMembership, revokeRole } from '@/lib/emba/roles';
import { teamState, whatsNew } from '@/lib/emba/team-read';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { listAsks } from '@/lib/emba/team-asks';
import { listDocuments } from '@/lib/emba/knowledge';
import { listTags, resolveTag, setMemberHandle } from '@/lib/emba/tags';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());

async function person(name: string, clientId?: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: `${row.id}@example.test`, clientId })))!;
}
async function join(group: GroupAddress, p: Principal, role: 'owner' | 'organizer' | 'member') {
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [group.orgId, p.personId]);
  await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [group.orgId, group.loopId, p.personId, role]);
}
/** EMBA 2027 holding Team 1 (holding NBAE 6830) and Team 2. */
async function tree() {
  const owner = await person('Owner');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const cohort = await createWorkspace(t.db, owner, { name: 'EMBA 2027', description: '', namespace: 'emba-2027' });
  const inner = (parent: GroupAddress, name: string, slug: string) => createInnerGroup(t.db, owner, { orgId: parent.orgId, parentLoopId: parent.loopId, name, description: '', slug });
  const team1 = await inner(cohort, 'Team 1', 'team-1'), course = await inner(team1, 'NBAE 6830', 'nbae-6830'), team2 = await inner(cohort, 'Team 2', 'team-2');
  return { owner, cohort, team1, course, team2 };
}
const read = (p: Principal, g: GroupAddress) => t.db.tx(q => canAccessLoop(q, p, g.orgId, g.loopId, 'read'));

it('makes a group inside a group, to any depth, with its own name, a two-part handle and its maker as owner', async () => {
  const { owner, cohort, team1, course } = await tree();
  expect(team1).toMatchObject({ handle: '@emba-2027/team-1', orgName: 'Team 1', loopPath: 'emba-2027/team-1', orgId: cohort.orgId });
  expect(course).toMatchObject({ handle: '@emba-2027/nbae-6830', orgName: 'NBAE 6830', loopPath: 'emba-2027/team-1/nbae-6830' });
  expect((await t.db.query('select role from emba_role where loop_id=$1 and person_id=$2', [course.loopId, owner.personId])).rows).toEqual([{ role: 'owner' }]);
  expect(await resolveGroup(t.db, owner, { handle: '@emba-2027/nbae-6830' })).toMatchObject({ status: 'resolved', group: { loopId: course.loopId, orgName: 'NBAE 6830' } });
  expect(await resolveGroup(t.db, owner, { handle: '@emba-2027/workspace' })).toMatchObject({ status: 'resolved', group: { loopId: cohort.loopId, orgName: 'EMBA 2027' } });
});

it('lets an organizer of a group above start one, and refuses a member, an assistant and an outsider', async () => {
  const { cohort, team1 } = await tree();
  const organizer = await person('Organizer'), member = await person('Member'), outsider = await person('Outsider'), assistant = await person('Assistant', 'claude');
  await join(cohort, organizer, 'organizer'); await join(cohort, member, 'member'); await join(cohort, assistant, 'owner');
  const data = { orgId: team1.orgId, parentLoopId: team1.loopId, name: 'Section A', description: '', slug: 'section-a' };
  for (const p of [member, outsider, assistant]) await expect(createInnerGroup(t.db, p, data)).rejects.toThrow('forbidden');
  expect((await t.db.query("select 1 from emba_loop where path like '%section-a'")).rows).toHaveLength(0);
  expect(await createInnerGroup(t.db, organizer, data)).toMatchObject({ handle: '@emba-2027/section-a', loopPath: 'emba-2027/team-1/section-a' });
  expect((await t.db.query("select r.role from emba_role r join emba_loop l on l.id=r.loop_id where l.path like '%section-a' and r.person_id=$1", [organizer.personId])).rows).toEqual([{ role: 'owner' }]);
});

it('refuses a handle already used by a group, an event or a person, a reserved word, and a parent of another group tree', async () => {
  const { owner, cohort, team1 } = await tree();
  const start = (slug: string, parent = team1) => createInnerGroup(t.db, owner, { orgId: cohort.orgId, parentLoopId: parent.loopId, name: 'Any', description: '', slug });
  await t.db.query("insert into emba_team_event(org_id,loop_id,slug,name) values($1,$2,'kickoff','Kickoff')", [cohort.orgId, cohort.loopId]);
  await t.db.query("insert into emba_member_handle(org_id,person_id,handle) values($1,$2,'priya')", [cohort.orgId, owner.personId]);
  for (const slug of ['team-2', 'kickoff', 'priya', 'emba-2027', 'workspace', 'team', 'resources', 'in', 'new']) await expect(start(slug), slug).rejects.toThrow('conflict');
  for (const slug of ['a', 'Bad', 'a--b', 'a-', 'x'.repeat(49)]) await expect(start(slug), slug).rejects.toThrow();
  const other = await createWorkspace(t.db, owner, { name: 'Other', description: '', namespace: 'other' });
  await expect(createInnerGroup(t.db, owner, { orgId: cohort.orgId, parentLoopId: other.loopId, name: 'Any', description: '', slug: 'stray' })).rejects.toThrow('forbidden');
  expect((await t.db.query('select count(*)::int as n from emba_loop')).rows).toEqual([{ n: 5 }]);
});

it('opens inner groups to everyone above them and nothing above or beside to a person in an inner group only', async () => {
  const { cohort, team1, course, team2 } = await tree();
  const outer = await person('Outer'), inner = await person('Inner'), sibling = await person('Sibling');
  await join(cohort, outer, 'member'); await join(team1, inner, 'member'); await join(team2, sibling, 'member');
  expect(await Promise.all([cohort, team1, course, team2].map(g => read(outer, g)))).toEqual([true, true, true, true]);
  expect(await Promise.all([cohort, team1, course, team2].map(g => read(inner, g)))).toEqual([false, true, true, false]);
  expect(await Promise.all([cohort, team1, course, team2].map(g => read(sibling, g)))).toEqual([false, false, false, true]);
  expect((await listPortalGroups(t.db, inner)).map(g => g.handle)).toEqual(['@emba-2027/nbae-6830', '@emba-2027/team-1']);
  expect(await resolveGroup(t.db, inner, { handle: '@emba-2027' })).toMatchObject({ status: 'unavailable' });
  expect(await resolveGroup(t.db, inner, { handle: '@emba-2027/team-2' })).toMatchObject({ status: 'unavailable' });
});

it('lists the tree a person can open, hanging an inner group at the top when its parent is closed to them', async () => {
  const { owner, cohort, team1, course, team2 } = await tree();
  const outer = await person('Outer'), inner = await person('Inner'), lead = await person('Lead');
  await join(cohort, outer, 'member'); await join(team1, inner, 'member'); await join(team1, lead, 'organizer');
  const shape = async (p: Principal) => (await listGroupTree(t.db, p)).map(g => [g.orgName, g.parentLoopId, g.canStart]);
  expect(await shape(owner)).toEqual([['NBAE 6830', team1.loopId, true], ['Team 1', cohort.loopId, true], ['Team 2', cohort.loopId, true], ['EMBA 2027', null, true]]);
  expect(await shape(outer)).toEqual([['NBAE 6830', team1.loopId, false], ['Team 1', cohort.loopId, false], ['Team 2', cohort.loopId, false], ['EMBA 2027', null, false]]);
  expect(await shape(inner)).toEqual([['NBAE 6830', team1.loopId, false], ['Team 1', null, false]]);
  expect(await shape(lead)).toEqual([['NBAE 6830', team1.loopId, true], ['Team 1', null, true]]);
  expect(JSON.stringify(await listGroupTree(t.db, inner))).not.toMatch(/EMBA 2027|Team 2/);
  expect(team2.orgId).toBe(course.orgId);
});

it('keeps a root nameless in the loop table and an inner name inside its limits', async () => {
  const { cohort, team1 } = await tree();
  await expect(t.db.query("update emba_loop set name='Root name' where id=$1", [cohort.loopId])).rejects.toThrow();
  await expect(t.db.query("update emba_loop set name='' where id=$1", [team1.loopId])).rejects.toThrow();
});

const roles = async (p: Principal) => (await t.db.query<{ path: string; role: string }>('select l.path,r.role from emba_role r join emba_loop l on l.id=r.loop_id where r.person_id=$1 and r.revoked_at is null order by l.path', [p.personId])).rows.map(r => `${r.path}:${r.role}`);
async function link(owner: Principal, group: GroupAddress, mode: 'admit' | 'ask_first') {
  const token = await enableAccessRequests(t.db, owner, { orgId: group.orgId, loopId: group.loopId, publicLabel: '' });
  if (mode === 'admit') await setJoinMode(t.db, owner, { orgId: group.orgId, loopId: group.loopId, mode });
  return token;
}

it("admits by an inner group join link to that group only, under the inner group own name", async () => {
  const { owner, cohort, team1, course, team2 } = await tree();
  await t.db.query("update emba_organization set description='Cohort notes' where id=$1", [cohort.orgId]);
  const token = await link(owner, team1, 'admit'), fresh = await person('Fresh');
  expect(await accessRequestPreview(t.db, token)).toMatchObject({ groupName: 'Team 1', description: '' });
  expect(await requestMembership(t.db, fresh, token)).toMatchObject({ outcome: 'joined' });
  expect(await roles(fresh)).toEqual(['emba-2027/team-1:member']);
  expect(await Promise.all([cohort, team1, course, team2].map(g => read(fresh, g)))).toEqual([false, true, true, false]);
  // The owner of a group above may run the link; an organizer of the inner group may not turn it on.
  const lead = await person('Lead'); await join(team2, lead, 'organizer');
  await expect(enableAccessRequests(t.db, lead, { orgId: team2.orgId, loopId: team2.loopId, publicLabel: '' })).rejects.toThrow('forbidden');
});

it('lets a person already in one inner group join another without touching the roles they hold', async () => {
  const { owner, cohort, team1, team2 } = await tree();
  const inner = await person('Inner'), organizer = await person('Organizer');
  await join(team1, inner, 'member'); await join(cohort, organizer, 'organizer');
  const admit = await link(owner, team2, 'admit');
  expect(await requestMembership(t.db, inner, admit)).toMatchObject({ outcome: 'joined' });
  expect(await roles(inner)).toEqual(['emba-2027/team-1:member', 'emba-2027/team-2:member']);
  // Someone the group is already open to has nothing to join.
  await expect(requestMembership(t.db, inner, admit)).rejects.toThrow('conflict');
  await expect(requestMembership(t.db, organizer, admit)).rejects.toThrow('conflict');
  expect(await roles(organizer)).toEqual(['emba-2027:organizer']);
});

it('approves a request for a second inner group and keeps the first role', async () => {
  const { owner, team1, team2 } = await tree();
  const inner = await person('Inner'); await join(team1, inner, 'member');
  const ask = await link(owner, team2, 'ask_first');
  expect(await requestMembership(t.db, inner, ask)).toMatchObject({ outcome: 'requested' });
  await reviewMembershipRequest(t.db, owner, { orgId: team2.orgId, loopId: team2.loopId, personId: inner.personId, decision: 'approve' });
  expect(await roles(inner)).toEqual(['emba-2027/team-1:member', 'emba-2027/team-2:member']);
});

it('does not re-admit by link a person removed from the inner group or from the whole group', async () => {
  const { owner, cohort, team1, team2 } = await tree();
  const dropped = await person('Dropped'), gone = await person('Gone');
  await join(team1, dropped, 'member'); await join(team2, dropped, 'member'); await join(team1, gone, 'member');
  await revokeRole(t.db, owner, { orgId: team1.orgId, loopId: team1.loopId, personId: dropped.personId });
  await revokeMembership(t.db, owner, { orgId: cohort.orgId, personId: gone.personId });
  const admit = await link(owner, team1, 'admit');
  for (const p of [dropped, gone]) expect(await requestMembership(t.db, p, admit)).toMatchObject({ outcome: 'contact_organizer' });
  expect(await roles(dropped)).toEqual(['emba-2027/team-2:member']);
  expect(await read(gone, team1)).toBe(false);
});

it('does not admit by an inner link a person whose role in a group above was taken away', async () => {
  const { owner, team1, course, team2 } = await tree();
  const dropped = await person('Dropped');
  await join(team1, dropped, 'member'); await join(team2, dropped, 'member');
  await revokeRole(t.db, owner, { orgId: team1.orgId, loopId: team1.loopId, personId: dropped.personId });
  const admit = await link(owner, course, 'admit');
  expect(await requestMembership(t.db, dropped, admit)).toMatchObject({ outcome: 'contact_organizer' });
  expect(await read(dropped, course)).toBe(false);
});

it('lists a tree larger than one screen of groups', async () => {
  const { owner, cohort } = await tree();
  for (let n = 0; n < 60; n++) await createInnerGroup(t.db, owner, { orgId: cohort.orgId, parentLoopId: cohort.loopId, name: `Section ${n}`, description: '', slug: `section-${n}` });
  expect(await listGroupTree(t.db, owner)).toHaveLength(64);
});

it('keeps an organizer above an organizer when they accept a member invitation below, and names the inner group in it', async () => {
  const { owner, cohort, team1 } = await tree();
  const organizer = await person('Organizer'); await join(cohort, organizer, 'organizer');
  const { token } = await issueInvitation(t.db, owner, { orgId: team1.orgId, loopId: team1.loopId, recipientEmail: organizer.verifiedEmail!, role: 'member', expiresAt: '2099-01-01T00:00:00Z' });
  expect(await listReceivedInvitations(t.db, organizer)).toMatchObject([{ groupName: 'Team 1' }]);
  await acceptInvitation(t.db, organizer, token);
  expect(await roles(organizer)).toEqual(['emba-2027:organizer', 'emba-2027/team-1:member']);
});

it('refuses every team read above and beside a person in an inner group only, and serves the inner group under its own name', async () => {
  const { cohort, team1, team2 } = await tree();
  const outer = await person('Outer'), inner = await person('Inner');
  await join(cohort, outer, 'member'); await join(team1, inner, 'member');
  const scope = (g: GroupAddress) => ({ orgId: g.orgId, loopId: g.loopId });
  for (const closed of [cohort, team2]) {
    for (const read of [teamState, whatsNew, listTeamEvents, upcomingEvents, listAsks, listDocuments]) await expect(read(t.db, inner, scope(closed)), read.name).rejects.toThrow('forbidden');
    await expect(listScopedRoles(t.db, inner, closed.orgId, closed.loopId)).rejects.toThrow('forbidden');
  }
  await expect(listOrganizationMembers(t.db, inner, cohort.orgId, cohort.loopId)).rejects.toThrow('forbidden');
  for (const p of [outer, inner]) expect(await teamState(t.db, p, scope(team1))).toMatchObject({ team: { handle: '@emba-2027/team-1', name: 'Team 1' } });
});

it('offers a person in an inner group only no people or groups from above when tagging', async () => {
  const { owner, cohort, team1, team2 } = await tree();
  const inner = await person('Inner'), sibling = await person('Sibling');
  await join(team1, inner, 'member'); await join(team2, sibling, 'member');
  await setMemberHandle(t.db, owner, { orgId: cohort.orgId, handle: 'the-owner' });
  await setMemberHandle(t.db, sibling, { orgId: cohort.orgId, handle: 'sib' });
  const tags = await listTags(t.db, inner);
  expect(tags.teams.map(tag => tag.handle)).toEqual(['@emba-2027/nbae-6830', '@emba-2027/team-1']);
  expect(tags.people).toEqual([]);
  for (const handle of ['@emba-2027/sib', '@sib', '@emba-2027/the-owner', '@emba-2027', '@emba-2027/team-2']) expect(await resolveTag(t.db, inner, { handle }), handle).toEqual({ status: 'unavailable', matches: [] });
  expect(await resolveTag(t.db, owner, { handle: '@emba-2027/sib' })).toMatchObject({ status: 'resolved' });
});

it('refuses several groups at once when one is named under an organization it does not belong to', async () => {
  const { owner, cohort, team1, team2 } = await tree();
  const other = await createWorkspace(t.db, owner, { name: 'Other', description: '', namespace: 'other' });
  const all = (scopes: { orgId: string; loopId: string }[]) => t.db.tx(q => canAccessLoops(q, owner, scopes, 'read'));
  const scope = (g: GroupAddress) => ({ orgId: g.orgId, loopId: g.loopId });
  expect(await all([scope(cohort), scope(team1), scope(other)])).toBe(true);
  // The owner holds both groups, and neither id belongs to the organization it is named with.
  expect(await all([{ orgId: other.orgId, loopId: team1.loopId }])).toBe(false);
  expect(await all([scope(team1), { orgId: cohort.orgId, loopId: other.loopId }, scope(team2)])).toBe(false);
});

it('lists groups in the same number of statements for four groups as for one, and still records a read of each', async () => {
  const { owner, team2 } = await tree();
  const member = await person('Member');
  await join(team2, member, 'member');
  const counted = async (p: Principal) => {
    let statements = 0;
    const count = (q: Pick<TestDb['db'], 'query'>): Pick<TestDb['db'], 'query'> => ({ query: (text, params) => { statements++; return q.query(text, params); } });
    const groups = await listGroupTree({ ...count(t.db), tx: fn => t.db.tx(q => fn(count(q))) }, p);
    return { statements, groups: groups.length };
  };
  const reads = async (p: Principal) => (await t.db.query("select resource_id from emba_audit where person_id=$1 and action='plan:read' and resource_id is not null", [p.personId])).rows.length;
  const before = await reads(owner);
  const one = await counted(member), four = await counted(owner);
  expect([one.groups, four.groups]).toEqual([1, 4]);
  expect(four.statements).toBe(one.statements);
  expect(await reads(owner) - before).toBe(4);
});
