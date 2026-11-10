import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {embedMany} from 'ai';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {createMemoryMcpServer} from '@/lib/emba/mcp';
import {indexDocumentEmbeddings} from '@/lib/emba/embeddings';
vi.mock('ai',()=>({embedMany:vi.fn()}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb({vectors:true});});
beforeEach(async()=>{await t.reset();});
afterAll(async()=>{await t.close();});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
async function fixture(enabled=true) {
 vi.stubEnv('LOOP_EMBEDDINGS_ENABLED',String(enabled));
 const f=await seedEmbaFixture(t.db);
 const delegate=(await authenticate(t.db,'synthetic',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.parse('2099-01-01'),clientId:'assistant',scopes:['plan:read']})))!;
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'assistant',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 const server=createMemoryMcpServer(t.db,delegate),client=new Client({name:'test',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 return {...f,lease,client,close:async()=>{await client.close();await server.close();}};
}
it('registers only when enabled and discloses the external processing boundary',async()=>{
 const off=await fixture(false);
 try {expect((await off.client.listTools()).tools.map(t=>t.name)).not.toContain('search_knowledge_semantic');}
 finally {await off.close();}
 await t.reset();const on=await fixture();
 try {
  const tool=(await on.client.listTools()).tools.find(t=>t.name==='search_knowledge_semantic');
  expect(tool?.annotations).toMatchObject({readOnlyHint:true,openWorldHint:true});
  expect(tool?.description).toMatch(/external/i);expect(tool?.description).toMatch(/incomplete/i);
 } finally {await on.close();}
 expect(embedMany).not.toHaveBeenCalled();
});
it('returns scoped versioned citations through actual vector retrieval and refuses a revoked lease before transmission',async()=>{
 const f=await fixture();
 try {
  vi.mocked(embedMany).mockImplementation(async options=>({embeddings:options.values.map(()=>[1,...Array(1535).fill(0)])}) as never);
  await indexDocumentEmbeddings(t.db,f.organizer,{documentId:f.document.id,version:1});
  vi.mocked(embedMany).mockClear();
  const call=()=>f.client.callTool({name:'search_knowledge_semantic',arguments:{...f.vietnam,query:'transport'}});
  const result=await call();expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({passages:[{documentId:f.document.id,version:1,untrusted:true,sourceUrl:`/api/emba/documents/${f.document.id}?version=1`}]});
  expect((await f.client.callTool({name:'search_knowledge_semantic',arguments:{...f.estonia,query:'transport'}})).isError).toBe(true);
  expect(embedMany).toHaveBeenCalledTimes(1);
  await revokeLease(t.db,f.memberA,f.lease.id);
  expect((await call()).content).toEqual([{type:'text',text:'Access denied'}]);
  expect(embedMany).toHaveBeenCalledTimes(1);
 } finally {await f.close();}
});
it('rejects caller model/vector overrides and sanitizes provider failures',async()=>{
 const f=await fixture();
 try {
  const input={...f.vietnam,query:'transport'};
  for(const extra of [{modelId:'another/model'},{vector:[1,0,0]},{limit:21}]) {
   expect((await f.client.callTool({name:'search_knowledge_semantic',arguments:{...input,...extra}})).isError).toBe(true);
  }
  expect(embedMany).not.toHaveBeenCalled();
  vi.mocked(embedMany).mockRejectedValue(new Error('secret token and query payload'));
  const result=await f.client.callTool({name:'search_knowledge_semantic',arguments:input});
  expect(result.content).toEqual([{type:'text',text:'Operation unavailable'}]);
  expect(JSON.stringify(result)).not.toContain('secret');
 } finally {await f.close();}
});
