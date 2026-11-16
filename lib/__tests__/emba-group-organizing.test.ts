// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { counting } from '@/test/team-seed';
import { authenticate, type Principal } from '@/lib/emba/access';
import { grantLease, listRemovedGroupGrants } from '@/lib/emba/consent';
import { archiveGroup, createInnerGroup, listArchivedGroups, listGroupTree, renameGroup, restoreGroup } from '@/lib/emba/group-tree';
import { listGroups, resolveGroup, type GroupAddress } from '@/lib/emba/groups';
import { acceptInvitation, issueInvitation, issueInvitations } from '@/lib/emba/invitations';
import { grantRole, revokeMembership, revokeRole } from '@/lib/emba/roles';
import { OrganizeRefused } from '@/lib/emba/team-core';
import { teamState } from '@/lib/emba/team-read';
import { LIMITS, logDecision } from '@/lib/emba/team-records';
import { createWorkspace } from '@/lib/emba/workspaces';

// Specs: openspec/changes/loop-organize-and-fix/specs/group-organizing and organizer-chat-tools (the services under the tools).
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
afterEach(() => vi.unstubAllEnvs());

const forever = '2099-01-01T00:00:00Z', READ = ['plan:read'], WRITE = ['plan:read', 'group-memory:write'];
async function person(name: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  const sign = (clientId?: string) => authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse(forever), verifiedEmail: `${row.id}@example.test`, clientId, scopes: clientId ? WRITE : [] }));
  return { site: (await sign())!, agent: (await sign('claude'))! };
}
const scope = (g: GroupAddress) => ({ orgId: g.orgId, loopId: g.loopId });
/**
 * Team 1 holding NBAE 6561 (holding Section A) and NBAE 6830. Olivia owns the team, Omar organizes it, Lea organizes
 * NBAE 6561 only, Mia is a member of the team. Each has an assistant signed in; none has a grant yet.
 */
async function tree() {
  const olivia = await person('Olivia');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', olivia.site.subject);
  const team = await createWorkspace(t.db, olivia.site, { name: 'Team 1', description: '', namespace: 'team-1' });
  const inner = (parent: GroupAddress, name: string, slug: string) => createInnerGroup(t.db, olivia.site, { orgId: team.orgId, parentLoopId: parent.loopId, name, description: '', slug });
  const banking = await inner(team, 'NBAE 6561 Investment Banking', 'nbae-6561'), section = await inner(banking, 'Section A', 'section-a'), venture = await inner(team, 'NBAE 6830', 'nbae-6830');
  const join = async (name: string, group: GroupAddress, role: string) => {
    const who = await person(name);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict do nothing', [team.orgId, who.site.personId]);
    await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [team.orgId, group.loopId, who.site.personId, role]);
    return who;
  };
  const omar = await join('Omar', team, 'organizer'), lea = await join('Lea', banking, 'organizer'), mia = await join('Mia', team, 'member');
  const grant = (who: { site: Principal }, group: GroupAddress, actions = WRITE) => grantLease(t.db, who.site, { ...scope(group), clientId: 'claude', actions, expiresAt: forever });
  return { olivia, omar, lea, mia, team, banking, section, venture, grant };
}
const live = async (p: Principal) => (await listGroupTree(t.db, p)).map(group => group.slug).sort();
const archivedAt = async (g: GroupAddress) => (await t.db.query<{ at: unknown }>('select retired_at as at from emba_group_address where loop_id=$1', [g.loopId])).rows[0].at;
const refused = async (run: Promise<unknown>, reason: string) => {
  const error = await run.then(() => null, caught => caught);
  expect(error, reason).toBeInstanceOf(OrganizeRefused);
  expect((error as OrganizeRefused).reason).toBe(reason);
};

it('renames a group inside another and a top-level group, and leaves the handle as it was', async () => {
  const f = await tree();
  expect(await renameGroup(t.db, f.lea.site, { ...scope(f.banking), name: '  Investment Banking ' })).toEqual({ handle: '@team-1/nbae-6561', name: 'Investment Banking' });
  expect(await resolveGroup(t.db, f.mia.site, { handle: '@team-1/nbae-6561' })).toMatchObject({ status: 'resolved', group: { loopId: f.banking.loopId, orgName: 'Investment Banking', loopPath: 'team-1/nbae-6561' } });
  // A top-level group keeps its name on the organization; an organizer of it may rename it.
  expect(await renameGroup(t.db, f.omar.site, { ...scope(f.team), name: 'Team One' })).toEqual({ handle: '@team-1', name: 'Team One' });
  expect((await listGroupTree(t.db, f.mia.site)).find(group => group.slug === 'workspace')).toMatchObject({ orgName: 'Team One', handle: '@team-1/workspace' });
  expect((await t.db.query('select name from emba_loop where id=$1', [f.team.loopId])).rows).toEqual([{ name: null }]);
});

