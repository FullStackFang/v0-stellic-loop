// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {runDocumentBatch} from '@/lib/emba/document-worker';
import {EMBEDDING_MODEL_ID,EMBEDDING_DIMENSIONS} from '@/lib/emba/embeddings';
import {uploadDocument} from '@/lib/emba/knowledge';

const provider=vi.hoisted(()=>vi.fn());
vi.mock('ai',()=>({embedMany:provider}));
describe.skipIf(process.env.QB_DB==='remote'&&process.env.EMBA_VECTOR_TEST!=='1')('scheduled optional embeddings',()=>{
  let t:TestDb;
  beforeAll(async()=>{t=await openTestDb({vectors:true});});afterAll(async()=>{await t?.close();});
  beforeEach(async()=>{
    await t.reset();vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
    provider.mockReset().mockImplementation(async({values}:{values:string[]})=>({embeddings:values.map(()=>Array.from({length:EMBEDDING_DIMENSIONS},(_,i)=>i===0?1:0))}));
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('indexes canonical-ready documents and skips complete current-model indexes',async()=>{
    const f=await seedEmbaFixture(t.db);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
    expect((await t.db.query('select model_id from emba_document_embedding where document_id=$1',[f.document.id])).rows).toEqual([{model_id:EMBEDDING_MODEL_ID}]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});expect(provider).toHaveBeenCalledTimes(1);
  });
  it('keeps keyword-ready documents retryable after vector provider failure',async()=>{
    const f=await seedEmbaFixture(t.db);provider.mockRejectedValueOnce(new Error('private provider payload'));
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:0,failed:1});
    expect((await t.db.query('select state from emba_document_version where document_id=$1',[f.document.id])).rows).toEqual([{state:'ready'}]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:0,ready:0,failed:0});
    await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[f.document.id]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});expect(provider).toHaveBeenCalledTimes(2);
  });
  it('processes new canonical sources before embedding and replaces an incomplete model index',async()=>{
    const f=await seedEmbaFixture(t.db);
    await runDocumentBatch(t.db);
    const other=await uploadDocument(t.db,f.organizer,{...f.vietnam,operationId:randomUUID(),title:'Two lines',mediaType:'text/plain',body:'First bus line\nSecond bus line'});
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
    await t.db.query('delete from emba_document_embedding where document_id=$1 and ordinal=1',[other.id]);
    await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[other.id]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});
    expect((await t.db.query('select * from emba_document_embedding where document_id=$1',[other.id])).rows).toHaveLength(2);
  });
  it('never sends revoked uploader source text to the provider',async()=>{
    const f=await seedEmbaFixture(t.db);
    await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.organizer.personId]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:0,failed:1});expect(provider).not.toHaveBeenCalled();
  });
  it('does not mistake another model index for current semantic readiness',async()=>{
    const f=await seedEmbaFixture(t.db);await runDocumentBatch(t.db);
    await t.db.query('insert into emba_embedding_model(model_id,dimensions) values($1,$2)',['old-model',EMBEDDING_DIMENSIONS]);
    await t.db.query("update emba_document_embedding set model_id='old-model' where document_id=$1",[f.document.id]);
    await t.db.query("update emba_document_version set next_worker_at=now()-interval '1 second' where document_id=$1",[f.document.id]);
    expect(await runDocumentBatch(t.db)).toEqual({claimed:1,ready:1,failed:0});expect(provider).toHaveBeenCalledTimes(2);
    expect((await t.db.query('select * from emba_document_embedding where document_id=$1 and model_id=$2',[f.document.id,EMBEDDING_MODEL_ID])).rows).toHaveLength(1);
  });
});
