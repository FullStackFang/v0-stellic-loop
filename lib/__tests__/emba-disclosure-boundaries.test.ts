// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Children, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture, finalizeEmbaFixture, afternoon } from '@/test/emba-fixture';
import { authenticate } from '@/lib/emba/access';
import { grantLease } from '@/lib/emba/consent';
import { createActivity, finalizeActivity, saveCommitment, withdrawCommitment } from '@/lib/emba/activities';
import { readDisclosedNames, setNameDisclosure } from '@/lib/emba/disclosure';
import { createMemoryMcpServer, handleMemoryRequest, handleMcpRequest } from '@/lib/emba/mcp';
import type { RemoteAuth } from '@/lib/emba/auth-token';
import { TripPanel } from '@/app/emba/trip-panel';

vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));

let t: TestDb;
let f: Awaited<ReturnType<typeof seedEmbaFixture>>;
beforeAll(async()=>{ t=await openTestDb(); });
beforeEach(async()=>{
  await t.reset(); f=await seedEmbaFixture(t.db);
  // The same person is both a root organizer and a direct trip member.
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[f.orgId,f.vietnam.loopId,f.organizer.personId]);
  await t.db.query("update person set name='PRIVATE_PARTICIPANT_B' where id=$1",[f.memberB.personId]);
});
afterAll(async()=>{ await t.close(); });

