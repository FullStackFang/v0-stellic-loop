import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticate, type Principal } from '@/lib/emba/access';
import { createActivity, saveCommitment, setDependencyConsent } from '@/lib/emba/activities';
import { grantRole, listMyLoops, listScopedRoles, revokeMembership, revokeRole } from '@/lib/emba/roles';
import { makePerson, openTestDb, type TestDb } from '@/test/db';

describe('EMBA role and membership management', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });

  async function person() {
    const row = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1,$2,now())", [row.id, row.id]);
    return (await authenticate(t.db, 'credential', async () => ({ issuer: 'test', subject: row.id, expiresAt: Date.now() + 60000 })))!;
  }
  async function fixture() {
    const owner = await person(), organizer = await person(), member = await person(), follower = await person();
    const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization (name) values ('Test') returning id");
    const { rows: [root] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path) values ($1,'trip') returning id", [org.id]);
    const { rows: [child] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path,parent_id) values ($1,'trip/child',$2) returning id", [org.id, root.id]);
    for (const [p, role] of [[owner, 'owner'], [organizer, 'organizer'], [member, 'member'], [follower, 'follower']] as const) {
      await t.db.query('insert into emba_membership (org_id,person_id) values ($1,$2)', [org.id, p.personId]);
      await t.db.query('insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,$4)', [org.id, root.id, p.personId, role]);
    }
    return { owner, organizer, member, follower, orgId: org.id, rootId: root.id, loopId: child.id };
  }
  const scope = (f: Awaited<ReturnType<typeof fixture>>, personId: string) => ({ orgId: f.orgId, loopId: f.loopId, personId });

  it('lists only current accessible trip contexts and gives managers a scoped role directory', async () => {
    const f = await fixture();
    const other = await fixture();
    expect((await listMyLoops(t.db, f.member)).map(loop => loop.loopId)).toEqual([f.rootId, f.loopId]);
    expect((await listMyLoops(t.db, f.member)).some(loop => loop.orgId === other.orgId)).toBe(false);
    await expect(listScopedRoles(t.db, f.follower, f.orgId, f.loopId)).rejects.toThrow('forbidden');
    expect((await listScopedRoles(t.db, f.organizer, f.orgId, f.loopId)).map(role => role.personId)).toContain(f.member.personId);
    await t.db.query('update emba_membership set revoked_at=now() where org_id=$1 and person_id=$2', [f.orgId, f.member.personId]);
    expect(await listMyLoops(t.db, f.member)).toEqual([]);
  });

  it('limits grants and revokes to current scoped authority and active invited memberships', async () => {
    const f = await fixture();
    const target = scope(f, f.member.personId);
    await expect(grantRole(t.db, f.follower, { ...target, role: 'member' })).rejects.toThrow('forbidden');
    await expect(revokeRole(t.db, f.follower, target)).rejects.toThrow('forbidden');
    await expect(grantRole(t.db, f.organizer, { ...target, role: 'organizer' })).rejects.toThrow('forbidden');
    await grantRole(t.db, f.organizer, { ...target, role: 'member' });
    await grantRole(t.db, f.owner, { ...target, role: 'organizer' });
    await expect(revokeRole(t.db, f.organizer, target)).rejects.toThrow('forbidden');
    await revokeRole(t.db, f.owner, target);
    const outsider = await person();
    await expect(grantRole(t.db, f.owner, { ...target, personId: outsider.personId, role: 'member' })).rejects.toThrow('forbidden');
  });

  it('does not grant ancestors or cross-tenant roles and rejects stale or delegated identity', async () => {
    const f = await fixture();
    const other = await fixture();
    const target = scope(f, f.member.personId);
    await expect(grantRole(t.db, f.owner, { ...target, orgId: other.orgId, loopId: other.loopId, role: 'member' })).rejects.toThrow('forbidden');
    await expect(grantRole(t.db, f.owner, { ...target, loopId: other.loopId, role: 'member' })).rejects.toThrow('forbidden');
    const delegated = (await authenticate(t.db, 'credential', async () => ({ issuer: 'test', subject: f.owner.subject, expiresAt: Date.now() + 60000, clientId: 'agent' })))!;
    await expect(grantRole(t.db, delegated, { ...target, role: 'member' })).rejects.toThrow('forbidden');
    await expect(grantRole(t.db, { ...f.owner, personId: f.member.personId } as Principal, { ...target, role: 'member' })).rejects.toThrow('forbidden');
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [f.member.personId]);
    await expect(grantRole(t.db, f.owner, { ...target, role: 'member' })).rejects.toThrow('forbidden');
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [f.owner.personId]);
    await expect(revokeRole(t.db, f.owner, target)).rejects.toThrow('forbidden');
  });

  it('keeps inherited access when a direct role is revoked and suspends dependencies only after eligibility is gone', async () => {
    const f = await fixture();
    await grantRole(t.db, f.owner, { ...scope(f, f.member.personId), role: 'member' });
    const activity = await createActivity(t.db, f.owner, { orgId: f.orgId, loopId: f.loopId, title: 'Walk', place: 'Hanoi', timezone: 'Asia/Ho_Chi_Minh', startsAt: '2099-02-02T12:00:00Z', endsAt: '2099-02-02T14:00:00Z', deadline: '2099-02-01T12:00:00Z' });
    await setDependencyConsent(t.db, f.member, activity.id, 1, f.owner.personId, true);
    await saveCommitment(t.db, f.owner, { activityId: activity.id, revision: 1, operationId: randomUUID(), minOthers: 0, requires: [f.member.personId] });
    await revokeRole(t.db, f.owner, scope(f, f.member.personId));
    expect((await t.db.query<{ status: string }>('select status from emba_commitment where activity_id=$1 and person_id=$2', [activity.id, f.owner.personId])).rows[0].status).toBe('active');
    await revokeRole(t.db, f.owner, { ...scope(f, f.member.personId), loopId: f.rootId });
    expect((await t.db.query<{ status: string }>('select status from emba_commitment where activity_id=$1 and person_id=$2', [activity.id, f.owner.personId])).rows[0].status).toBe('suspended');
  });

  it('allows owner removal and self-leave while preserving the last active root owner', async () => {
    const f = await fixture();
    await expect(revokeRole(t.db, f.owner, { ...scope(f, f.owner.personId), loopId: f.rootId })).rejects.toThrow('forbidden');
    await expect(revokeMembership(t.db, f.owner, { orgId: f.orgId, personId: f.owner.personId })).rejects.toThrow('forbidden');
    await expect(revokeMembership(t.db, f.organizer, { orgId: f.orgId, personId: f.member.personId })).rejects.toThrow('forbidden');
    await revokeMembership(t.db, f.member, { orgId: f.orgId, personId: f.member.personId });
    expect((await t.db.query<{ revoked_at: string | null }>('select revoked_at from emba_membership where org_id=$1 and person_id=$2', [f.orgId, f.member.personId])).rows[0].revoked_at).not.toBeNull();
    await grantRole(t.db, f.owner, { orgId: f.orgId, loopId: f.rootId, personId: f.organizer.personId, role: 'owner' });
    await revokeMembership(t.db, f.owner, { orgId: f.orgId, personId: f.owner.personId });
  });
});
