import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, canAccessLoop, canAccessPersonal, type Principal } from '@/lib/emba/access';

describe('EMBA current authority', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });

  async function fixture(role = 'member') {
    const person = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('https://identity.test',$1,$2,now())", [person.id,person.id]);
    // Deterministic verifier models the provider boundary; it is not OAuth acceptance evidence.
    const principal = (await authenticate(t.db, 'verified-credential', async credential => credential === 'verified-credential' ? { issuer: 'https://identity.test', subject: person.id, expiresAt: Date.parse('2099-01-01') } : null))!;
    const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization (name) values ('EMBA') returning id");
    await t.db.query('insert into emba_membership (org_id,person_id) values ($1,$2)', [org.id,person.id]);
    const { rows: [root] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path) values ($1,'emba') returning id", [org.id]);
    const { rows: [child] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,parent_id,path) values ($1,$2,'emba/vietnam') returning id", [org.id,root.id]);
    await t.db.query('insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,$4)', [org.id,root.id,person.id,role]);
    return { person, principal, org: org.id, root: root.id, child: child.id };
  }

  it('refuses unverified credentials, unmapped identities and forged principals', async () => {
    const a = await fixture();
    expect(await authenticate(t.db, a.person.id, async () => null)).toBeNull();
    expect(await authenticate(t.db, 'unknown', async () => ({ issuer: 'https://other.test', subject: a.person.id, expiresAt: Date.parse('2099-01-01') }))).toBeNull();
    expect(await authenticate(t.db, 'expired', async () => ({ issuer: 'https://identity.test', subject: a.person.id, expiresAt: 0 }))).toBeNull();
    expect(await canAccessLoop(t.db, { personId: a.person.id } as Principal, a.org, a.root, 'read')).toBe(false);
  });

  it.each([
    ['follower', true, false, false, false, false],
    ['member', true, true, true, false, false],
    ['organizer', true, true, true, true, false],
    ['owner', true, true, true, true, true],
  ])('inherits %s authority down the tree', async (role, read, post, commit, manage, delegate) => {
    const a = await fixture(String(role));
    const actions = ['read','post','commit','manage','delegate_organizer'] as const;
    for (const [i, action] of actions.entries()) {
      expect(await canAccessLoop(t.db,a.principal,a.org,a.child,action)).toBe([read,post,commit,manage,delegate][i]);
    }
  });

  it('does not inherit upward or across tenants', async () => {
    const a = await fixture(), b = await fixture();
    await t.db.query('update emba_role set loop_id=$1 where org_id=$2', [a.child,a.org]);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'read')).toBe(true);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.root,'read')).toBe(false);
    expect(await canAccessLoop(t.db,a.principal,b.org,b.child,'read')).toBe(false);
    expect(await canAccessLoop(t.db,a.principal,a.org,b.child,'read')).toBe(false);
  });

  it('uses the strongest remaining grant and denies after the last grant or membership is removed', async () => {
    const a = await fixture();
    await t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'follower')", [a.org,a.child,a.person.id]);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'commit')).toBe(true);
    await t.db.query('update emba_role set revoked_at=now() where loop_id=$1', [a.child]);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'commit')).toBe(true);
    await t.db.query('update emba_role set revoked_at=now() where loop_id=$1', [a.root]);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'read')).toBe(false);
    await t.db.query('update emba_role set revoked_at=null');
    await t.db.query('update emba_membership set revoked_at=now() where org_id=$1', [a.org]);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'read')).toBe(false);
    expect(await canAccessPersonal(t.db,a.principal,a.person.id)).toBe(true);
  });

  it('keeps personal ownership independent of organization roles and rechecks identity revocation', async () => {
    const a = await fixture('owner'), b = await fixture();
    expect(await canAccessPersonal(t.db,a.principal,a.person.id)).toBe(true);
    expect(await canAccessPersonal(t.db,a.principal,b.person.id)).toBe(false);
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [a.person.id]);
    expect(await canAccessPersonal(t.db,a.principal,a.person.id)).toBe(false);
    expect(await canAccessLoop(t.db,a.principal,a.org,a.child,'read')).toBe(false);
  });
});