const commit=(activityId:string)=>({activityId,revision:1,operationId:randomUUID(),minOthers:0,requires:[]});
async function delegateOrganizer() {
  const claims={issuer:f.organizer.issuer,subject:f.organizer.subject,expiresAt:f.organizer.expiresAt,clientId:'organizer-assistant',scopes:['memory:read','plan:read']};
  await grantLease(t.db,f.organizer,{...f.vietnam,clientId:claims.clientId,actions:['memory:read','plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
  await grantLease(t.db,f.organizer,{clientId:claims.clientId,actions:['memory:read'],expiresAt:'2099-01-01T00:00:00Z'});
  return {principal:(await authenticate(t.db,'synthetic',async()=>claims))!,claims};
}

it('dual-role organizers need eligible participation and each target’s activity-specific disclosure',async()=>{
  const delegated=await delegateOrganizer();
  await expect(readDisclosedNames(t.db,f.organizer,f.activity.id)).rejects.toThrow('forbidden');
  await saveCommitment(t.db,f.organizer,commit(f.activity.id));
  await finalizeEmbaFixture(t.db,f);
  expect(await readDisclosedNames(t.db,f.organizer,f.activity.id)).toEqual([]);
  expect(await readDisclosedNames(t.db,delegated.principal,f.activity.id)).toEqual([]);
  await setNameDisclosure(t.db,f.memberB,{activityId:f.activity.id,revision:1,discloseName:true});
  expect(await readDisclosedNames(t.db,f.organizer,f.activity.id)).toEqual([{name:'PRIVATE_PARTICIPANT_B'}]);
  expect(await readDisclosedNames(t.db,delegated.principal,f.activity.id)).toEqual([{name:'PRIVATE_PARTICIPANT_B'}]);
  const other=await createActivity(t.db,f.organizer,{...f.vietnam,title:'Another walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-03-01T06:00:00Z',endsAt:'2099-03-01T07:00:00Z',deadline:'2099-02-28T06:00:00Z'});
  await saveCommitment(t.db,f.organizer,commit(other.id));
  await saveCommitment(t.db,f.memberB,commit(other.id));
  await t.db.query("update emba_activity_revision set deadline='2000-01-01' where activity_id=$1",[other.id]);
  await finalizeActivity(t.db,f.organizer,other.id,1);
  expect(await readDisclosedNames(t.db,f.organizer,other.id)).toEqual([]);
  await setNameDisclosure(t.db,f.memberB,{activityId:f.activity.id,revision:1,discloseName:false});
  expect(await readDisclosedNames(t.db,delegated.principal,f.activity.id)).toEqual([]);
  await withdrawCommitment(t.db,f.organizer,f.activity.id,1);
  await expect(readDisclosedNames(t.db,f.organizer,f.activity.id)).rejects.toThrow('forbidden');
  await expect(readDisclosedNames(t.db,delegated.principal,f.activity.id)).rejects.toThrow('forbidden');
});

it.each([false,true])('MCP and HTTP do not expand dual-role organizer projections (participating=%s)',async(participating)=>{
  if(participating)await saveCommitment(t.db,f.organizer,commit(f.activity.id));
  await setNameDisclosure(t.db,f.memberB,{activityId:f.activity.id,revision:1,discloseName:true});
  await finalizeEmbaFixture(t.db,f);
  const {principal,claims}=await delegateOrganizer();
  if(!participating)await expect(readDisclosedNames(t.db,principal,f.activity.id)).rejects.toThrow('forbidden');
  const server=createMemoryMcpServer(t.db,principal),client=new Client({name:'disclosure-boundary-test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  try {
    const activities=await client.callTool({name:'list_activities',arguments:f.vietnam});
    const planning=await client.callTool({name:'plan_for_me',arguments:{...f.vietnam,...afternoon}});
    const updates=await client.callTool({name:'list_updates',arguments:{}});
    const memory=await client.callTool({name:'list_memory',arguments:{}});
    for(const result of [activities,planning,updates,memory])expect(result.isError).not.toBe(true);
    expect(activities.structuredContent).toMatchObject({items:[expect.objectContaining({id:f.activity.id,own_status:participating?'satisfied':null})]});
    expect(memory.structuredContent).toEqual({items:[],truncated:false});
    const resource=await client.readResource({uri:'loop://memory'});
    const serialized=JSON.stringify([activities,planning,updates,memory,resource]);
    for(const privateValue of ['PRIVATE_PARTICIPANT_B',f.memberA.personId,f.memberB.personId,'quiet Hanoi afternoon','Explore a calm Hanoi'])expect(serialized).not.toContain(privateValue);
    const injected=await client.callTool({name:'list_memory',arguments:{personId:f.memberA.personId}});
    expect(injected.isError).toBe(true);

    // Exercise HTTP adapters with an injected trusted verifier; signature validation
    // has its own cryptographic suite, and this is not real-provider acceptance.
    const auth:RemoteAuth={config:{issuer:claims.issuer,audience:'https://loop.example/api/mcp',jwksUrl:'https://issuer.example/jwks',clientIds:[claims.clientId]},verify:async()=>claims};
    const response=await handleMemoryRequest(new Request('https://loop.example/api/emba/memory',{headers:{authorization:'Bearer synthetic'}}),{database:t.db,auth});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({items:[],truncated:false});
    const httpMcp=await handleMcpRequest(new Request(auth.config.audience,{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_activities',arguments:f.vietnam}})}),{database:t.db,auth});
    expect(httpMcp.status).toBe(200);
    const body=await httpMcp.json();
    expect(body.result.structuredContent).toEqual(activities.structuredContent);
    expect(JSON.stringify(body)).not.toContain('PRIVATE_PARTICIPANT_B');
  }finally{await client.close();await server.close();}
});

it('renders activity dates with explicit UTC and trip timezone labels in Hanoi and Tallinn',async()=>{
  await createActivity(t.db,f.organizer,{...f.estonia,title:'Tallinn afternoon walk',place:'Tallinn',timezone:'Europe/Tallinn',startsAt:'2099-04-02T12:00:00Z',endsAt:'2099-04-02T13:00:00Z',deadline:'2099-04-01T12:00:00Z'});
  for(const [scope,title,timezone,utcTime] of [[f.vietnam,'Hanoi afternoon walk','Asia/Ho_Chi_Minh','2099-02-02T06:00:00.000Z'],[f.estonia,'Tallinn afternoon walk','Europe/Tallinn','2099-04-02T12:00:00.000Z']] as const){
    const panel=await TripPanel({principal:f.organizer,...scope,query:'',documentId:'',memory:[]});
    // Render the activity section, whose descendants are synchronous form components;
    // unrelated async resource/inbox sections are exercised by their own tests.
    const activitySection=Children.toArray(panel.props.children).find(child=>isValidElement<{id?:string}>(child)&&child.props.id==='activities');
    expect(activitySection).toBeDefined();
    const html=renderToStaticMarkup(activitySection);
    expect(html).toContain(title);
    expect(html).toContain(`Trip timezone: ${timezone}`);
    expect(html).toContain(utcTime);
    expect(html).toContain('(UTC)');
    expect(html).toContain('Earlier commitments, named dependencies and disclosure consent do not carry forward.');
  }
});