it('refuses a rename by a member, by an organizer of another group, and a name outside its limits', async () => {
  const f = await tree();
  await refused(renameGroup(t.db, f.mia.site, { ...scope(f.banking), name: 'Mine' }), 'organizers_only');
  await refused(renameGroup(t.db, f.lea.site, { ...scope(f.venture), name: 'Mine' }), 'organizers_only');
  await refused(renameGroup(t.db, f.lea.site, { ...scope(f.team), name: 'Mine' }), 'organizers_only');
  for (const name of ['', '   ', 'x'.repeat(201), 'Two\nlines']) await expect(renameGroup(t.db, f.olivia.site, { ...scope(f.banking), name }), JSON.stringify(name)).rejects.toThrow();
  expect((await t.db.query('select name from emba_loop where id=$1', [f.banking.loopId])).rows).toEqual([{ name: 'NBAE 6561 Investment Banking' }]);
});

it('archives a group with everything under it in one act, ends the grants made on them, and deletes nothing', async () => {
  const f = await tree();
  const onTeam = await f.grant(f.mia, f.team), onClass = await f.grant(f.mia, f.banking), onSection = await f.grant(f.olivia, f.section), beside = await f.grant(f.mia, f.venture);
  await logDecision(t.db, f.mia.site, { ...scope(f.banking), topic: 'kept', statement: 'Stays on record.', newTopic: true });
  expect(await archiveGroup(t.db, f.lea.site, scope(f.banking))).toEqual({ handle: '@team-1/nbae-6561', name: 'NBAE 6561 Investment Banking', inside: 1 });
  for (const who of [f.olivia, f.lea, f.mia]) expect(await live(who.site), who.site.personId).not.toEqual(expect.arrayContaining(['nbae-6561']));
  expect(await live(f.mia.site)).toEqual(['nbae-6830', 'workspace']);
  expect(await resolveGroup(t.db, f.mia.site, { handle: '@team-1/nbae-6561' })).toMatchObject({ status: 'unavailable' });
  expect(await listGroups(t.db, f.mia.agent, {})).toHaveLength(2);
  await expect(teamState(t.db, f.mia.agent, scope(f.banking))).rejects.toThrow('forbidden');
  expect(await archivedAt(f.banking)).toEqual(await archivedAt(f.section));
  const { rows } = await t.db.query<{ id: string; ended: boolean }>('select id,revoked_at is not null as ended from emba_lease');
  expect(Object.fromEntries(rows.map(row => [row.id, row.ended]))).toEqual({ [onTeam.id]: false, [onClass.id]: true, [onSection.id]: true, [beside.id]: false });
  expect((await listRemovedGroupGrants(t.db, f.mia.site)).map(item => item.group)).toEqual(['NBAE 6561 Investment Banking']);
  expect((await t.db.query('select 1 from emba_team_record where loop_id=$1', [f.banking.loopId])).rows).toHaveLength(1);
  expect((await t.db.query('select 1 from emba_role where loop_id=$1 and revoked_at is null', [f.banking.loopId])).rows).toHaveLength(2);
  // Nothing can be started under an archived group, and it cannot be archived twice.
  await expect(createInnerGroup(t.db, f.olivia.site, { orgId: f.team.orgId, parentLoopId: f.banking.loopId, name: 'Late', description: '', slug: 'late' })).rejects.toThrow('forbidden');
  await expect(archiveGroup(t.db, f.lea.site, scope(f.banking))).rejects.toThrow('not_found');
});

it('lets whoever runs an inner group archive it, only the owner archive a top-level group, and no member either', async () => {
  const f = await tree();
  await refused(archiveGroup(t.db, f.mia.site, scope(f.banking)), 'organizers_only');
  await refused(archiveGroup(t.db, f.lea.site, scope(f.venture)), 'organizers_only');
  await refused(archiveGroup(t.db, f.omar.site, scope(f.team)), 'organizers_only');
  expect(await live(f.mia.site)).toHaveLength(4);
  // An organizer of the team runs every group inside it.
  expect(await archiveGroup(t.db, f.omar.site, scope(f.venture))).toMatchObject({ inside: 0 });
  expect(await archiveGroup(t.db, f.olivia.site, scope(f.team))).toMatchObject({ handle: '@team-1', inside: 2 });
  for (const who of [f.olivia, f.omar, f.lea, f.mia]) expect(await live(who.site)).toEqual([]);
});

