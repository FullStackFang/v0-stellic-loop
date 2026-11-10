// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {withPortalTestSession} from '@/lib/emba/portal-session';
import {uploadDocument} from '@/lib/emba/knowledge';
import {EMBEDDING_DIMENSIONS,EMBEDDING_MODEL_ID} from '@/lib/emba/embeddings';
import {processResource} from './actions';

const provider=vi.hoisted(()=>vi.fn());
vi.mock('ai',()=>({embedMany:provider}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
describe.skipIf(process.env.QB_DB==='remote'&&process.env.EMBA_VECTOR_TEST!=='1')('portal semantic resource processing',()=>{
  let t:TestDb;
  beforeAll(async()=>{t=await openTestDb({vectors:true});});afterAll(async()=>{await t?.close();});
  beforeEach(async()=>{
    await t.reset();vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
    provider.mockReset().mockImplementation(async({values}:{values:string[]})=>({embeddings:values.map(()=>Array.from({length:EMBEDDING_DIMENSIONS},(_,i)=>i===0?1:0))}));
  });
  afterEach(()=>vi.unstubAllEnvs());
  function form(id:string) {const data=new FormData();data.set('documentId',id);data.set('version','1');return data;}
  const idle={status:'idle' as const,message:''};
  it('processes canonical passages then saves enabled semantic vectors as the authenticated uploader',async()=>{
    const f=await seedEmbaFixture(t.db);
    const doc=await uploadDocument(t.db,f.organizer,{...f.vietnam,operationId:randomUUID(),title:'New itinerary',mediaType:'text/plain',body:'Hotel bus departure.'});
    expect((await withPortalTestSession(f.organizer,()=>processResource(idle,form(doc.id)))).status).toBe('success');
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await t.db.query('select model_id from emba_document_embedding where document_id=$1',[doc.id])).rows).toEqual([{model_id:EMBEDDING_MODEL_ID}]);
  });
  it('reports provider failure without exposing payload and retries the already-ready canonical source',async()=>{
    const f=await seedEmbaFixture(t.db);provider.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_PAYLOAD'));
    const result=await withPortalTestSession(f.organizer,()=>processResource(idle,form(f.document.id)));
    expect(result.status).toBe('error');expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_PAYLOAD');
    expect((await t.db.query('select state from emba_document_version where document_id=$1',[f.document.id])).rows).toEqual([{state:'ready'}]);
    expect((await t.db.query('select * from emba_document_embedding')).rows).toEqual([]);
    expect((await withPortalTestSession(f.organizer,()=>processResource(idle,form(f.document.id)))).status).toBe('success');
    expect((await t.db.query('select * from emba_document_embedding')).rows).toHaveLength(1);
  });
  it('keeps keyword-only processing local while disabled',async()=>{
    const f=await seedEmbaFixture(t.db);vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','false');
    expect((await withPortalTestSession(f.organizer,()=>processResource(idle,form(f.document.id)))).status).toBe('success');
    expect(provider).not.toHaveBeenCalled();expect((await t.db.query('select * from emba_document_embedding')).rows).toEqual([]);
  });
  it('does not let a non-uploader send source text for embedding',async()=>{
    const f=await seedEmbaFixture(t.db);
    expect((await withPortalTestSession(f.memberA,()=>processResource(idle,form(f.document.id)))).status).toBe('error');
    expect(provider).not.toHaveBeenCalled();
  });
});
