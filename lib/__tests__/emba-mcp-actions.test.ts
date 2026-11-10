import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {approveConfirmation,type ConfirmationInput} from '@/lib/emba/confirmation';
import {createActivity,reviseActivity,setDependencyConsent} from '@/lib/emba/activities';
import {createMemoryMcpServer} from '@/lib/emba/mcp';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});afterAll(async()=>{await t.close();});
async function fixture() {
 const person=await makePerson(t.db);await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('test',$1,$2,now())",[person.id,person.id]);
 const claims={issuer:'test',subject:person.id,expiresAt:Date.now()+3600000};
 const member=(await authenticate(t.db,'trusted',async()=>claims))!;
 const delegate=(await authenticate(t.db,'trusted',async()=>({...claims,clientId:'assistant',scopes:['plan:read','activity:write']})))!;
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('EMBA') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'emba') returning id",[org.id]);
 const scope={orgId:org.id,loopId:loop.id};
 await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,person.id]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,person.id]);
 const activity=await createActivity(t.db,member,{...scope,title:'Hanoi walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T10:00:00Z'});
 const lease=await grantLease(t.db,member,{...scope,clientId:'assistant',actions:['plan:read','activity:write'],expiresAt:'2099-01-01T00:00:00Z'});
 const server=createMemoryMcpServer(t.db,delegate),client=new Client({name:'test',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 const payload={activityId:activity.id,revision:1,operationId:randomUUID(),minOthers:0,requires:[]};
 return {member,client,server,payload,lease,scope};
}
it('prepares without writing, then executes only the exact first-party-confirmed commitment once',async()=>{
 const f=await fixture();try{
  const prepared=await f.client.callTool({name:'prepare_commitment',arguments:f.payload});
  expect(prepared.isError).not.toBe(true);
  expect((await t.db.query('select * from emba_commitment')).rows).toEqual([]);
  const review=(prepared.structuredContent as {review:ConfirmationInput}).review;
  const approved=await approveConfirmation(t.db,f.member,review);
  const changed=await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:{...f.payload,minOthers:3}}});
  expect(changed.isError).toBe(true);
  const executed=await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:f.payload}});
  expect(executed.isError).not.toBe(true);
  expect((await t.db.query('select status from emba_commitment')).rows).toEqual([{status:'active'}]);
  expect((await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:f.payload}})).isError).toBe(true);
 }finally{await f.client.close();await f.server.close();}
});
it('rechecks lease and role after approval and rolls back confirmation consumption on denial',async()=>{
 const f=await fixture();try{
  const prepared=await f.client.callTool({name:'prepare_commitment',arguments:f.payload});
  const approved=await approveConfirmation(t.db,f.member,(prepared.structuredContent as {review:ConfirmationInput}).review);
  await revokeLease(t.db,f.member,f.lease.id);
  expect((await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:f.payload}})).isError).toBe(true);
  expect((await t.db.query('select consumed_at from emba_confirmation where id=$1',[approved.id])).rows).toEqual([{consumed_at:null}]);
  await grantLease(t.db,f.member,{...f.scope,clientId:'assistant',actions:['plan:read','activity:write'],expiresAt:'2099-01-01T00:00:00Z'});
  await t.db.query("update emba_role set role='follower' where person_id=$1",[f.member.personId]);
  expect((await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:f.payload}})).isError).toBe(true);
  expect((await t.db.query('select * from emba_commitment')).rows).toEqual([]);
 }finally{await f.client.close();await f.server.close();}
});
it('requires separate exact confirmations for activity publication and name disclosure',async()=>{
 const f=await fixture();try{
  const payload={activityId:randomUUID(),operationId:randomUUID(),terms:{...f.scope,title:'New Hanoi walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T10:00:00Z'}};
  const prepared=await f.client.callTool({name:'prepare_publication',arguments:payload});
  expect(prepared.isError).not.toBe(true);
  expect((await t.db.query('select id from emba_activity where id=$1',[payload.activityId])).rows).toEqual([]);
  const approved=await approveConfirmation(t.db,f.member,(prepared.structuredContent as {review:ConfirmationInput}).review);
  expect((await f.client.callTool({name:'execute_publication',arguments:{confirmationId:approved.id,payload}})).isError).not.toBe(true);
  const commit=await f.client.callTool({name:'prepare_commitment',arguments:f.payload});
  const approval=await approveConfirmation(t.db,f.member,(commit.structuredContent as {review:ConfirmationInput}).review);
  await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approval.id,payload:f.payload}});
  const disclosure={activityId:f.payload.activityId,revision:1,discloseName:true};
  const proposed=await f.client.callTool({name:'prepare_disclosure',arguments:disclosure});
  const consent=await approveConfirmation(t.db,f.member,(proposed.structuredContent as {review:ConfirmationInput}).review);
  expect((await f.client.callTool({name:'execute_disclosure',arguments:{confirmationId:approval.id,payload:disclosure}})).isError).toBe(true);
  expect((await f.client.callTool({name:'execute_disclosure',arguments:{confirmationId:consent.id,payload:disclosure}})).isError).not.toBe(true);
  expect((await t.db.query('select disclose_name from emba_commitment where activity_id=$1',[f.payload.activityId])).rows).toEqual([{disclose_name:true}]);
 }finally{await f.client.close();await f.server.close();}
});
it('rejects a previously approved commitment after the activity terms change',async()=>{
 const f=await fixture();try{
  const prepared=await f.client.callTool({name:'prepare_commitment',arguments:f.payload});
  const approved=await approveConfirmation(t.db,f.member,(prepared.structuredContent as {review:ConfirmationInput}).review);
  await reviseActivity(t.db,f.member,f.payload.activityId,1,{...f.scope,title:'Changed Hanoi walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T12:00:00Z',endsAt:'2099-01-02T13:00:00Z',deadline:'2099-01-01T10:00:00Z'});
  expect((await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload:f.payload}})).isError).toBe(true);
  expect((await t.db.query('select * from emba_commitment')).rows).toEqual([]);
  expect((await t.db.query('select consumed_at from emba_confirmation where id=$1',[approved.id])).rows).toEqual([{consumed_at:null}]);
 }finally{await f.client.close();await f.server.close();}
});
it('rechecks dependency consent after first-party approval',async()=>{
 const f=await fixture();try{
  const target=await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('test',$1,$2,now())",[target.id,target.id]);
  const principal=(await authenticate(t.db,'trusted',async()=>({issuer:'test',subject:target.id,expiresAt:Date.now()+3600000})))!;
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[f.scope.orgId,target.id]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[f.scope.orgId,f.scope.loopId,target.id]);
  await setDependencyConsent(t.db,principal,f.payload.activityId,1,f.member.personId,true);
  const payload={...f.payload,requires:[target.id]};
  const prepared=await f.client.callTool({name:'prepare_commitment',arguments:payload});
  const approved=await approveConfirmation(t.db,f.member,(prepared.structuredContent as {review:ConfirmationInput}).review);
  await setDependencyConsent(t.db,principal,f.payload.activityId,1,f.member.personId,false);
  expect((await f.client.callTool({name:'execute_commitment',arguments:{confirmationId:approved.id,payload}})).isError).toBe(true);
  expect((await t.db.query('select * from emba_commitment')).rows).toEqual([]);
  expect((await t.db.query('select consumed_at from emba_confirmation where id=$1',[approved.id])).rows).toEqual([{consumed_at:null}]);
 }finally{await f.client.close();await f.server.close();}
});
