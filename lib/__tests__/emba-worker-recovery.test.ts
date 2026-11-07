// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate} from '@/lib/emba/access';
import {uploadDocument,deleteDocument,searchKnowledge} from '@/lib/emba/knowledge';
import {createActivity,saveCommitment,finalizeActivity} from '@/lib/emba/activities';
import {listInbox} from '@/lib/emba/delivery';
import {runDocumentBatch} from '@/lib/emba/document-worker';

type Signal={checkpoint?:string;stage?:number;id?:string;receipt?:string;denied?:boolean};
async function worker(args:string[],crash=false) {
  return new Promise<{code:number|null;signals:Signal[]}>((resolve,reject)=>{
    const child=spawn(process.execPath,['--conditions=react-server','--import','tsx','test/emba-worker-child.ts',...args],{
      windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,NODE_ENV:'test'},
    });
    const signals:Signal[]=[];
    const timer=setTimeout(()=>{child.kill();reject(new Error('Recovery child timed out'));},15000);
    child.on('message',(message:Signal)=>{signals.push(message);if(crash&&message.checkpoint)child.kill('SIGKILL');});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);resolve({code,signals});});
  });
}
describe.skipIf(process.env.QB_DB!=='remote')('native worker process-loss recovery',()=>{
  let t:TestDb;
  beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});afterAll(async()=>{await t.close();});
  async function fixture() {
    const person=await makePerson(t.db);
    await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('worker-recovery',$1,$2,now())",[person.id,person.id]);
    const p=(await authenticate(t.db,'fixture',async()=>({issuer:'worker-recovery',subject:person.id,expiresAt:Date.now()+3600000})))!;
    const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Worker recovery') returning id");
    const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'trip') returning id",[org.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,person.id]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,person.id]);
    const scope={orgId:org.id,loopId:loop.id};
    const source={...scope,operationId:randomUUID(),title:'Bus guide',mediaType:'text/plain',body:'Hotel bus departure at nine.'};
    const doc=await uploadDocument(t.db,p,source);
    return {p,scope,source,doc};
  }
  it.each([1,2])('recovers after process death following document stage %i commit',async stage=>{
    const {p,scope,doc}=await fixture();
    const killed=await worker(['document-crash',p.personId,doc.id,String(stage)],true);
    expect(killed.signals).toEqual([{checkpoint:'committed',stage}]);
    const {rows:[pending]}=await t.db.query<{state:string;extracted:unknown}>('select state,extracted from emba_document_version where document_id=$1',[doc.id]);
    expect(pending.state).toBe(stage===1?'extracting':'indexing');
    expect(pending.extracted===null).toBe(stage===1);
    expect(await searchKnowledge(t.db,p,{...scope,query:'bus'})).toEqual([]);
    expect((await worker(['document-resume',p.personId,doc.id])).code).toBe(0);
    expect((await worker(['document-resume',p.personId,doc.id])).code).toBe(0);
    expect(await searchKnowledge(t.db,p,{...scope,query:'bus'})).toHaveLength(1);
    const {rows:[ready]}=await t.db.query('select state,attempts from emba_document_version where document_id=$1',[doc.id]);
    expect(ready).toEqual({state:'ready',attempts:2});
    expect((await t.db.query('select * from emba_document_passage where document_id=$1',[doc.id])).rows).toHaveLength(1);
  },45000);
  it('recovers a scheduled claim after its worker process dies',async()=>{
    const {doc}=await fixture();
    expect((await worker(['batch-crash'],true)).signals).toEqual([{checkpoint:'claimed'}]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
    await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[doc.id]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
    expect((await t.db.query('select worker_attempts from emba_document_version where document_id=$1',[doc.id])).rows).toEqual([{worker_attempts:2}]);
  },45000);
  it.each(['deleted','corrected','revoked'])('rejects %s document work after process death',async change=>{
    const {p,source,doc}=await fixture();
    expect((await worker(['document-crash',p.personId,doc.id,'2'],true)).signals).toHaveLength(1);
    if(change==='deleted')await deleteDocument(t.db,p,doc.id,1);
    else if(change==='corrected')await uploadDocument(t.db,p,{...source,operationId:randomUUID(),documentId:doc.id,expectedVersion:1,body:'Replacement bus guide.'});
    else await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[p.personId]);
    const retry=await worker(['document-resume',p.personId,doc.id]);
    expect(retry.code).toBe(3);expect(retry.signals).toEqual([{denied:true}]);
    expect((await t.db.query('select * from emba_document_passage where document_id=$1',[doc.id])).rows).toHaveLength(0);
    expect((await t.db.query("select * from emba_document_version where document_id=$1 and state='ready'",[doc.id])).rows).toHaveLength(0);
  },45000);
  it.each(['unchanged','revoked','obsolete'])('rechecks %s delivery after send-before-commit process death',async change=>{
    const {p,scope}=await fixture();
    const activity=await createActivity(t.db,p,{...scope,title:'Walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T00:00:00Z'});
    await saveCommitment(t.db,p,{activityId:activity.id,revision:1,operationId:randomUUID(),minOthers:0,requires:[]});
    await t.db.query("update emba_activity_revision set deadline='2000-01-01' where activity_id=$1",[activity.id]);
    await finalizeActivity(t.db,p,activity.id,1);
    const killed=await worker(['delivery-crash'],true);
    expect(killed.signals).toEqual([{checkpoint:'sent',id:expect.any(String)}]);
    const receipt=killed.signals[0].id;
    expect((await t.db.query('select delivered_at from emba_outbox where inbox_id=$1',[receipt])).rows).toEqual([{delivered_at:null}]);
    if(change==='revoked')await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[p.personId]);
    else if(change==='obsolete')await t.db.query('update emba_activity set event_version=event_version+1 where id=$1',[activity.id]);
    const retried=await worker(['delivery-resume']);
    expect(retried.code).toBe(0);expect(retried.signals).toEqual(change==='unchanged'?[{receipt}]:[]);
    expect((await worker(['delivery-resume'])).signals).toEqual([]);
    if(change==='unchanged')expect((await listInbox(t.db,p))[0].acknowledged_at).toBeNull();
    else expect((await t.db.query('select * from emba_outbox where inbox_id=$1',[receipt])).rows).toEqual([]);
  },45000);
});
