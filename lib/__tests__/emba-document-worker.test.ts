// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate} from '@/lib/emba/access';
import {uploadDocument,processDocument} from '@/lib/emba/knowledge';
import {runDocumentBatch} from '@/lib/emba/document-worker';
import {GET} from '@/app/api/cron/emba-documents/route';
import type {Db} from '@/lib/db';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});
afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>{await t.close();});
async function fixture() {
  const person=await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('document-worker',$1,$2,now())",[person.id,person.id]);
  const p=(await authenticate(t.db,'fixture',async()=>({issuer:'document-worker',subject:person.id,expiresAt:Date.now()+3600000})))!;
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Worker batch') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'trip') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,p.personId]);
  const source={orgId:org.id,loopId:loop.id,operationId:randomUUID(),title:'Bus guide',mediaType:'text/plain',body:'Bus departure at nine.'};
  return {p,doc:await uploadDocument(t.db,p,source),source};
}
it('processes persisted uploads with current uploader authority and never repeats ready work',async()=>{
  const {doc}=await fixture();
  expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
  expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
  expect((await t.db.query('select state,worker_attempts from emba_document_version where document_id=$1',[doc.id])).rows).toEqual([{state:'ready',worker_attempts:1}]);
});
it.each(['membership','identity','deletion'])('denies work after uploader %s removal',async kind=>{
  const {p,doc}=await fixture();
  if(kind==='membership')await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[p.personId]);
  else if(kind==='identity')await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[p.personId]);
  else await t.db.query('insert into emba_deletion_tombstone(person_id) values($1)',[p.personId]);
  expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:0,failed:1});
  expect((await t.db.query('select * from emba_document_passage where document_id=$1',[doc.id])).rows).toHaveLength(0);
});
it('backs off failed work, caps scheduled retries, and excludes obsolete versions',async()=>{
  const {doc,p,source}=await fixture();
  await uploadDocument(t.db,p,{...source,operationId:randomUUID(),documentId:doc.id,expectedVersion:1,body:'Corrected bus guide'});
  const failing:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
    if(sql.startsWith('insert into emba_document_passage'))throw new Error('synthetic index outage');
    return q.query<T>(sql,params);
  }}))};
  for(let attempt=1;attempt<=5;attempt++) {
    expect(await runDocumentBatch(failing)).toEqual({claimed:1,ready:0,failed:1});
    expect(await runDocumentBatch(failing)).toEqual({claimed:0,ready:0,failed:0});
    await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[doc.id]);
  }
  expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
  expect((await t.db.query('select version,worker_attempts from emba_document_version where document_id=$1 order by version',[doc.id])).rows).toEqual([{version:1,worker_attempts:0},{version:2,worker_attempts:5}]);
  await processDocument(t.db,p,doc.id,2);
  expect((await t.db.query('select state from emba_document_version where document_id=$1 and version=2',[doc.id])).rows).toEqual([{state:'ready'}]);
});
it('skips a live claim and resumes it after the crash lease expires',async()=>{
  const {doc}=await fixture();
  await t.db.query("update emba_document_version set worker_attempts=1,next_worker_at=now()+interval '5 minutes' where document_id=$1",[doc.id]);
  expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
  await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[doc.id]);
  expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
});
it('an overlapping invocation cannot claim work already owned by another batch',async()=>{
  await fixture();
  let observed=false;
  const overlapping:Db={query:t.db.query.bind(t.db),tx:async fn=>{
    const result=await t.db.tx(fn);
    if(!observed) {
      observed=true;
      expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
    }
    return result;
  }};
  expect(await runDocumentBatch(overlapping)).toEqual({claimed:1,ready:1,failed:0});
});
it('limits a batch to ten sources',async()=>{
  const {p,source}=await fixture();
  for(let i=0;i<10;i++)await uploadDocument(t.db,p,{...source,operationId:randomUUID()});
  expect(await runDocumentBatch(t.db)).toEqual({claimed:10,ready:10,failed:0});
  expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
});
it('cron rejects absent/wrong configuration before processing and ignores caller-supplied identity',async()=>{
  const {doc}=await fixture();
  vi.stubEnv('CRON_SECRET','');
  expect((await GET(new Request('http://localhost/api/cron/emba-documents',{headers:{authorization:'Bearer undefined'}}))).status).toBe(401);
  vi.stubEnv('CRON_SECRET','test-worker-secret');
  expect((await GET(new Request('http://localhost/api/cron/emba-documents',{headers:{authorization:'Bearer wrong'}}))).status).toBe(401);
  expect((await t.db.query('select state from emba_document_version where document_id=$1',[doc.id])).rows).toEqual([{state:'accepted'}]);
  const response=await GET(new Request('http://localhost/api/cron/emba-documents?personId=spoofed&limit=999',{headers:{authorization:'Bearer test-worker-secret'}}));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({claimed:1,ready:1,failed:0});
});
it('fails closed before claiming when embeddings are enabled without the optional schema',async()=>{
  const {doc}=await fixture();vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');vi.stubEnv('CRON_SECRET','test-worker-secret');
  await expect(runDocumentBatch(t.db)).rejects.toThrow();
  const response=await GET(new Request('http://localhost/api/cron/emba-documents',{headers:{authorization:'Bearer test-worker-secret'}}));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'Document processing unavailable'});
  expect((await t.db.query('select worker_attempts,state from emba_document_version where document_id=$1',[doc.id])).rows).toEqual([{worker_attempts:0,state:'accepted'}]);
});
