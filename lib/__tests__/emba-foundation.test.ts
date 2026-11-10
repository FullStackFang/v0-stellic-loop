import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';

describe('EMBA tenant foundation', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });

  async function fixture() {
    const person = await makePerson(t.db);
    const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization (name) values ('Cohort') returning id");
    await t.db.query('insert into emba_membership (org_id, person_id) values ($1,$2)', [org.id, person.id]);
    const { rows: [root] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path) values ($1,'emba') returning id", [org.id]);
    return { person, org, root };
  }

  it('maps one verified provider subject to one person without converting legacy people', async () => {
    const a = await makePerson(t.db), b = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer, subject, person_id, verified_at) values ('https://issuer.test','a',$1,now())", [a.id]);
    await expect(t.db.query("insert into emba_identity (issuer, subject, person_id, verified_at) values ('https://issuer.test','a',$1,now())", [b.id])).rejects.toThrow(/unique/i);
    expect((await t.db.query('select person_id from emba_identity')).rows).toEqual([{ person_id: a.id }]);
  });

  it('rejects cross-tenant parents and mismatched parent paths', async () => {
    const a = await fixture(), b = await fixture();
    await expect(t.db.query("insert into emba_loop (org_id,parent_id,path) values ($1,$2,'emba/vietnam')", [a.org.id,b.root.id])).rejects.toThrow(/foreign key/i);
    await expect(t.db.query("insert into emba_loop (org_id,parent_id,path) values ($1,$2,'other/vietnam')", [a.org.id,a.root.id])).rejects.toThrow(/foreign key/i);
    await t.db.query("insert into emba_loop (org_id,parent_id,path) values ($1,$2,'emba/vietnam')", [a.org.id,a.root.id]);
    await expect(t.db.query("update emba_loop set parent_id=id,path='emba/vietnam' where id=$1", [a.root.id])).rejects.toThrow();
  });

  it('requires role bindings to reference a membership and loop in the same tenant', async () => {
    const a = await fixture(), b = await fixture();
    await t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'member')", [a.org.id,a.root.id,a.person.id]);
    await expect(t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'owner')", [a.org.id,b.root.id,a.person.id])).rejects.toThrow(/foreign key/i);
    await expect(t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'owner')", [a.org.id,a.root.id,b.person.id])).rejects.toThrow(/foreign key/i);
  });

  it('bounds invitations and rejects cross-tenant issuers and scopes', async () => {
    const a = await fixture(), b = await fixture();
    const insert = (org: string, loop: string, issuer: string, expiry: string) => t.db.query(
      `insert into emba_invitation (org_id,loop_id,issued_by,recipient_email,role,token_hash,expires_at)
       values ($1,$2,$3,'member@example.test','member',repeat('a',64),$4)`, [org,loop,issuer,expiry]);
    await expect(insert(a.org.id,b.root.id,a.person.id,'2099-01-01')).rejects.toThrow(/foreign key/i);
    await expect(insert(a.org.id,a.root.id,b.person.id,'2099-01-01')).rejects.toThrow(/foreign key/i);
    await expect(insert(a.org.id,a.root.id,a.person.id,'2000-01-01')).rejects.toThrow(/check constraint/i);
    await insert(a.org.id,a.root.id,a.person.id,'2099-01-01');
    await expect(insert(a.org.id,a.root.id,a.person.id,'2099-01-01')).rejects.toThrow(/unique/i);
    await expect(t.db.query('update emba_invitation set accepted_at=now()')).rejects.toThrow(/check constraint/i);
  });

  it('does not expose foundation records to either public API role', async () => {
    await fixture();
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['emba_identity','emba_organization','emba_membership','emba_loop','emba_role','emba_invitation']) {
        await expect(t.db.tx(async q => {
          await q.query(`set local role ${role}`);
          await q.query(`select * from ${table}`);
        })).rejects.toThrow(/permission denied/i);
      }
    }
  });
});
