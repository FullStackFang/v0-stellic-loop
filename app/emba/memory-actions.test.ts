import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { setDb } from '@/lib/db';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { grantConnection, savePreference } from './actions';
import { readScopedMemory } from './data';
import { acceptWantProposal, reviewWantProposal } from './memory-review-actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('portal memory and assistant scope actions', () => {
  let t: TestDb;
  beforeAll(async () => { t = await openTestDb(); setDb(t.db); });
  afterAll(async () => { setDb(null); await t?.close(); });
  beforeEach(async () => { await t.reset(); });

  async function fixture() {
    const person = await makePerson(t.db);
    await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1,$2,now())", [person.id,person.id]);
    const principal = (await authenticate(t.db,'credential',async()=>({issuer:'test',subject:person.id,expiresAt:Date.now()+60000})))!;
    const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values ('EMBA') returning id");
    const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values ($1,'trip') returning id",[org.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values ($1,$2)',[org.id,person.id]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values ($1,$2,$3,'member')",[org.id,loop.id,person.id]);
    return {principal,orgId:org.id,loopId:loop.id};
  }
  function memoryForm(scope:{orgId:string|null;loopId:string|null},kind:'want'|'intent'='intent') {
    const data=new FormData();
    for(const [key,value] of Object.entries({operationId:randomUUID(),kind,text:'Quiet gallery visit',category:'culture',place:'',strength:'0.7',status:'active',orgId:scope.orgId??'',loopId:scope.loopId??'',startsAt:kind==='intent'?'2099-03-01T10:00:00':'',endsAt:kind==='intent'?'2099-03-01T11:00:00':''})) data.set(key,value);
    return data;
  }

  it('creates and corrects a time-boxed trip intent without moving its scope or kind', async () => {
    const f=await fixture(), scope={orgId:f.orgId,loopId:f.loopId};
    const create=memoryForm(scope);
    expect((await withPortalTestSession(f.principal,()=>savePreference({status:'idle',message:''},create))).status).toBe('success');
    expect((await readScopedMemory(f.principal,null,null)).items).toEqual([]);
    const original=(await readScopedMemory(f.principal,f.orgId,f.loopId)).items[0];
    expect(original).toMatchObject({kind:'intent',startsAt:'2099-03-01T10:00:00.000Z'});
    const correction=memoryForm(scope); correction.set('id',original.id); correction.set('expectedVersion','1'); correction.set('text','Earlier gallery visit');
    expect((await withPortalTestSession(f.principal,()=>savePreference({status:'idle',message:''},correction))).status).toBe('success');
    for(const [key,value] of [['orgId',''],['kind','want']] as const) {
      const forged=memoryForm(scope); forged.set('id',original.id); forged.set('expectedVersion','2'); forged.set(key,value);
      expect((await withPortalTestSession(f.principal,()=>savePreference({status:'idle',message:''},forged))).status).toBe('error');
    }
    expect((await readScopedMemory(f.principal,f.orgId,f.loopId)).items[0]).toMatchObject({version:2,kind:'intent',text:'Earlier gallery visit'});
  });

  it('rejects malformed UTC bounds and unauthorized assistant scope selection', async () => {
    const f=await fixture(), scope={orgId:f.orgId,loopId:f.loopId};
    for(const [start,end] of [['2099-02-30T10:00:00','2099-03-01T11:00:00'],['2099-03-01T11:00:00','2099-03-01T10:00:00']]) {
      const data=memoryForm(scope); data.set('startsAt',start); data.set('endsAt',end);
      expect((await withPortalTestSession(f.principal,()=>savePreference({status:'idle',message:''},data))).status).toBe('error');
    }
    expect((await readScopedMemory(f.principal,f.orgId,f.loopId)).items).toEqual([]);
    const grant=new FormData(); grant.set('clientId','assistant'); grant.set('actions','memory:read'); grant.set('expiresAt','2099-03-01T10:00');
    grant.set('scope',`${f.orgId}:${f.loopId}`);
    expect((await withPortalTestSession(f.principal,()=>grantConnection({status:'idle',message:''},grant))).status).toBe('success');
    grant.set('scope',`${randomUUID()}:${randomUUID()}`);
    expect((await withPortalTestSession(f.principal,()=>grantConnection({status:'idle',message:''},grant))).status).toBe('error');
    expect((await t.db.query('select id from emba_lease')).rows).toHaveLength(1);
  });

  it('keeps structured proposals transient until an explicit reviewed acceptance', async () => {
    const f=await fixture();
    const candidate={kind:'want',text:'Transient museum preference',category:'culture',place:null,strength:0.6,confidence:0.8,orgId:null,loopId:null};
    const proposed=new FormData(); proposed.set('candidate',JSON.stringify(candidate));
    const review=await withPortalTestSession(f.principal,()=>reviewWantProposal({status:'idle',message:''},proposed));
    expect(review.memoryReview?.outcome).toBe('new');
    expect((await t.db.query('select id from emba_memory')).rows).toEqual([]);
    const accept=new FormData(); accept.set('binding',review.memoryReview!.binding); accept.set('operationId',review.memoryReview!.operationId);
    expect((await withPortalTestSession(f.principal,()=>acceptWantProposal({status:'idle',message:''},accept))).status).toBe('error');
    expect((await t.db.query('select id from emba_memory')).rows).toEqual([]);
    accept.set('reviewed','yes');
    expect((await withPortalTestSession(f.principal,()=>acceptWantProposal({status:'idle',message:''},accept))).status).toBe('success');
    expect((await readScopedMemory(f.principal,null,null)).items[0].text).toBe(candidate.text);
    proposed.set('candidate',JSON.stringify({...candidate,rawConversation:'Never persist this raw canary'}));
    expect((await withPortalTestSession(f.principal,()=>reviewWantProposal({status:'idle',message:''},proposed))).status).toBe('error');
    expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain('Never persist this raw canary');
  });

  it('rejects oversized UTF-8 proposal and acceptance payloads before database work', async () => {
    const f=await fixture();
    const tx=vi.spyOn(t.db,'tx');
    try {
      const oversized=JSON.stringify({kind:'want',text:'Museum visit',category:'culture',place:null,strength:0.6,confidence:0.8,orgId:null,loopId:null}).padEnd(5000,' ');
      const review=new FormData(); review.set('candidate',oversized);
      expect((await withPortalTestSession(f.principal,()=>reviewWantProposal({status:'idle',message:''},review))).status).toBe('error');
      const accept=new FormData(); accept.set('binding',oversized); accept.set('reviewed','yes'); accept.set('operationId',randomUUID());
      expect((await withPortalTestSession(f.principal,()=>acceptWantProposal({status:'idle',message:''},accept))).status).toBe('error');
      expect(tx).not.toHaveBeenCalled();
    } finally { tx.mockRestore(); }
  });
});
