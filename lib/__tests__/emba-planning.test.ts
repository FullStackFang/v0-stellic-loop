import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate} from '@/lib/emba/access';
import {saveMemory} from '@/lib/emba/memory';
import {uploadDocument,processDocument} from '@/lib/emba/knowledge';
import {planForMe} from '@/lib/emba/planning';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import type {Db} from '@/lib/db';
import {handleDocumentRequest} from '@/lib/emba/mcp';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});afterAll(async()=>{await t.close();});
async function fixture(){
 const person=await makePerson(t.db); await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('test',$1,$2,now())",[person.id,person.id]);
 const claims={issuer:'test',subject:person.id,expiresAt:Date.now()+3600000};
 const p=(await authenticate(t.db,'trusted',async()=>claims))!;
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('EMBA') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'emba') returning id",[org.id]);
 const scope={orgId:org.id,loopId:loop.id};
 await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,person.id]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,person.id]);
 const input={...scope,place:'Hanoi',start:'2099-01-01T13:00:00Z',end:'2099-01-01T17:00:00Z'};
 return {p,claims,scope,input};
}
it('combines active wants and cited trip evidence without creating commitments',async()=>{
 const f=await fixture();
 await saveMemory(t.db,f.p,{operationId:randomUUID(),kind:'want',text:'Short food walks',category:'food',place:'Hanoi',strength:0.8,confidence:1});
 await saveMemory(t.db,f.p,{operationId:randomUUID(),kind:'want',text:'Archived preference',category:'food',strength:1,confidence:1,status:'archived'});
 const doc=await uploadDocument(t.db,f.p,{...f.scope,operationId:randomUUID(),title:'Hanoi itinerary',mediaType:'text/plain',body:'Hanoi bus leaves the hotel at 14:00.'});
 await processDocument(t.db,f.p,doc.id,doc.version);
 const result=await planForMe(t.db,f.p,f.input);
 expect(result.wants).toHaveLength(1);expect(result.passages).toEqual([expect.objectContaining({documentId:doc.id,version:1,sourceUrl:expect.stringContaining('/api/emba/documents/')})]);
 expect(result.insufficientEvidence).toBe(false);
 expect((await t.db.query('select * from emba_commitment')).rows).toEqual([]);
});
it('reports insufficient evidence instead of inventing facts and rejects invalid time windows',async()=>{
 const f=await fixture();const result=await planForMe(t.db,f.p,f.input);
 expect(result.insufficientEvidence).toBe(true);expect(result.incompleteEvidence).toBe(true);
 await expect(planForMe(t.db,f.p,{...f.input,end:f.input.start})).rejects.toThrow();
});
it('does not count a cancelled activity as usable planning evidence',async()=>{
 const f=await fixture();
 const {rows:[a]}=await t.db.query<{id:string}>("insert into emba_activity(org_id,loop_id,creator_id,state) values($1,$2,$3,'cancelled') returning id",[f.scope.orgId,f.scope.loopId,f.p.personId]);
 await t.db.query("insert into emba_activity_revision values($1,1,'Cancelled walk','Hanoi','Asia/Ho_Chi_Minh','2099-01-01T14:00:00Z','2099-01-01T15:00:00Z','2099-01-01T00:00:00Z')",[a.id]);
 const result=await planForMe(t.db,f.p,f.input);
 expect(result.activities).toEqual([]);expect(result.insufficientEvidence).toBe(true);
});
it('requires scoped planning and personal-memory leases and denies after revocation',async()=>{
 const f=await fixture();const agent=(await authenticate(t.db,'agent',async()=>({...f.claims,clientId:'assistant',scopes:['plan:read','memory:read']})))!;
 await expect(planForMe(t.db,agent,f.input)).rejects.toThrow('forbidden');
 const lease=await grantLease(t.db,f.p,{...f.scope,clientId:'assistant',actions:['plan:read','memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
 await grantLease(t.db,f.p,{clientId:'assistant',actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect((await planForMe(t.db,agent,f.input)).insufficientEvidence).toBe(true);
 await revokeLease(t.db,f.p,lease.id);
 await expect(planForMe(t.db,agent,f.input)).rejects.toThrow('forbidden');
});
it('bounds long evidence and marks truncation instead of silently claiming completeness',async()=>{
 const f=await fixture();
 const doc=await uploadDocument(t.db,f.p,{...f.scope,operationId:randomUUID(),title:'Long Hanoi notes',mediaType:'text/plain',body:Array.from({length:15},()=> 'Hanoi '+ 'x'.repeat(3900)).join('\n')});
 await processDocument(t.db,f.p,doc.id,1);
 const result=await planForMe(t.db,f.p,f.input);
 expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(32000);expect(result.truncated).toBe(true);expect(result.incompleteEvidence).toBe(true);
});
it('fails a composed snapshot if own commitment changed after activity retrieval',async()=>{
 const f=await fixture();
 const {rows:[a]}=await t.db.query<{id:string}>('insert into emba_activity(org_id,loop_id,creator_id) values($1,$2,$3) returning id',[f.scope.orgId,f.scope.loopId,f.p.personId]);
 await t.db.query("insert into emba_activity_revision values($1,1,'Walk','Hanoi','Asia/Ho_Chi_Minh','2099-01-01T14:00:00Z','2099-01-01T15:00:00Z','2099-01-01T00:00:00Z')",[a.id]);
 await t.db.query("insert into emba_commitment(activity_id,revision,person_id,min_others,status) values($1,1,$2,0,'active')",[a.id,f.p.personId]);
 let changed=false;
 const racing:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  const result=await q.query<T>(sql,params);
  if(!changed&&sql.includes('from emba_activity a join emba_activity_revision')){changed=true;await q.query("update emba_commitment set status='withdrawn' where activity_id=$1",[a.id]);}
  return result;
 }}))};
 await expect(planForMe(racing,f.p,f.input)).rejects.toThrow('conflict');expect(changed).toBe(true);
});
it('serves cited documents through HTTP only with current scoped authority',async()=>{
 const f=await fixture();const doc=await uploadDocument(t.db,f.p,{...f.scope,operationId:randomUUID(),title:'Hanoi source',mediaType:'text/plain',body:'Private bus at 14:00'});
 const auth={config:{issuer:'https://test.example',audience:'https://loop.example/api/mcp',jwksUrl:'https://test.example/jwks',clientIds:['reader']},verify:async()=>({...f.claims,clientId:'reader',scopes:['plan:read']})};
 const request=()=>new Request(`https://loop.example/api/emba/documents/${doc.id}?version=1`,{headers:{authorization:'Bearer synthetic'}});
 expect((await handleDocumentRequest(request(),doc.id,{database:t.db,auth})).status).toBe(403);
 const lease=await grantLease(t.db,f.p,{...f.scope,clientId:'reader',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 const response=await handleDocumentRequest(request(),doc.id,{database:t.db,auth});
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect((await response.json()).body).toBe('Private bus at 14:00');
 await revokeLease(t.db,f.p,lease.id);
 expect((await handleDocumentRequest(request(),doc.id,{database:t.db,auth})).status).toBe(403);
});
