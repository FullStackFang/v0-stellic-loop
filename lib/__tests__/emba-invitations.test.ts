import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import type {Db} from '@/lib/db';
import { acceptInvitation, issueInvitation, listInvitations, revokeInvitation } from '@/lib/emba/invitations';

describe('EMBA first-party invitations', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });

  async function person(email: string | null, clientId: string | null = null) {
    const row = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1,$2,now())", [row.id, row.id]);
    return (await authenticate(t.db, 'credential', async () => ({ issuer: 'test', subject: row.id, expiresAt: Date.now() + 60000, verifiedEmail: email ?? undefined, clientId: clientId ?? undefined })))!;
  }

  async function fixture(role = 'owner') {
    const owner = await person('owner@example.test');
    const recipient = await person('recipient@example.test');
    const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization (name) values ('Test') returning id");
    const { rows: [loop] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path) values ($1,'root') returning id", [org.id]);
    const { rows: [child] } = await t.db.query<{ id: string }>("insert into emba_loop (org_id,path,parent_id) values ($1,'root/child',$2) returning id", [org.id, loop.id]);
    await t.db.query('insert into emba_membership (org_id,person_id) values ($1,$2)', [org.id, owner.personId]);
    await t.db.query('insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,$4)', [org.id, loop.id, owner.personId, role]);
    const input = { orgId: org.id, loopId: child.id, recipientEmail: ' Recipient@Example.Test ', role: 'member' as const, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    return { owner, recipient, org: org.id, root: loop.id, loop: child.id, input };
  }

  it('issues hashed tokens and explicitly enrolls only the verified recipient once', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    const { rows: [stored] } = await t.db.query('select * from emba_invitation where id=$1', [invitation.id]);
    expect(stored.token_hash).not.toBe(invitation.token);
    expect(stored.recipient_email).toBe('recipient@example.test');
    expect((await t.db.query('select * from emba_membership where person_id=$1', [f.recipient.personId])).rows).toEqual([]);
    await acceptInvitation(t.db, f.recipient, invitation.token);
    expect((await t.db.query('select role from emba_role where person_id=$1', [f.recipient.personId])).rows).toEqual([{ role: 'member' }]);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
  });

  it('audits invitation metadata reads and fails closed when the audit cannot persist',async()=>{
    const f=await fixture();await issueInvitation(t.db,f.owner,f.input);
    await listInvitations(t.db,f.owner,f.org,f.loop);
    expect((await t.db.query('select resource_id from emba_audit where person_id=$1 and action=$2',[f.owner.personId,'plan:read'])).rows).toEqual([{resource_id:f.loop}]);
    const failedAudit:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
      if(sql.startsWith('insert into emba_audit'))throw new Error('audit unavailable');
      return q.query<T>(sql,params);
    }}))};
    await expect(listInvitations(failedAudit,f.owner,f.org,f.loop)).rejects.toThrow('audit unavailable');
  });

  it('denies wrong recipients, unverified email, forged principals, and delegated clients without consuming the token', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    for (const p of [await person('wrong@example.test'), await person(null), await person('recipient@example.test', 'assistant'), { ...f.recipient, personId: f.owner.personId } as Principal, null]) {
      await expect(acceptInvitation(t.db, p, invitation.token)).rejects.toThrow();
    }
    expect((await t.db.query('select accepted_at from emba_invitation where id=$1', [invitation.id])).rows[0].accepted_at).toBeNull();
    await acceptInvitation(t.db, f.recipient, invitation.token);
  });

  it('denies unverified legacy identities without creating identity mappings', async () => {
    const legacy = await makePerson(t.db);
    expect(await authenticate(t.db, 'credential', async () => ({ issuer: 'test', subject: legacy.id, verifiedEmail: 'recipient@example.test', expiresAt: Date.now() + 60000 }))).toBeNull();
    expect((await t.db.query('select * from emba_identity where person_id=$1', [legacy.id])).rows).toEqual([]);
  });

  it('allows inherited management but restricts organizer and owner delegation', async () => {
    const f = await fixture('organizer');
    await issueInvitation(t.db, f.owner, f.input);
    for (const role of ['organizer', 'owner'] as const) await expect(issueInvitation(t.db, f.owner, { ...f.input, role })).rejects.toThrow();
    await t.db.query("update emba_role set role='owner' where person_id=$1", [f.owner.personId]);
    await issueInvitation(t.db, f.owner, { ...f.input, role: 'organizer' });
    await issueInvitation(t.db, f.owner, { ...f.input, role: 'owner' });
  });

  it('denies management by followers, members, delegated clients and unrelated tenants', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    const delegated = (await authenticate(t.db, 'credential', async () => ({ issuer: f.owner.issuer, subject: f.owner.subject, expiresAt: Date.now() + 60000, verifiedEmail: 'owner@example.test', clientId: 'assistant' })))!;
    for (const p of [f.recipient, delegated, null]) {
      await expect(issueInvitation(t.db, p, f.input)).rejects.toThrow();
      await expect(listInvitations(t.db, p, f.org, f.loop)).rejects.toThrow();
      await expect(revokeInvitation(t.db, p, invitation.id)).rejects.toThrow();
    }
    const other = await fixture();
    await expect(issueInvitation(t.db, f.owner, { ...f.input, loopId: other.loop })).rejects.toThrow();
    for (const role of ['member', 'follower']) {
      await t.db.query('update emba_role set role=$1 where person_id=$2', [role, f.owner.personId]);
      await expect(issueInvitation(t.db, f.owner, f.input)).rejects.toThrow();
    }
  });

  it('lists without token hashes and revokes pending invitations', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    const rows = await listInvitations(t.db, f.owner, f.org, f.loop);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('token_hash');
    expect(rows[0]).not.toHaveProperty('token');
    await revokeInvitation(t.db, f.owner, invitation.id);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
  });

  it.each(['identity', 'membership', 'role'])('rechecks revoked issuer %s at acceptance', async kind => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    await t.db.query(`update emba_${kind} set revoked_at=now() where person_id=$1`, [f.owner.personId]);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
    expect((await t.db.query('select * from emba_membership where person_id=$1', [f.recipient.personId])).rows).toEqual([]);
  });

  it('rejects issuer demotion before privileged invitation acceptance', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, { ...f.input, role: 'organizer' });
    await t.db.query("update emba_role set role='organizer' where person_id=$1", [f.owner.personId]);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
  });

  it('rechecks the recipient identity and expiry, and accepts normalized trusted email', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [f.recipient.personId]);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
    await t.db.query('update emba_identity set revoked_at=null where person_id=$1', [f.recipient.personId]);
    await expect(acceptInvitation(t.db, { ...f.recipient, expiresAt: 0 }, invitation.token)).rejects.toThrow();
    const normalized = (await authenticate(t.db, 'credential', async () => ({ issuer: f.recipient.issuer, subject: f.recipient.subject, expiresAt: Date.now() + 60000, verifiedEmail: ' RECIPIENT@EXAMPLE.TEST ' })))!;
    await acceptInvitation(t.db, normalized, invitation.token);
  });

  it('rejects expired invitations and malformed issue inputs', async () => {
    const f = await fixture();
    for (const input of [{ ...f.input, expiresAt: 'invalid' }, { ...f.input, expiresAt: '2000-01-01' }, { ...f.input, recipientEmail: 'not-email' }, { ...f.input, role: 'administrator' }]) {
      await expect(issueInvitation(t.db, f.owner, input as typeof f.input)).rejects.toThrow();
    }
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    await t.db.query("update emba_invitation set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1", [invitation.id]);
    await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
  });

  it('keeps stronger existing roles and never revives stale roles after membership removal', async () => {
    const f = await fixture();
    await t.db.query('insert into emba_membership (org_id,person_id) values ($1,$2)', [f.org, f.recipient.personId]);
    await t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'owner'),($1,$4,$3,'owner')", [f.org, f.loop, f.recipient.personId, f.root]);
    await acceptInvitation(t.db, f.recipient, (await issueInvitation(t.db, f.owner, f.input)).token);
    expect((await t.db.query('select role from emba_role where person_id=$1 and loop_id=$2', [f.recipient.personId, f.loop])).rows[0].role).toBe('owner');
    await t.db.query('update emba_membership set revoked_at=now() where person_id=$1', [f.recipient.personId]);
    await acceptInvitation(t.db, f.recipient, (await issueInvitation(t.db, f.owner, f.input)).token);
    expect((await t.db.query('select role from emba_role where person_id=$1 and revoked_at is null', [f.recipient.personId])).rows).toEqual([{ role: 'member' }]);
  });

  it('rolls back membership and token consumption when role persistence fails', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    await t.db.query("alter table emba_role add constraint reject_invited_member check (role <> 'member')");
    try {
      await expect(acceptInvitation(t.db, f.recipient, invitation.token)).rejects.toThrow();
      expect((await t.db.query('select * from emba_membership where person_id=$1', [f.recipient.personId])).rows).toEqual([]);
      expect((await t.db.query('select accepted_at from emba_invitation where id=$1', [invitation.id])).rows[0].accepted_at).toBeNull();
    } finally { await t.db.query('alter table emba_role drop constraint reject_invited_member'); }
  });

  it('allows only one successful consumption when acceptance calls compete', async () => {
    const f = await fixture();
    const invitation = await issueInvitation(t.db, f.owner, f.input);
    const results = await Promise.allSettled([acceptInvitation(t.db, f.recipient, invitation.token), acceptInvitation(t.db, f.recipient, invitation.token)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await t.db.query('select * from emba_role where person_id=$1', [f.recipient.personId])).rows).toHaveLength(1);
  });
});
