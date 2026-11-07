import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate,canAccessPersonal} from '@/lib/emba/access';
import {saveMemory} from '@/lib/emba/memory';
import {uploadDocument,processDocument} from '@/lib/emba/knowledge';
import {exportPersonalData,deletePersonalData,applyDeletionTombstones,expirePrivacyCapabilities} from '@/lib/emba/privacy';
import type {Db} from '@/lib/db';
import {publishGroupNote,readGroupNoteReceipt,withdrawGroupNote} from '@/lib/emba/group-memory';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{await t.reset();});
afterAll(async()=>{await t.close();});
async function fixture(authenticatedAt:number|undefined=Date.now(),clientId?:string) {
 const person=await makePerson(t.db);
 await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1::text,$1::uuid,now())",[person.id]);
 const p=(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:person.id,expiresAt:Date.now()+3600000,authenticatedAt,clientId})))!;
 return p;
}
it('requires recent trusted first-party authentication, never just an unexpired session',async()=>{
 const base=await fixture();
 const unknown=(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:base.subject,expiresAt:Date.now()+3600000})))!;
 for(const p of [unknown,await fixture(Date.now()-300001),await fixture(0),await fixture(Date.now(),'agent'),await fixture(Date.now()+60000)]) {
  await expect(exportPersonalData(t.db,p)).rejects.toThrow('forbidden');
  await expect(deletePersonalData(t.db,p)).rejects.toThrow('forbidden');
 }
});
it('suspends dependencies and removes participant identifiers across historical revisions',async()=>{
 const p=await fixture(),other=await fixture();
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values ('EMBA') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'emba') returning id",[org.id]);
 for(const who of [p,other]) {
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,who.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,who.personId]);
 }
 const {rows:[a]}=await t.db.query<{id:string}>('insert into emba_activity(org_id,loop_id,creator_id) values($1,$2,$3) returning id',[org.id,loop.id,p.personId]);
 await t.db.query("insert into emba_activity_revision values($1,1,'Walk','Rome','Europe/Rome',now()+interval '2 hours',now()+interval '3 hours',now()+interval '1 hour')",[a.id]);
 await t.db.query("insert into emba_commitment values($1,1,$2,0,'{}','active',true),($1,1,$3,0,array[$2::uuid],'active',false)",[a.id,p.personId,other.personId]);
 await t.db.query('insert into emba_resolution(activity_id,revision) values($1,1)',[a.id]);
 await t.db.query('insert into emba_resolution_outcome values($1,1,$2,true)',[a.id,p.personId]);
 const result=await exportPersonalData(t.db,other);
 expect(JSON.stringify(result)).not.toContain(p.personId);
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[p.personId]);
 const document=await uploadDocument(t.db,p,{operationId:randomUUID(),orgId:org.id,loopId:loop.id,title:'Organization itinerary',mediaType:'text/plain',body:'Museum opens at nine'});
 await deletePersonalData(t.db,p);
 await expect(processDocument(t.db,p,document.id,document.version)).rejects.toThrow('forbidden');
 expect((await t.db.query('select body,uploaded_by from emba_document_version where document_id=$1',[document.id])).rows).toEqual([{body:'Museum opens at nine',uploaded_by:null}]);
 expect((await t.db.query('select 1 from emba_document_passage where document_id=$1',[document.id])).rows).toHaveLength(0);
 const {rows:[remaining]}=await t.db.query<{status:string;requires:string[]}>('select status,requires from emba_commitment where person_id=$1',[other.personId]);
 expect(remaining).toEqual({status:'suspended',requires:[]});
 expect((await t.db.query('select person_id from emba_resolution_outcome where activity_id=$1',[a.id])).rows).toEqual([{person_id:null}]);
 expect((await t.db.query('select creator_id from emba_activity where id=$1',[a.id])).rows).toEqual([{creator_id:null}]);
 expect((await t.db.query('select 1 from emba_inbox where person_id=$1',[p.personId])).rows).toHaveLength(0);
 expect(await canAccessPersonal(t.db,other,other.personId)).toBe(true);
});
it('rolls deletion back when the required audit cannot persist',async()=>{
 const p=await fixture();
 await t.db.query("alter table emba_audit add constraint privacy_test_failure check(action<>'privacy:delete')");
 try {
  await expect(deletePersonalData(t.db,p)).rejects.toThrow();
  expect(await canAccessPersonal(t.db,p,p.personId)).toBe(true);
  expect((await t.db.query('select 1 from emba_deletion_tombstone where person_id=$1',[p.personId])).rows).toHaveLength(0);
 } finally {await t.db.query('alter table emba_audit drop constraint privacy_test_failure');}
});
it('exports only own memory and audits before output; excludes another person',async()=>{
 const p=await fixture(),other=await fixture();
 for(const [who,text] of [[p,'Own preference'],[other,'Other secret']] as const) await saveMemory(t.db,who,{operationId:randomUUID(),kind:'want',text,category:'food',strength:1,confidence:1});
 const result=await exportPersonalData(t.db,p);
 expect(JSON.stringify(result)).toContain('Own preference');
 expect(JSON.stringify(result)).not.toContain('Other secret');
 expect(JSON.stringify(result)).not.toContain(other.personId);
 expect((await t.db.query("select 1 from emba_audit where person_id=$1 and action='privacy:export'",[p.personId])).rows).toHaveLength(1);
 const failing={...t.db,tx:((run:Parameters<typeof t.db.tx>[0])=>t.db.tx(q=>run({query:async(sql,params)=>{if(sql.startsWith('insert into emba_audit'))throw Error('audit unavailable');return q.query(sql,params);}}))) as typeof t.db.tx};
 await expect(exportPersonalData(failing,p)).rejects.toThrow('audit unavailable');
});
it('deletes live EMBA data and blocks stale identities and restored memory using durable tombstones',async()=>{
 const p=await fixture();
 await saveMemory(t.db,p,{operationId:randomUUID(),kind:'want',text:'Delete me',category:'food',strength:1,confidence:1});
 await deletePersonalData(t.db,p);
 expect(await canAccessPersonal(t.db,p,p.personId)).toBe(false);
 expect((await t.db.query('select 1 from emba_memory where person_id=$1',[p.personId])).rows).toHaveLength(0);
 await t.db.query("insert into emba_identity (issuer,subject,person_id,verified_at) values ('test',$1::text,$1::uuid,now())",[p.personId]);
 await t.db.tx(async q=>{
  const id=randomUUID();
  await q.query("insert into emba_memory(id,person_id,kind,current_version) values($1,$2,'want',1)",[id,p.personId]);
  await q.query("insert into emba_memory_version(person_id,memory_id,version,text,category,strength,confidence,status) values($1,$2,1,'Restored private preference','food',1,1,'active')",[p.personId,id]);
 });
 expect(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:p.subject,expiresAt:Date.now()+3600000}))).toBeNull();
 await expect(exportPersonalData(t.db,p)).rejects.toThrow('forbidden');
 await applyDeletionTombstones(t.db,[p.personId]);
 expect((await t.db.query('select 1 from emba_identity where person_id=$1',[p.personId])).rows).toHaveLength(0);
 expect((await t.db.query('select 1 from emba_memory where person_id=$1',[p.personId])).rows).toHaveLength(0);
});
it('expires only semantic capabilities without deleting audit history',async()=>{
 const p=await fixture();
 await t.db.query("insert into emba_lease(person_id,client_id,actions,created_at,expires_at) values($1,'agent',array['memory:read'],now()-interval '2 hours',now()-interval '1 hour')",[p.personId]);
 await exportPersonalData(t.db,p);
 await expirePrivacyCapabilities(t.db);
 expect((await t.db.query('select 1 from emba_lease where person_id=$1',[p.personId])).rows).toHaveLength(0);
 expect((await t.db.query('select 1 from emba_audit where person_id=$1',[p.personId])).rows).toHaveLength(1);
});

