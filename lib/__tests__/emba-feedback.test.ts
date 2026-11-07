import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate} from '@/lib/emba/access';
import {saveMemory,listMemory} from '@/lib/emba/memory';
import {saveFeedback,deleteFeedback} from '@/lib/emba/feedback';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{await t.reset();});
afterAll(async()=>{await t.close();});
async function fixture() {
 const person=await makePerson(t.db);
 await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1,$2,now())",[person.id,person.id]);
 const principal=(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:person.id,expiresAt:Date.now()+3600000})))!;
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values ('EMBA') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values ($1,'emba') returning id",[org.id]);
 await t.db.query('insert into emba_membership(org_id,person_id) values ($1,$2)',[org.id,person.id]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values ($1,$2,$3,'member')",[org.id,loop.id,person.id]);
 const {rows:[activity]}=await t.db.query<{id:string}>('insert into emba_activity(org_id,loop_id,creator_id) values ($1,$2,$3) returning id',[org.id,loop.id,person.id]);
 const want={kind:'want',text:'Food walks',category:'food',strength:0.8,confidence:1};
 const memory=await saveMemory(t.db,principal,{...want,operationId:randomUUID()});
 return {principal,activityId:activity.id,memory,want,scope:{orgId:org.id,loopId:loop.id}};
}
it('replaces the same logical activity contribution even with a new operation ID',async()=>{
 const f=await fixture();
 const input={operationId:randomUUID(),activityId:f.activityId,memoryId:f.memory.id,expectedMemoryVersion:1,expectedVersion:0,attendance:'attended',assessment:0.2};
 await saveFeedback(t.db,f.principal,input);
 await saveFeedback(t.db,f.principal,input);
 let current=(await listMemory(t.db,f.principal,{})).items[0];
 expect(current.evidenceCount).toBe(2); expect(current.strength).toBeCloseTo(0.5); expect(current.version).toBe(2);
 await saveFeedback(t.db,f.principal,{...input,operationId:randomUUID(),expectedMemoryVersion:2,expectedVersion:1,assessment:1});
 current=(await listMemory(t.db,f.principal,{})).items[0];
 expect(current.evidenceCount).toBe(2); expect(current.strength).toBeCloseTo(0.9);
 await deleteFeedback(t.db,f.principal,f.activityId,2);
 current=(await listMemory(t.db,f.principal,{})).items[0];
 expect(current.evidenceCount).toBe(1); expect(current.strength).toBeCloseTo(0.8);
});
it('does not treat nonattendance or no assessment as dislike',async()=>{
 const f=await fixture();
 await saveFeedback(t.db,f.principal,{operationId:randomUUID(),activityId:f.activityId,expectedVersion:0,attendance:'not_attended',assessment:null});
 const current=(await listMemory(t.db,f.principal,{})).items[0];
 expect(current.version).toBe(1); expect(current.strength).toBe(0.8); expect(current.evidenceCount).toBe(1);
});
it('lets a removed member delete their scoped feedback and removes its memory contribution',async()=>{
 const f=await fixture();
 const memory=await saveMemory(t.db,f.principal,{...f.want,...f.scope,operationId:randomUUID()});
 await saveFeedback(t.db,f.principal,{operationId:randomUUID(),activityId:f.activityId,memoryId:memory.id,expectedMemoryVersion:1,expectedVersion:0,attendance:'attended',assessment:0.2});
 await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.principal.personId]);
 await deleteFeedback(t.db,f.principal,f.activityId,1);
 const {rows:[current]}=await t.db.query<{strength:number;evidence_count:number}>('select v.strength,v.evidence_count from emba_memory m join emba_memory_version v on v.memory_id=m.id and v.version=m.current_version where m.id=$1',[memory.id]);
 expect(current.strength).toBeCloseTo(0.8);expect(current.evidence_count).toBe(1);
});
it('rejects stale feedback after an explicit correction and keeps the correction current',async()=>{
 const f=await fixture();
 await saveMemory(t.db,f.principal,{...f.want,operationId:randomUUID(),id:f.memory.id,expectedVersion:1,strength:0.1});
 await expect(saveFeedback(t.db,f.principal,{operationId:randomUUID(),activityId:f.activityId,memoryId:f.memory.id,expectedMemoryVersion:1,expectedVersion:0,attendance:'attended',assessment:1})).rejects.toThrow('conflict');
 expect((await listMemory(t.db,f.principal,{})).items[0].strength).toBe(0.1);
});
it('denies delegated, foreign-memory, and removed-member feedback',async()=>{
 const f=await fixture(),other=await fixture();
 const input={operationId:randomUUID(),activityId:f.activityId,memoryId:other.memory.id,expectedMemoryVersion:1,expectedVersion:0,attendance:'attended',assessment:1};
 await expect(saveFeedback(t.db,f.principal,input)).rejects.toThrow('not_found');
 const agent=(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:f.principal.subject,expiresAt:Date.now()+3600000,clientId:'agent',scopes:['memory:write']})))!;
 await expect(saveFeedback(t.db,agent,{...input,memoryId:f.memory.id})).rejects.toThrow('forbidden');
 await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.principal.personId]);
 await expect(saveFeedback(t.db,f.principal,{...input,memoryId:f.memory.id})).rejects.toThrow('forbidden');
});
