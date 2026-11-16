// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { counting } from '@/test/team-seed';
import { authenticate, type Principal } from '@/lib/emba/access';
import { grantLease, revokeLease } from '@/lib/emba/consent';
import { createInnerGroup } from '@/lib/emba/group-tree';
import { listGroups, type GroupAddress } from '@/lib/emba/groups';
import { teamState } from '@/lib/emba/team-read';
import { logDecision } from '@/lib/emba/team-records';
import { createWorkspace } from '@/lib/emba/workspaces';

// Spec: openspec/changes/loop-organize-and-fix/specs/team-wide-grants.
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
/** Team 1 holding NBAE 6561 and NBAE 6830, with Ana a member of the team and her assistant signed in. */
async function tree() {
  const owner = (await person('Owner')).site;
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const team = await createWorkspace(t.db, owner, { name: 'Team 1', description: '', namespace: 'team-1' });
  const inner = (name: string, slug: string) => createInnerGroup(t.db, owner, { orgId: team.orgId, parentLoopId: team.loopId, name, description: '', slug });
  const banking = await inner('NBAE 6561', 'nbae-6561'), venture = await inner('NBAE 6830', 'nbae-6830');
  const ana = await person('Ana');
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [team.orgId, ana.site.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [team.orgId, team.loopId, ana.site.personId]);
  const grant = (group: GroupAddress, actions: string[]) => grantLease(t.db, ana.site, { ...scope(group), clientId: 'claude', actions, expiresAt: forever });
  return { owner, team, banking, venture, ana: ana.site, agent: ana.agent, grant, inner };
}
const listed = async (p: Principal) => (await listGroups(t.db, p, {})).map(group => group.handle);
const reads = (p: Principal, group: GroupAddress) => teamState(t.db, p, scope(group));
let topic = 0;
const writes = (p: Principal, group: GroupAddress) => logDecision(t.db, p, { ...scope(group), topic: `topic-${++topic}`, statement: 'Decided.', newTopic: true });

it('reaches the groups inside the granted team, and one started later, with a single grant', async () => {
  const f = await tree();
  expect(await listed(f.agent)).toEqual([]);
  await f.grant(f.team, WRITE);
  expect(await listed(f.agent)).toEqual(['@team-1/nbae-6561', '@team-1/nbae-6830', '@team-1/workspace']);
  expect(await reads(f.agent, f.banking)).toMatchObject({ team: { handle: '@team-1/nbae-6561' } });
  expect(await writes(f.agent, f.banking)).toMatchObject({ saved: true });
  const later = await f.inner('NBAE 6900', 'nbae-6900');
  expect(await listed(f.agent)).toContain('@team-1/nbae-6900');
  expect(await writes(f.agent, later)).toMatchObject({ saved: true });
  expect((await t.db.query('select 1 from emba_lease')).rows).toHaveLength(1);
});

it('reaches nothing above or beside the granted group', async () => {
  const f = await tree();
  await f.grant(f.banking, WRITE);
  expect(await listed(f.agent)).toEqual(['@team-1/nbae-6561']);
  expect(await reads(f.agent, f.banking)).toMatchObject({ team: { name: 'NBAE 6561' } });
  for (const closed of [f.team, f.venture]) {
    await expect(reads(f.agent, closed)).rejects.toThrow('forbidden');
    await expect(writes(f.agent, closed)).rejects.toThrow('forbidden');
  }
});

it('allows an action when any covering grant allows it, with no order between grants', async () => {
  const f = await tree();
  await f.grant(f.team, WRITE); await f.grant(f.banking, READ);
  expect(await writes(f.agent, f.banking)).toMatchObject({ saved: true });
  await t.db.query('update emba_lease set revoked_at=clock_timestamp()');
  await f.grant(f.team, READ); await f.grant(f.banking, WRITE);
  expect(await writes(f.agent, f.banking)).toMatchObject({ saved: true });
  for (const readOnly of [f.team, f.venture]) {
    expect(await reads(f.agent, readOnly)).toMatchObject({ team: expect.anything() });
    await expect(writes(f.agent, readOnly)).rejects.toThrow('forbidden');
  }
});

it('ends the reach when the grant is revoked or runs out, and keeps a grant made on a group of its own', async () => {
  const f = await tree();
  const onTeam = await f.grant(f.team, READ);
  await f.grant(f.banking, READ);
  await revokeLease(t.db, f.ana, onTeam.id);
  expect(await listed(f.agent)).toEqual(['@team-1/nbae-6561']);
  await expect(reads(f.agent, f.venture)).rejects.toThrow('forbidden');
  const again = await f.grant(f.team, READ);
  expect(await listed(f.agent)).toHaveLength(3);
  await t.db.query("update emba_lease set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 second' where id=$1", [again.id]);
  expect(await listed(f.agent)).toEqual(['@team-1/nbae-6561']);
  await expect(reads(f.agent, f.team)).rejects.toThrow('forbidden');
});

it('does not outlive the access of the person who gave it', async () => {
  const f = await tree();
  await f.grant(f.team, WRITE);
  // The role goes without the grant being touched: the grant alone opens nothing.
  await t.db.query('update emba_role set revoked_at=clock_timestamp() where person_id=$1', [f.ana.personId]);
  expect((await t.db.query('select 1 from emba_lease where revoked_at is null')).rows).toHaveLength(1);
  expect(await listed(f.agent)).toEqual([]);
  for (const group of [f.team, f.banking, f.venture]) await expect(reads(f.agent, group)).rejects.toThrow('forbidden');
});

it('does not let a grant in one team reach a group of another', async () => {
  const f = await tree();
  const other = await createWorkspace(t.db, f.owner, { name: 'Other', description: '', namespace: 'other' });
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [other.orgId, f.ana.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [other.orgId, other.loopId, f.ana.personId]);
  await f.grant(f.team, WRITE);
  expect(await listed(f.agent)).not.toContain('@other/workspace');
  await expect(reads(f.agent, other)).rejects.toThrow('forbidden');
});

it('spends no more statements on an assistant call under a team grant than under a grant on the group itself', async () => {
  const f = await tree();
  const c = counting(t.db);
  await f.grant(f.banking, WRITE);
  // Each is measured in a class nothing has been written to, so the two differ only in where the grant was made.
  const spent = async (group: GroupAddress) => ({ read: await c.of(db => teamState(db, f.agent, scope(group))), write: await c.of(db => logDecision(db, f.agent, { ...scope(group), topic: 'first', statement: 'Decided.', newTopic: true })) });
  const exact = await spent(f.banking);
  await t.db.query('update emba_lease set revoked_at=clock_timestamp()');
  await f.grant(f.team, WRITE);
  const covered = await spent(f.venture);
  expect(covered).toEqual(exact);
  // Before grants covered the groups inside (2026-11-16) the same read and write took these many.
  expect(exact).toEqual(BEFORE);
});
const BEFORE = { read: 13, write: 49 };