it('exports only own minimal group receipts and purges restored receipt authority without erasing publications',async()=>{
 const p=await fixture(),other=await fixture();
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Shared notes') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'shared') returning id",[org.id]);
 const scope={orgId:org.id,loopId:loop.id};
 for(const who of [p,other]) {
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,who.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,who.personId]);
 }
 const input={...scope,operationId:randomUUID(),text:'WITHDRAWN_SHARED_TEXT'},saved=await publishGroupNote(t.db,p,input);
 await withdrawGroupNote(t.db,p,{...scope,operationId:randomUUID(),recordId:saved.recordId,expectedVersion:1});
 await publishGroupNote(t.db,other,{...scope,operationId:randomUUID(),text:'OTHER_PUBLICATION_TEXT'});
 const exported=await exportPersonalData(t.db,p);
 expect(exported).toHaveProperty('groupMemoryReceipts');
 expect(JSON.stringify(exported)).not.toContain('WITHDRAWN_SHARED_TEXT');expect(JSON.stringify(exported)).not.toContain('OTHER_PUBLICATION_TEXT');
 expect(JSON.stringify(exported)).not.toContain(other.personId);
 const {rows:[receipt]}=await t.db.query<{request_hash:string}>('select request_hash from emba_group_memory_operation where person_id=$1 and operation_id=$2',[p.personId,input.operationId]);
 await deletePersonalData(t.db,p);
 expect((await t.db.query('select * from emba_group_memory_operation where person_id=$1',[p.personId])).rows).toEqual([]);
 expect((await t.db.query('select author_id from emba_group_memory where id=$1',[saved.recordId])).rows).toEqual([{author_id:p.personId}]);
 await t.db.query('insert into emba_group_memory_operation(person_id,operation_id,request_hash,record_id,version) values($1,$2,$3,$4,1)',[p.personId,input.operationId,receipt.request_hash,saved.recordId]);
 await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('test',$1,$2,now())",[p.subject,p.personId]);
 await expect(t.db.tx(q=>readGroupNoteReceipt(q,p,{...input,recordId:saved.recordId,expectedVersion:1,mutation:'publish'}))).rejects.toThrow('forbidden');
 await applyDeletionTombstones(t.db,[p.personId]);
 expect((await t.db.query('select * from emba_group_memory_operation where person_id=$1',[p.personId])).rows).toEqual([]);
});