it('restores what was archived together, keeps what was archived earlier, and brings back no grant', async () => {
  const f = await tree();
  const onClass = await f.grant(f.mia, f.banking);
  await f.grant(f.mia, f.team);
  await archiveGroup(t.db, f.lea.site, scope(f.section));
  await archiveGroup(t.db, f.olivia.site, scope(f.team));
  expect(await live(f.mia.site)).toEqual([]);
  // Not under an archived group; and an assistant restores nothing.
  await expect(restoreGroup(t.db, f.lea.site, scope(f.banking))).rejects.toThrow('conflict');
  await expect(restoreGroup(t.db, f.olivia.agent, scope(f.team))).rejects.toThrow('forbidden');
  await refused(restoreGroup(t.db, f.omar.site, scope(f.team)), 'organizers_only');
  await refused(restoreGroup(t.db, f.mia.site, scope(f.team)), 'organizers_only');
  expect(await restoreGroup(t.db, f.olivia.site, scope(f.team))).toEqual({ handle: '@team-1', name: 'Team 1', inside: 2 });
  expect(await live(f.mia.site)).toEqual(['nbae-6561', 'nbae-6830', 'workspace']);
  expect(await archivedAt(f.section)).not.toBeNull();
  await expect(restoreGroup(t.db, f.olivia.site, scope(f.team))).rejects.toThrow('not_found');
  // The record, the people and the handle are as they were.
  expect(await resolveGroup(t.db, f.lea.site, { handle: '@team-1/nbae-6561' })).toMatchObject({ status: 'resolved', group: { orgName: 'NBAE 6561 Investment Banking' } });
  expect((await t.db.query('select 1 from emba_role where loop_id=$1 and revoked_at is null', [f.banking.loopId])).rows).toHaveLength(2);
  // Both of Mia's grants ended with the archive and neither came back: her assistant reaches nothing until she grants again.
  expect((await t.db.query('select 1 from emba_lease where revoked_at is null')).rows).toEqual([]);
  expect(await listGroups(t.db, f.mia.agent, {})).toEqual([]);
  expect((await t.db.query('select revoked_at is not null as ended from emba_lease where id=$1', [onClass.id])).rows).toEqual([{ ended: true }]);
  expect(await restoreGroup(t.db, f.lea.site, scope(f.section))).toMatchObject({ handle: '@team-1/section-a', inside: 0 });
});

it('covers a restored group again with a grant made on the team', async () => {
  const f = await tree();
  await f.grant(f.mia, f.team);
  await archiveGroup(t.db, f.lea.site, scope(f.banking));
  expect((await listGroups(t.db, f.mia.agent, {})).map(group => group.slug)).toEqual(['nbae-6830', 'workspace']);
  await restoreGroup(t.db, f.lea.site, scope(f.banking));
  expect((await listGroups(t.db, f.mia.agent, {})).map(group => group.slug)).toEqual(['nbae-6561', 'nbae-6830', 'section-a', 'workspace']);
  expect(await teamState(t.db, f.mia.agent, scope(f.banking))).toMatchObject({ team: { handle: '@team-1/nbae-6561' } });
});

it('refuses an invitation to an archived group, to issue and to accept, and takes it again once the group is back', async () => {
  const f = await tree();
  const guest = (await person('Guest')).site;
  const { token } = await issueInvitation(t.db, f.lea.site, { ...scope(f.banking), recipientEmail: guest.verifiedEmail!, role: 'member', expiresAt: forever });
  await archiveGroup(t.db, f.lea.site, scope(f.banking));
  await expect(acceptInvitation(t.db, guest, token)).rejects.toMatchObject({ reason: 'group_closed' });
  await expect(issueInvitation(t.db, f.lea.site, { ...scope(f.banking), recipientEmail: 'new@example.test', role: 'member', expiresAt: forever })).rejects.toMatchObject({ reason: 'group_closed' });
  expect((await t.db.query('select 1 from emba_membership where person_id=$1', [guest.personId])).rows).toEqual([]);
  await restoreGroup(t.db, f.lea.site, scope(f.banking));
  await acceptInvitation(t.db, guest, token);
  expect(await live(guest)).toEqual(['nbae-6561', 'section-a']);
});

