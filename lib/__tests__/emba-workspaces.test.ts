import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createWorkspace } from '@/lib/emba/workspaces';
import { grantLease, renewGroupReadLease } from '@/lib/emba/consent';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());

async function person(email: string, clientId: string | null = null) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email, clientId: clientId ?? undefined })))!;
}

it('atomically creates an isolated root, owner and unique address for an allowlisted first-party account', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const group = await createWorkspace(t.db, owner, { name: 'Study team', description: 'Private class resources', namespace: 'study-team' });
  expect(group).toMatchObject({ handle: '@study-team/workspace', orgName: 'Study team' });
  expect((await t.db.query('select description from emba_organization where id=$1', [group.orgId])).rows).toEqual([{ description: 'Private class resources' }]);
  expect((await t.db.query('select role from emba_role where org_id=$1 and loop_id=$2 and person_id=$3', [group.orgId, group.loopId, owner.personId])).rows).toEqual([{ role: 'owner' }]);
  expect((await t.db.query('select person_id from emba_membership where org_id=$1', [group.orgId])).rows).toEqual([{ person_id: owner.personId }]);
  await expect(createWorkspace(t.db, owner, { name: 'Other', description: '', namespace: 'study-team' })).rejects.toThrow('conflict');
  expect((await t.db.query('select id from emba_organization')).rows).toHaveLength(1);
});

it('denies nonallowlisted, unverified and delegated identities without creating a tenant', async () => {
  const outsider = await person('other@example.test');
  const delegated = await person('owner@example.test', 'claude');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', delegated.subject);
  for (const principal of [outsider, delegated, { ...delegated, clientId: null, verifiedEmail: null }]) {
    await expect(createWorkspace(t.db, principal, { name: 'Hidden', description: '', namespace: 'hidden' })).rejects.toThrow('forbidden');
  }
  expect((await t.db.query('select id from emba_organization')).rows).toHaveLength(0);
});

it('rolls back all records when audit storage fails', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const failing = { ...t.db, tx: <T>(fn: Parameters<typeof t.db.tx<T>>[0]) => t.db.tx(q => fn({ query: async <R>(sql: string, args?: unknown[]) => {
    if (sql.startsWith('insert into emba_audit')) throw new Error('audit unavailable');
    return q.query<R>(sql, args);
  } })) };
  await expect(createWorkspace(failing, owner, { name: 'Team', description: '', namespace: 'team' })).rejects.toThrow('audit unavailable');
  expect((await t.db.query('select id from emba_organization')).rows).toHaveLength(0);
});

it('renews only the owner of an exact group read lease and revokes the prior grant atomically', async () => {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const outsider = await person('other@example.test');
  const group = await createWorkspace(t.db, owner, { name: 'Team', description: '', namespace: 'team' });
  const lease = await grantLease(t.db, owner, { orgId: group.orgId, loopId: group.loopId, clientId: 'claude', actions: ['plan:read'], expiresAt: '2099-01-01T00:00:00Z' });
  await expect(renewGroupReadLease(t.db, outsider, lease.id)).rejects.toThrow('forbidden');
  await renewGroupReadLease(t.db, owner, lease.id);
  const { rows } = await t.db.query<{ id: string; revoked_at: string | null }>('select id,revoked_at from emba_lease order by created_at,id');
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.id === lease.id)?.revoked_at).not.toBeNull();
  expect(rows.find(row => row.id !== lease.id)?.revoked_at).toBeNull();
  await expect(renewGroupReadLease(t.db, owner, lease.id)).rejects.toThrow('forbidden');
});