it.skipIf(process.env.QB_DB!=='remote')('locks an activity with only a historical dependency before purging it',async()=>{
 const p=await fixture(),other=await fixture();
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Historical dependency') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'trip') returning id",[org.id]);
 const {rows:[activity]}=await t.db.query<{id:string}>('insert into emba_activity(org_id,loop_id,revision) values($1,$2,2) returning id',[org.id,loop.id]);
 for(const revision of [1,2])await t.db.query("insert into emba_activity_revision values($1,$2,'Walk','Rome','Europe/Rome',now()+interval '2 hours',now()+interval '3 hours',now()+interval '1 hour')",[activity.id,revision]);
 await t.db.query("insert into emba_commitment(activity_id,revision,person_id,min_others,requires,status) values($1,1,$2,0,array[$3::uuid],'active')",[activity.id,other.personId,p.personId]);
 let reached!:()=>void,release!:()=>void;
 const atPrelock=new Promise<void>(resolve=>{reached=resolve;}),continuePurge=new Promise<void>(resolve=>{release=resolve;});
 const observed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  const result=await q.query<T>(sql,params);
  if(sql.includes('for update of a')){reached();await continuePurge;}
  return result;
 }}))};
 const deletion=deletePersonalData(observed,p);
 try {
  await atPrelock;
  await expect(t.db.tx(async q=>{await q.query('select id from emba_activity where id=$1 for update nowait',[activity.id]);})).rejects.toMatchObject({code:'55P03'});
 } finally {release();await deletion;}
 expect((await t.db.query<{status:string;requires:string[]}>('select status,requires from emba_commitment where activity_id=$1 and revision=1',[activity.id])).rows[0]).toEqual({status:'suspended',requires:[]});
});