it('lists the archived groups a person may restore, in one statement, and shows nobody else that they exist', async () => {
  const f = await tree();
  await archiveGroup(t.db, f.lea.site, scope(f.section));
  await archiveGroup(t.db, f.lea.site, scope(f.banking));
  const names = async (p: Principal) => (await listArchivedGroups(t.db, p)).map(group => `${group.name} ${group.handle} ${group.inside}`);
  // Section A went first, on its own: it is not counted with the class, and it cannot be restored while the class is archived.
  for (const who of [f.olivia, f.omar, f.lea]) expect(await names(who.site)).toEqual(['NBAE 6561 Investment Banking @team-1/nbae-6561 0']);
  expect(await names(f.mia.site)).toEqual([]);
  await expect(listArchivedGroups(t.db, f.olivia.agent)).rejects.toThrow('forbidden');
  await archiveGroup(t.db, f.olivia.site, scope(f.team));
  expect(await names(f.olivia.site)).toEqual(['Team 1 @team-1 1']);
  for (const who of [f.omar, f.lea, f.mia]) expect(await names(who.site)).toEqual([]);
  const c = counting(t.db);
  expect(await c.of(db => listArchivedGroups(db, f.olivia.site))).toBe(1);
  // A role that was taken away restores nothing.
  await t.db.query('update emba_role set revoked_at=clock_timestamp() where person_id=$1', [f.olivia.site.personId]);
  expect(await names(f.olivia.site)).toEqual([]);
});

// The services an organizer's assistant may use (design D8, D9).
it('lets the assistant of an organizer start a group, rename one and archive one under a read-and-write grant on the team', async () => {
  const f = await tree();
  await f.grant(f.omar, f.team);
  const made = await createInnerGroup(t.db, f.omar.agent, { orgId: f.team.orgId, parentLoopId: f.team.loopId, name: 'NBAE 6900', description: '', slug: 'nbae-6900' });
  expect(made).toMatchObject({ handle: '@team-1/nbae-6900', loopPath: 'team-1/nbae-6900' });
  expect((await t.db.query('select role from emba_role where loop_id=$1 and person_id=$2', [made.loopId, f.omar.site.personId])).rows).toEqual([{ role: 'owner' }]);
  expect(await renameGroup(t.db, f.omar.agent, { ...scope(made), name: 'Negotiations' })).toEqual({ handle: '@team-1/nbae-6900', name: 'Negotiations' });
  expect(await archiveGroup(t.db, f.omar.agent, scope(made))).toMatchObject({ handle: '@team-1/nbae-6900', inside: 0 });
  // Each act is recorded with the person and the assistant.
  const { rows } = await t.db.query<{ client: string; leased: boolean }>("select client_id as client,lease_id is not null as leased from emba_audit where person_id=$1 and action='activity:write' and resource_id=$2", [f.omar.site.personId, made.loopId]);
  expect(rows).toEqual(Array(3).fill({ client: 'claude', leased: true }));
});

it('refuses an assistant with a read grant, an assistant of a member, and anything on a top-level group', async () => {
  const f = await tree();
  await f.grant(f.omar, f.team, READ); await f.grant(f.mia, f.team); await f.grant(f.olivia, f.team);
  const start = (p: Principal) => createInnerGroup(t.db, p, { orgId: f.team.orgId, parentLoopId: f.team.loopId, name: 'New', description: '', slug: 'new-class' });
  const invite = (p: Principal) => issueInvitations(t.db, p, { ...scope(f.team), emails: ['a@example.test'], role: 'member', expiresAt: forever });
  for (const act of [start, invite, (p: Principal) => renameGroup(t.db, p, { ...scope(f.banking), name: 'X' }), (p: Principal) => archiveGroup(t.db, p, scope(f.banking))]) {
    await refused(act(f.omar.agent), 'needs_write');
    await refused(act(f.mia.agent), 'organizers_only');
    // No grant at all is not told apart from a group that does not exist.
    await expect(act(f.lea.agent)).rejects.toThrow('forbidden');
  }
  // The owner's assistant, with read and write on the team, still changes nothing about the team itself.
  await refused(renameGroup(t.db, f.olivia.agent, { ...scope(f.team), name: 'X' }), 'site_only');
  await refused(archiveGroup(t.db, f.olivia.agent, scope(f.team)), 'site_only');
  expect(await live(f.mia.site)).toHaveLength(4);
  expect((await t.db.query('select 1 from emba_invitation')).rows).toEqual([]);
  expect((await t.db.query('select 1 from emba_team_write')).rows).toEqual([]);
});

