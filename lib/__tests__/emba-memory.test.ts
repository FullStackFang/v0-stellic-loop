import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticate } from '@/lib/emba/access';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { grantLease, revokeLease, listLeases, readAudit } from '@/lib/emba/consent';
import { listMemory, saveMemory } from '@/lib/emba/memory';
import { randomUUID } from 'node:crypto';

describe('private structured memory and delegated access', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });
  async function member(clientId?: string) {
    const person = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('https://test.example',$1::text,$2::uuid,now())", [person.id,person.id]);
    const principal = (await authenticate(t.db, 'credential', async () => ({ issuer: 'https://test.example', subject: person.id, expiresAt: Date.parse('2099-01-01'), clientId, scopes: ['memory:read','memory:write'] })))!;
    return { person, principal };
  }
  const want = () => ({ operationId: randomUUID(), kind: 'want' as const, text: 'Enjoy walking food tours', category: 'food' as const, place: 'Hanoi', strength: 0.8, confidence: 1 });

  it('saves only accepted structured fields, audits reads and isolates owners', async () => {
    const a = await member(), b = await member();
    const saved = await saveMemory(t.db,a.principal,want());
    const result = await listMemory(t.db,a.principal,{});
    expect(result.items).toEqual([expect.objectContaining({ id: saved.id, version: 1, text: 'Enjoy walking food tours', evidenceCount: 1, status: 'active' })]);
    expect((await listMemory(t.db,b.principal,{})).items).toEqual([]);
    expect((await t.db.query('select action from emba_audit where person_id=$1 and action=$2',[a.person.id,'memory:read'])).rows).toHaveLength(1);
    await expect(saveMemory(t.db,a.principal,{ ...want(), rawConversation: 'RAW_CANARY' })).rejects.toThrow();
    expect(JSON.stringify((await t.db.query('select * from emba_memory_version')).rows)).not.toContain('RAW_CANARY');
  });

  it('retries an operation once and rejects changed payload or stale corrections', async () => {
    const a = await member(), input = want();
    const first = await saveMemory(t.db,a.principal,input);
    expect(await saveMemory(t.db,a.principal,input)).toEqual(first);
    await expect(saveMemory(t.db,a.principal,{...input,text:'Different'})).rejects.toThrow('conflict');
    const corrected = await saveMemory(t.db,a.principal,{...want(),id:first.id,expectedVersion:1,text:'Prefer short food walks'});
    expect(corrected.version).toBe(2);
    await expect(saveMemory(t.db,a.principal,{...want(),id:first.id,expectedVersion:1})).rejects.toThrow('conflict');
    const rows = await t.db.query('select version,status,evidence_count from emba_memory_version order by version');
    expect(rows.rows).toEqual([{version:1,status:'superseded',evidence_count:1},{version:2,status:'active',evidence_count:1}]);
  });

  it('rejects cross-user edits without exposing existence and excludes archived memory', async () => {
    const a = await member(), b = await member();
    const first = await saveMemory(t.db,a.principal,want());
    await expect(saveMemory(t.db,b.principal,{...want(),id:first.id,expectedVersion:1})).rejects.toThrow('not_found');
    await saveMemory(t.db,a.principal,{...want(),id:first.id,expectedVersion:1,status:'archived'});
    expect((await listMemory(t.db,a.principal,{})).items).toEqual([]);
  });

  it('requires time bounds for intents and keeps context-specific preferences separate', async () => {
    const a = await member();
    await expect(saveMemory(t.db,a.principal,{...want(),kind:'intent'})).rejects.toThrow();
    await saveMemory(t.db,a.principal,{...want(),place:null});
    await saveMemory(t.db,a.principal,want());
    await saveMemory(t.db,a.principal,{...want(),kind:'intent',startsAt:'2000-01-01T00:00:00Z',endsAt:'2000-01-02T00:00:00Z'});
    expect((await listMemory(t.db,a.principal,{place:'Hanoi'})).items).toHaveLength(2);
    expect((await listMemory(t.db,a.principal,{place:'Tallinn'})).items).toHaveLength(1);
  });

  it('requires consent matching client, scopes and expiry, and rechecks revocation on later reads', async () => {
    const a = await member();
    await saveMemory(t.db,a.principal,want());
    const agent = (await authenticate(t.db,'agent',async () => ({ issuer:'https://test.example',subject:a.person.id,expiresAt:Date.parse('2099-01-01'),clientId:'claude-test',scopes:['memory:read'] })))!;
    await expect(listMemory(t.db,agent,{})).rejects.toThrow('forbidden');
    const lease = await grantLease(t.db,a.principal,{clientId:'claude-test',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
    expect((await listMemory(t.db,agent,{})).items).toHaveLength(1);
    await expect(saveMemory(t.db,agent,want())).rejects.toThrow('forbidden');
    await expect(grantLease(t.db,agent,{clientId:'claude-test',actions:['memory:write'],expiresAt:'2099-01-01T00:00:00Z'})).rejects.toThrow('forbidden');
    await revokeLease(t.db,a.principal,lease.id);
    await expect(listMemory(t.db,agent,{})).rejects.toThrow('forbidden');
  });

  it('does not let a write lease substitute for member review', async () => {
    const a = await member();
    const agent = (await authenticate(t.db,'agent',async () => ({ issuer:'https://test.example',subject:a.person.id,expiresAt:Date.parse('2099-01-01'),clientId:'writer',scopes:['memory:write'] })))!;
    await grantLease(t.db,a.principal,{clientId:'writer',actions:['memory:write'],expiresAt:'2099-01-01T00:00:00Z'});
    await expect(saveMemory(t.db,agent,want())).rejects.toThrow('forbidden');
    expect((await listMemory(t.db,a.principal,{})).items).toEqual([]);
  });

  it('rejects wrong clients, missing scopes, expired leases and revoked identities', async () => {
    const a = await member();
    const delegated = async (clientId: string, scopes = ['memory:read']) => (await authenticate(t.db,'token',async () => ({issuer:'https://test.example',subject:a.person.id,expiresAt:Date.parse('2099-01-01'),clientId,scopes})))!;
    const lease = await grantLease(t.db,a.principal,{clientId:'reader',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
    await expect(listMemory(t.db,await delegated('other'),{})).rejects.toThrow('forbidden');
    await expect(listMemory(t.db,await delegated('reader',[]),{})).rejects.toThrow('forbidden');
    const agent = await delegated('reader');
    await expect(listLeases(t.db,agent)).rejects.toThrow('forbidden');
    await expect(readAudit(t.db,agent)).rejects.toThrow('forbidden');
    await t.db.query("update emba_lease set created_at='2000-01-01',expires_at='2000-01-02' where id=$1",[lease.id]);
    await expect(listMemory(t.db,agent,{})).rejects.toThrow('forbidden');
    await grantLease(t.db,a.principal,{clientId:'reader',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
    await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[a.person.id]);
    await expect(listMemory(t.db,agent,{})).rejects.toThrow('forbidden');
  });

  it('keeps lease contexts exact and requires current loop membership', async () => {
    const a = await member();
    const {rows:[org]} = await t.db.query<{id:string}>("insert into emba_organization (name) values ('EMBA') returning id");
    const {rows:[loop]} = await t.db.query<{id:string}>("insert into emba_loop (org_id,path) values ($1,'emba') returning id",[org.id]);
    await t.db.query('insert into emba_membership (org_id,person_id) values ($1,$2)',[org.id,a.person.id]);
    await t.db.query("insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,'member')",[org.id,loop.id,a.person.id]);
    const context = {orgId:org.id,loopId:loop.id};
    await saveMemory(t.db,a.principal,{...want(),...context});
    const agent = (await authenticate(t.db,'token',async () => ({issuer:'https://test.example',subject:a.person.id,expiresAt:Date.parse('2099-01-01'),clientId:'reader',scopes:['memory:read']})))!;
    await grantLease(t.db,a.principal,{clientId:'reader',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z',...context});
    expect((await listMemory(t.db,agent,context)).items).toHaveLength(1);
    await expect(listMemory(t.db,agent,{})).rejects.toThrow('forbidden');
    await t.db.query('update emba_membership set revoked_at=now() where org_id=$1',[org.id]);
    await expect(listMemory(t.db,agent,context)).rejects.toThrow('forbidden');
  });

  it('fails private output if the audit cannot be committed', async () => {
    const a = await member();
    await saveMemory(t.db,a.principal,want());
    await t.db.query("alter table emba_audit add constraint simulated_failure check (action <> 'memory:read')");
    try { await expect(listMemory(t.db,a.principal,{})).rejects.toThrow(); }
    finally { await t.db.query('alter table emba_audit drop constraint simulated_failure'); }
  });

  it('rolls back lease grants and memory writes when auditing fails', async () => {
    const a = await member();
    await t.db.query("alter table emba_audit add constraint simulated_failure check (action not in ('lease:grant','memory:write'))");
    try {
      await expect(grantLease(t.db,a.principal,{clientId:'reader',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'})).rejects.toThrow();
      await expect(saveMemory(t.db,a.principal,want())).rejects.toThrow();
      expect((await t.db.query('select id from emba_lease')).rows).toEqual([]);
      expect((await t.db.query('select id from emba_memory')).rows).toEqual([]);
    } finally { await t.db.query('alter table emba_audit drop constraint simulated_failure'); }
  });
});
