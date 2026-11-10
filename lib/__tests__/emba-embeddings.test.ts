import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type {Db} from '@/lib/db';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture } from '@/test/emba-fixture';
import { embedTexts, indexDocumentEmbeddings, searchKnowledgeSemantic } from '@/lib/emba/embeddings';
import { embedMany } from 'ai';
vi.mock('ai',()=>({embedMany:vi.fn()}));
const vector=()=>[1,...Array(1535).fill(0)];
let t:TestDb;
beforeAll(async()=>{t=await openTestDb({vectors:true});});
afterAll(async()=>{await t?.close();});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('gates provider calls and rejects invalid input without transmission',async()=>{
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','false');
 await expect(embedTexts(['synthetic'])).rejects.toThrow('unavailable');
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 for(const texts of [[],[''],['x'.repeat(4001)],Array(201).fill('x')]) await expect(embedTexts(texts)).rejects.toThrow();
 expect(embedMany).not.toHaveBeenCalled();
});
it('enforces model, ZDR, bounded calls and no telemetry; validates vectors and sanitizes provider failures',async()=>{
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 vi.mocked(embedMany).mockResolvedValue({embeddings:[vector()]} as never);
 expect(await embedTexts(['synthetic'])).toEqual([vector()]);
 expect(embedMany).toHaveBeenCalledWith(expect.objectContaining({model:'openai/text-embedding-3-small',dimensions:1536,maxRetries:0,maxParallelCalls:1,providerOptions:{gateway:{zeroDataRetention:true}},telemetry:{isEnabled:false,recordInputs:false,recordOutputs:false},abortSignal:expect.any(AbortSignal)}));
 for(const bad of [[],[[1]], [Array(1536).fill(0)],[[Infinity,...Array(1535).fill(0)]]]) {
  vi.mocked(embedMany).mockResolvedValue({embeddings:bad} as never);
  await expect(embedTexts(['synthetic'])).rejects.toThrow('unavailable');
 }
 vi.mocked(embedMany).mockRejectedValue(new Error('secret provider payload timeout'));
 const error=await embedTexts(['synthetic']).catch(error=>error);
 expect(error.message).toBe('unavailable');expect(error.cause).toBeUndefined();
 vi.mocked(embedMany).mockRejectedValue(new DOMException('sensitive timeout detail','TimeoutError'));
 await expect(embedTexts(['synthetic'])).rejects.toThrow(/^unavailable$/);
});
it('splits requests into bounded batches with a shared total deadline',async()=>{
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 vi.mocked(embedMany).mockImplementation(async options=>({embeddings:options.values.map(()=>vector())}) as never);
 expect(await embedTexts(Array(17).fill('synthetic'))).toHaveLength(17);
 const calls=vi.mocked(embedMany).mock.calls;
 expect(calls.map(([options])=>options.values.length)).toEqual([16,1]);
 expect(calls[0][0].abortSignal).toBe(calls[1][0].abortSignal);
});
it.skipIf(process.env.QB_DB==='remote')('refuses enabled retrieval with absent optional schema before transmission',async()=>{
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 const plain=await openTestDb();
 try {
  const f=await seedEmbaFixture(plain.db),embed=vi.fn(async()=>[vector()]);
  await expect(searchKnowledgeSemantic(plain.db,f.memberA,{...f.vietnam,query:'transport'},embed)).rejects.toThrow('unavailable');
  await expect(indexDocumentEmbeddings(plain.db,f.organizer,{documentId:f.document.id,version:1},embed)).rejects.toThrow('unavailable');
  expect(embed).not.toHaveBeenCalled();
 } finally {await plain.close();}
});
it('commits metadata-only transmission audits and fails closed if auditing fails',async()=>{
 await t.reset();vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 const f=await seedEmbaFixture(t.db);
 const embed=vi.fn(async()=>{throw new Error('provider unavailable');});
 await expect(indexDocumentEmbeddings(t.db,f.organizer,{documentId:f.document.id,version:1},embed)).rejects.toThrow();
 await expect(searchKnowledgeSemantic(t.db,f.memberA,{...f.vietnam,query:'sensitive query'},embed)).rejects.toThrow();
 const {rows}=await t.db.query<{action:string;resource_id:string|null}>("select action,resource_id from emba_audit where action like 'knowledge:embed-%' order by action");
 expect(rows).toEqual([{action:'knowledge:embed-document',resource_id:f.document.id},{action:'knowledge:embed-query',resource_id:null}]);
 const blocked:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async(text,params)=>{if(text.includes('insert into emba_audit'))throw new Error('audit unavailable');return q.query(text,params);}}))};
 embed.mockClear();
 await expect(indexDocumentEmbeddings(blocked,f.organizer,{documentId:f.document.id,version:1},embed)).rejects.toThrow('audit unavailable');
 await expect(searchKnowledgeSemantic(blocked,f.memberA,{...f.vietnam,query:'sensitive query'},embed)).rejects.toThrow('audit unavailable');
 expect(embed).not.toHaveBeenCalled();
});
it('authorizes before external calls and revalidates after them',async()=>{
 await t.reset();
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 const f=await seedEmbaFixture(t.db),embed=vi.fn(async()=>[vector()]);
 const doc={documentId:f.document.id,version:1};
 await expect(indexDocumentEmbeddings(t.db,f.memberA,doc,embed)).rejects.toThrow('forbidden');
 await expect(searchKnowledgeSemantic(t.db,f.nonmember,{...f.vietnam,query:'bus'},embed)).rejects.toThrow('forbidden');
 expect(embed).not.toHaveBeenCalled();
 await indexDocumentEmbeddings(t.db,f.organizer,doc,embed);
 expect((await searchKnowledgeSemantic(t.db,f.memberA,{...f.vietnam,query:'transport'},embed))[0].documentId).toBe(f.document.id);
 embed.mockImplementationOnce(async()=>{
  await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.memberA.personId]);
  return [vector()];
 });
 await expect(searchKnowledgeSemantic(t.db,f.memberA,{...f.vietnam,query:'transport'},embed)).rejects.toThrow('forbidden');
});
it('rechecks the locked current source before external transmission',async()=>{
 await t.reset();vi.stubEnv('LOOP_EMBEDDINGS_ENABLED','true');
 const f=await seedEmbaFixture(t.db),embed=vi.fn(async()=>[vector()]);
 const changed:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async(text,params)=>{if(text.includes('for share of d,v'))await q.query('update emba_document set deleted_at=now() where id=$1',[f.document.id]);return q.query(text,params);}}))};
 await expect(indexDocumentEmbeddings(changed,f.organizer,{documentId:f.document.id,version:1},embed)).rejects.toThrow('conflict');
 expect(embed).not.toHaveBeenCalled();
});