it('invites as members only through an assistant, records each invitation, and never changes who runs a group or who is in it', async () => {
  const f = await tree();
  await f.grant(f.olivia, f.team);
  const made = await issueInvitations(t.db, f.olivia.agent, { ...scope(f.team), emails: ['A@Example.test ', 'b@example.test'], role: 'member', expiresAt: forever });
  expect(made.map(item => item.email)).toEqual(['a@example.test', 'b@example.test']);
  expect((await t.db.query('select recipient_email,role,issued_by from emba_invitation order by recipient_email')).rows).toEqual(['a@example.test', 'b@example.test'].map(recipient_email => ({ recipient_email, role: 'member', issued_by: f.olivia.site.personId })));
  const { rows } = await t.db.query<{ client: string; leased: boolean }>('select client_id as client,lease_id is not null as leased from emba_audit where resource_id=any($1::uuid[])', [made.map(item => item.id)]);
  expect(rows).toEqual(Array(2).fill({ client: 'claude', leased: true }));
  for (const role of ['organizer', 'owner', 'follower'] as const) await refused(issueInvitations(t.db, f.olivia.agent, { ...scope(f.team), emails: ['c@example.test'], role, expiresAt: forever }), 'site_only');
  const target = { orgId: f.team.orgId, loopId: f.team.loopId, personId: f.mia.site.personId };
  await expect(grantRole(t.db, f.olivia.agent, { ...target, role: 'organizer' })).rejects.toThrow('forbidden');
  await expect(revokeRole(t.db, f.olivia.agent, target)).rejects.toThrow('forbidden');
  await expect(revokeMembership(t.db, f.olivia.agent, { orgId: f.team.orgId, personId: f.mia.site.personId })).rejects.toThrow('forbidden');
  expect((await t.db.query("select role from emba_role where person_id=$1 and revoked_at is null", [f.mia.site.personId])).rows).toEqual([{ role: 'member' }]);
  // The site records an invitation too.
  const onSite = await issueInvitation(t.db, f.omar.site, { ...scope(f.team), recipientEmail: 'd@example.test', role: 'member', expiresAt: forever });
  expect((await t.db.query('select client_id as client from emba_audit where resource_id=$1', [onSite.id])).rows).toEqual([{ client: null }]);
});

it('counts each organizing call once against the hourly limit of the top-level group, and gives a new group no allowance of its own', async () => {
  const f = await tree();
  await f.grant(f.olivia, f.team);
  const made = await createInnerGroup(t.db, f.olivia.agent, { orgId: f.team.orgId, parentLoopId: f.banking.loopId, name: 'Section B', description: '', slug: 'section-b' });
  await issueInvitations(t.db, f.olivia.agent, { ...scope(made), emails: ['a@example.test', 'b@example.test', 'c@example.test'], role: 'member', expiresAt: forever });
  // Two calls, two counts, both on the top-level group whichever group the call was for.
  expect((await t.db.query('select loop_id,client_id from emba_team_write')).rows).toEqual(Array(2).fill({ loop_id: f.team.loopId, client_id: 'claude' }));
  // The site is not limited, and its calls are not counted.
  await renameGroup(t.db, f.olivia.site, { ...scope(made), name: 'Section B, renamed' });
  expect((await t.db.query('select 1 from emba_team_write')).rows).toHaveLength(2);
  await t.db.query('insert into emba_team_write(org_id,loop_id,person_id,client_id) select $1,$2,$3,$4 from generate_series(1,$5::int)', [f.team.orgId, f.team.loopId, f.olivia.site.personId, 'claude', LIMITS.writesPerHour - 2]);
  await refused(createInnerGroup(t.db, f.olivia.agent, { orgId: f.team.orgId, parentLoopId: f.team.loopId, name: 'One more', description: '', slug: 'one-more' }), 'cap');
  await refused(issueInvitations(t.db, f.olivia.agent, { ...scope(f.team), emails: ['d@example.test'], role: 'member', expiresAt: forever }), 'cap');
  // A write in the group started this hour is refused as well: it brought no allowance with it.
  expect(await logDecision(t.db, f.olivia.agent, { ...scope(made), topic: 'late', statement: 'Too many.', newTopic: true })).toMatchObject({ saved: false, reason: 'cap', cap: 'writes_per_hour' });
  // Another person's assistant, and the same person on the site, have their own.
  await f.grant(f.omar, f.team);
  expect(await renameGroup(t.db, f.omar.agent, { ...scope(made), name: 'Section B' })).toMatchObject({ name: 'Section B' });
  expect(await logDecision(t.db, f.olivia.site, { ...scope(made), topic: 'on-site', statement: 'Fine.', newTopic: true })).toMatchObject({ saved: true });
});
