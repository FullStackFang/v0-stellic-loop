// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {createMemoryMcpServer} from '@/lib/emba/mcp';
import {withPortalTestSession} from '@/lib/emba/portal-session';
import {reviewSharedNote,approveSharedNote} from '@/app/emba/group-memory-actions';
import {publishGroupNote} from '@/lib/emba/group-memory';
import {saveMemory} from '@/lib/emba/memory';
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();vi.stubEnv('LOOP_AUTH_CLIENT_IDS','claude-test,chatgpt-test');vi.stubEnv('LOOP_AUTH_ISSUER','https://issuer.example');vi.stubEnv('LOOP_AUTH_AUDIENCE','https://loop.example/api/mcp');vi.stubEnv('LOOP_AUTH_JWKS_URL','https://issuer.example/jwks');});
afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>{await t.close();});
const idle={status:'idle' as const,message:''};
function form(review:unknown,checked=true){const d=new FormData();d.set('binding',JSON.stringify(review));if(checked)d.set('reviewed','yes');return d;}
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort-a',slug:'emba2027'});
 const connections:{server:ReturnType<typeof createMemoryMcpServer>;client:Client;lease:{id:string}}[]=[];
 for(const clientId of ['claude-test','chatgpt-test']){
  const p=(await authenticate(t.db,'fixture',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.now()+60000,clientId,scopes:['plan:read','group-memory:write']})))!;
  const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId,actions:['plan:read','group-memory:write'],expiresAt:'2099-01-01T00:00:00Z'});
  const server=createMemoryMcpServer(t.db,p),client=new Client({name:clientId,version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
  connections.push({server,client,lease});
 }
 const payload={...f.vietnam,mutation:'publish',operationId:randomUUID(),recordId:randomUUID(),expectedVersion:1,text:'Shared hotel meeting at nine.'};
 return {...f,connections,payload,close:async()=>{for(const c of connections){await c.client.close();await c.server.close();}}};
}
it('runs all seven group tools across two clients through actual first-party review and approval',async()=>{
 const f=await fixture();try{
  const [a,b]=f.connections;
  const tools=(await a.client.listTools()).tools.map(tool=>tool.name);
  for(const name of ['list_groups','resolve_group','get_group_context','search_group_memory','read_group_memory','prepare_group_memory','execute_group_memory'])expect(tools).toContain(name);
  expect((await a.client.callTool({name:'list_groups',arguments:{}})).structuredContent).toMatchObject({groups:[{handle:'@cohort-a/emba2027'}]});
  // An assistant is given a group's handle, never the path that spells the groups it is inside.
  for(const call of [{name:'list_groups',arguments:{}},{name:'resolve_group',arguments:{handle:'@emba2027'}}])expect(JSON.stringify(await a.client.callTool(call))).not.toContain('loopPath');
  expect((await a.client.callTool({name:'resolve_group',arguments:{handle:'@emba2027'}})).structuredContent).toMatchObject({status:'resolved',group:f.vietnam});
  const prepared=await a.client.callTool({name:'prepare_group_memory',arguments:f.payload});expect(prepared.isError).not.toBe(true);
  const review=(prepared.structuredContent as {review:unknown}).review;
  expect((await t.db.query('select * from emba_group_memory')).rows).toEqual([]);
  const inspected=await withPortalTestSession(f.memberA,()=>reviewSharedNote(idle,form(review)));
  expect(inspected.groupReview).toMatchObject({clientId:'claude-test',text:f.payload.text,mutation:'publish'});
  const approved=await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,form(review)));
  expect(approved.confirmationId).toEqual(expect.any(String));
  const executed=await a.client.callTool({name:'execute_group_memory',arguments:{confirmationId:approved.confirmationId,payload:f.payload}});expect(executed.isError).not.toBe(true);
  expect((await b.client.callTool({name:'read_group_memory',arguments:{...f.vietnam,recordId:f.payload.recordId}})).structuredContent).toMatchObject({text:f.payload.text,version:1});
  expect((await b.client.callTool({name:'search_group_memory',arguments:{...f.vietnam,query:'hotel'}})).structuredContent).toMatchObject({items:[{text:f.payload.text}]});
  await saveMemory(t.db,f.memberA,{operationId:randomUUID(),kind:'want',text:'PRIVATE_MCP_CANARY',category:'other',strength:1,confidence:1});
  const context=await b.client.callTool({name:'get_group_context',arguments:f.vietnam});
  expect(context.structuredContent).toMatchObject({contextKind:'shared_notes',incompleteEvidence:true,untrusted:true});expect(JSON.stringify(context)).not.toContain('PRIVATE_MCP_CANARY');
  const correction={...f.payload,mutation:'correct',operationId:randomUUID(),text:'Changed to ten.'};
  const changed=await b.client.callTool({name:'prepare_group_memory',arguments:correction});
  const changedReview=(changed.structuredContent as {review:unknown}).review;
  const inspectedChange=await withPortalTestSession(f.memberA,()=>reviewSharedNote(idle,form(changedReview)));
  expect(inspectedChange.groupReview).toMatchObject({clientId:'chatgpt-test',currentText:f.payload.text,text:correction.text});
  const changeApproval=await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,form(changedReview)));
  expect((await b.client.callTool({name:'execute_group_memory',arguments:{confirmationId:changeApproval.confirmationId,payload:correction}})).isError).not.toBe(true);
  expect((await a.client.callTool({name:'read_group_memory',arguments:{...f.vietnam,recordId:f.payload.recordId}})).structuredContent).toMatchObject({text:correction.text,version:2});
  await revokeLease(t.db,f.memberA,a.lease.id);
  expect((await a.client.callTool({name:'read_group_memory',arguments:{...f.vietnam,recordId:f.payload.recordId}})).isError).toBe(true);
  expect((await b.client.callTool({name:'read_group_memory',arguments:{...f.vietnam,recordId:f.payload.recordId}})).isError).not.toBe(true);
 }finally{await f.close();}
});
it('rejects forged audience/transcripts/client labels and stale approval over SDK transport',async()=>{
 const f=await fixture();try{
  const a=f.connections[0];
  for(const extra of [{audience:'private'},{transcript:'RAW_TRANSCRIPT_CANARY'},{clientLabel:'Trusted organizer'}])expect((await a.client.callTool({name:'prepare_group_memory',arguments:{...f.payload,...extra}})).isError).toBe(true);
  await publishGroupNote(t.db,f.memberA,{...f.vietnam,operationId:f.payload.recordId,text:'Original'});
  const correction={...f.payload,mutation:'correct',operationId:randomUUID()};
  const prepared=await a.client.callTool({name:'prepare_group_memory',arguments:correction});
  const review=(prepared.structuredContent as {review:unknown}).review;
  const approved=await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,form(review)));
  await publishGroupNote(t.db,f.memberA,{...f.vietnam,operationId:randomUUID(),recordId:f.payload.recordId,expectedVersion:1,text:'Newer human correction'});
  expect((await a.client.callTool({name:'execute_group_memory',arguments:{confirmationId:approved.confirmationId,payload:correction}})).isError).toBe(true);
  expect((await t.db.query('select consumed_at from emba_confirmation where id=$1',[approved.confirmationId])).rows).toEqual([{consumed_at:null}]);
  expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain('RAW_TRANSCRIPT_CANARY');
 }finally{await f.close();}
});
