import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticate } from '@/lib/emba/access';
import { acceptMemoryCandidate, reviewMemoryCandidate } from '@/lib/emba/memory-review';
import { saveMemory } from '@/lib/emba/memory';
import { makePerson, openTestDb, type TestDb } from '@/test/db';

describe('transient structured want review', () => {
  let t: TestDb;
  beforeAll(async () => { t=await openTestDb(); });
  afterAll(async () => { await t?.close(); });
  beforeEach(async () => { await t.reset(); });
  async function person() {
    const row=await makePerson(t.db);
    await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('test',$1,$2,now())",[row.id,row.id]);
    return (await authenticate(t.db,'credential',async()=>({issuer:'test',subject:row.id,expiresAt:Date.now()+60000})))!;
  }
  const candidate=(extra:Record<string,unknown>={})=>({kind:'want',text:'Transient candidate canary',category:'culture',place:null,strength:0.6,confidence:0.8,orgId:null,loopId:null,...extra});

  it('reviews without persisting a candidate and fails closed if audit fails', async () => {
    const p=await person();
    expect((await reviewMemoryCandidate(t.db,p,candidate())).outcome).toBe('new');
    expect((await t.db.query('select id from emba_memory')).rows).toEqual([]);
    expect((await t.db.query('select operation_id from emba_memory_operation')).rows).toEqual([]);
    expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain('Transient candidate canary');
    await t.db.query('delete from emba_audit');
    await t.db.query("alter table emba_audit add constraint reject_candidate_review check (action <> 'memory:read')");
    try { await expect(reviewMemoryCandidate(t.db,p,candidate())).rejects.toThrow(); }
    finally { await t.db.query('alter table emba_audit drop constraint reject_candidate_review'); }
  });

  it('shows a conflict, preserves read-time strength, and blocks stale acceptance after a correction', async () => {
    const p=await person();
    const saved=await saveMemory(t.db,p,{...candidate({text:'Current want',confidence:1}),operationId:randomUUID(),status:'active',startsAt:null,endsAt:null});
    const proposal=candidate({id:saved.id,expectedVersion:1,text:'Different preference'});
    const review=await reviewMemoryCandidate(t.db,p,proposal);
    expect(review).toMatchObject({outcome:'conflict',current:{version:1,text:'Current want',strength:0.6}});
    expect((await t.db.query<{strength:number}>('select strength from emba_memory_version where memory_id=$1 and version=1',[saved.id])).rows[0].strength).toBe(0.6);
    await saveMemory(t.db,p,{...candidate({id:saved.id,expectedVersion:1,text:'Member correction',confidence:1}),operationId:randomUUID(),status:'active',startsAt:null,endsAt:null});
    expect((await reviewMemoryCandidate(t.db,p,proposal)).outcome).toBe('stale');
    await expect(acceptMemoryCandidate(t.db,p,proposal,randomUUID())).rejects.toThrow('conflict');
    expect((await t.db.query<{text:string}>('select text from emba_memory_version where memory_id=$1 and version=2',[saved.id])).rows[0].text).toBe('Member correction');
  });

  it('keeps contextual wants in their original scope and accepts only an explicit first-party candidate', async () => {
    const p=await person();
    const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Test') returning id");
    const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'trip') returning id",[org.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,p.personId]);
    const scoped=candidate({orgId:org.id,loopId:loop.id,text:'Trip want'});
    const saved=await acceptMemoryCandidate(t.db,p,scoped,randomUUID());
    const moved=candidate({id:saved.id,expectedVersion:1,text:'Moved want'});
    expect(await reviewMemoryCandidate(t.db,p,moved)).toMatchObject({outcome:'scope_conflict',current:null});
    await expect(acceptMemoryCandidate(t.db,p,moved,randomUUID())).rejects.toThrow('conflict');
    const delegated=(await authenticate(t.db,'credential',async()=>({issuer:'test',subject:p.subject,expiresAt:Date.now()+60000,clientId:'assistant'})))!;
    await expect(reviewMemoryCandidate(t.db,delegated,scoped)).rejects.toThrow('forbidden');
    expect((await t.db.query<{org_id:string;loop_id:string}>('select org_id,loop_id from emba_memory where id=$1',[saved.id])).rows[0]).toEqual({org_id:org.id,loop_id:loop.id});
  });
  it('replays an accepted correction exactly but rejects changed work with the same operation ID', async () => {
    const p=await person();
    const saved=await saveMemory(t.db,p,{...candidate({text:'Original'}),operationId:randomUUID(),status:'active',startsAt:null,endsAt:null});
    const proposed=candidate({id:saved.id,expectedVersion:1,text:'Corrected'});
    const operationId=randomUUID();
    const first=await acceptMemoryCandidate(t.db,p,proposed,operationId);
    expect(first.version).toBe(2);
    expect(await acceptMemoryCandidate(t.db,p,proposed,operationId)).toEqual(first);
    await expect(acceptMemoryCandidate(t.db,p,{...proposed,text:'Changed retry'},operationId)).rejects.toThrow('conflict');
    expect((await t.db.query('select version from emba_memory_version where memory_id=$1',[saved.id])).rows).toHaveLength(2);
  });

  it('offers explicit reactivation when the matching current want is inactive', async () => {
    const p=await person();
    const input=candidate({text:'Archived want'});
    const saved=await saveMemory(t.db,p,{...input,operationId:randomUUID(),status:'archived',startsAt:null,endsAt:null});
    const proposal={...input,id:saved.id,expectedVersion:1};
    expect((await reviewMemoryCandidate(t.db,p,proposal)).outcome).toBe('conflict');
    await acceptMemoryCandidate(t.db,p,proposal,randomUUID());
    expect((await t.db.query<{status:string}>('select status from emba_memory_version where memory_id=$1 and version=2',[saved.id])).rows[0].status).toBe('active');
  });
});
