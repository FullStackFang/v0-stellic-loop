import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openTestDb, makePerson, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createActivity, createActivityInTransaction,saveCommitment, finalizeActivity, withdrawCommitment, readActivity, setDependencyConsent, reviseActivity, closeActivity, revokeActivityEligibility } from '@/lib/emba/activities';
import { grantLease } from '@/lib/emba/consent';
import { readOrganizerReport,readDisclosedNames,setNameDisclosure } from '@/lib/emba/disclosure';
import { listInbox, acknowledgeInbox,deliverPending,pollInbox } from '@/lib/emba/delivery';
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
async function fixture() {
  const {rows:[org]} = await t.db.query<{id:string}>("insert into emba_organization(name) values ('Test') returning id");
  const {rows:[loop]} = await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values ($1,'trip') returning id",[org.id]);
  const members = [];
  for (const role of ['owner','member','follower']) {
    const p = await makePerson(t.db,role);
    await t.db.query("insert into emba_identity values ('test',$1,$2,now(),null)",[p.id,p.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values ($1,$2)',[org.id,p.id]);
    await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values ($1,$2,$3,$4)',[org.id,loop.id,p.id,role]);
    members.push((await authenticate(t.db,'x',async()=>({issuer:'test',subject:p.id,expiresAt:Date.parse('2099-01-01')})))!);
  }
  const input = {orgId:org.id,loopId:loop.id,title:'Walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-02-02T12:00:00Z',endsAt:'2099-02-02T14:00:00Z',deadline:'2099-02-01T12:00:00Z'};
  const activity = await createActivity(t.db,members[0],input);
  return {members,activity,input};
}
const commit = (id:string, requires:string[]=[])=>({activityId:id,revision:1,operationId:randomUUID(),minOthers:0,requires});
async function deadline(id:string) { await t.db.query("update emba_activity_revision set deadline='2000-01-01' where activity_id=$1",[id]); }
it('requires explicit eligible opt-in, retries once, finalizes once and delivers privately', async()=>{
  const {members:[a,b,f],activity} = await fixture();
  const input = commit(activity.id);
  await expect(saveCommitment(t.db,f,input)).rejects.toThrow('forbidden');
  await saveCommitment(t.db,a,input); await saveCommitment(t.db,a,input);
  await saveCommitment(t.db,b,commit(activity.id));
  await expect(finalizeActivity(t.db,a,activity.id,1)).rejects.toThrow('conflict');
  await deadline(activity.id);
  await finalizeActivity(t.db,a,activity.id,1); await finalizeActivity(t.db,a,activity.id,1);
  expect((await t.db.query('select * from emba_resolution')).rows).toHaveLength(1);
  expect((await listInbox(t.db,a)).length).toBe(1);
  expect((await listInbox(t.db,b)).length).toBe(1);
  expect((await listInbox(t.db,a))[0].acknowledged_at).toBeNull();
  await acknowledgeInbox(t.db,a,(await listInbox(t.db,a))[0].id);
  expect((await listInbox(t.db,a))[0].acknowledged_at).not.toBeNull();
  expect(await readActivity(t.db,a,activity.id)).not.toHaveProperty('participants');
});
it('requires named permission before opt-in and suspends dependencies on revocation',async()=>{
  const {members:[a,b],activity} = await fixture();
  await expect(saveCommitment(t.db,a,commit(activity.id,[b.personId]))).rejects.toThrow('forbidden');
  await setDependencyConsent(t.db,b,activity.id,1,a.personId,true);
  await saveCommitment(t.db,a,commit(activity.id,[b.personId]));
  await setDependencyConsent(t.db,b,activity.id,1,a.personId,false);
  expect((await readActivity(t.db,a,activity.id)).ownCommitment?.status).toBe('suspended');
});
it('withdrawal degrades a resolved dependency without altering immutable resolution; reopen starts empty',async()=>{
  const {members:[a,b],activity,input} = await fixture();
  await setDependencyConsent(t.db,b,activity.id,1,a.personId,true);
  await saveCommitment(t.db,a,commit(activity.id,[b.personId]));
  await saveCommitment(t.db,b,commit(activity.id)); await deadline(activity.id);
  await finalizeActivity(t.db,a,activity.id,1);
  await withdrawCommitment(t.db,b,activity.id,1);
  expect((await readActivity(t.db,a,activity.id)).degraded).toBe(true);
  expect((await readActivity(t.db,a,activity.id)).ownCommitment?.status).toBe('suspended');
  expect((await t.db.query('select * from emba_resolution')).rows).toHaveLength(1);
  await reviseActivity(t.db,a,activity.id,1,input);
  expect((await readActivity(t.db,a,activity.id)).ownCommitment).toBeNull();
  expect((await pollInbox(t.db,b)).items).toEqual([expect.objectContaining({activity_id:activity.id,revision:2,kind:'reopened'})]);
  const sent:string[]=[];
  await deliverPending(t.db,async message=>{sent.push(message.kind);});
  expect(sent).toEqual(['reopened','reopened']);
});
it('freezes a suppressed report including zero cells without leaking a complementary total',async()=>{
  const {members:[a],activity} = await fixture();
  await saveCommitment(t.db,a,commit(activity.id)); await deadline(activity.id);
  await finalizeActivity(t.db,a,activity.id,1); await closeActivity(t.db,a,activity.id,1,'completed');
  expect(await readOrganizerReport(t.db,a,activity.id)).toEqual({suppressed:true});
});
it('discloses only affirmative names to resolved eligible participants, never by organizer role alone',async()=>{
  const {members:[a,b,f],activity} = await fixture();
  await saveCommitment(t.db,a,commit(activity.id));await saveCommitment(t.db,b,commit(activity.id));
  await setNameDisclosure(t.db,b,{activityId:activity.id,revision:1,discloseName:true});
  await deadline(activity.id);await finalizeActivity(t.db,a,activity.id,1);
  expect(await readDisclosedNames(t.db,a,activity.id)).toEqual([{name:'member'}]);
  await expect(readDisclosedNames(t.db,f,activity.id)).rejects.toThrow('forbidden');
  await setNameDisclosure(t.db,b,{activityId:activity.id,revision:1,discloseName:false});
  expect(await readDisclosedNames(t.db,a,activity.id)).toEqual([]);
});
it('revoking a named target that never opted in suspends the dependent commitment',async()=>{
  const {members:[a,b],activity} = await fixture();
  await setDependencyConsent(t.db,b,activity.id,1,a.personId,true);
  await saveCommitment(t.db,a,commit(activity.id,[b.personId]));
  await t.db.tx(async q=>{
    await q.query('update emba_membership set revoked_at=now() where person_id=$1',[b.personId]);
    await revokeActivityEligibility(q,b.personId);
  });
  expect((await readActivity(t.db,a,activity.id)).ownCommitment?.status).toBe('suspended');
});
it('outbox failure retries one logical item without acknowledging it',async()=>{
  const {members:[a],activity} = await fixture();
  await saveCommitment(t.db,a,commit(activity.id));await deadline(activity.id);await finalizeActivity(t.db,a,activity.id,1);
  const sent:string[]=[];
  await deliverPending(t.db,async m=>{sent.push(m.id);throw new Error('offline');});
  await deliverPending(t.db,async m=>{sent.push(m.id);});
  expect(await deliverPending(t.db,async()=>{throw new Error('unexpected');})).toBe(0);
  expect(sent).toHaveLength(2);expect(sent[0]).toBe(sent[1]);
  expect((await listInbox(t.db,a))[0].acknowledged_at).toBeNull();
});
it('rejects changed retries and late joins, and rolls back notifications with finalization',async()=>{
  const {members:[a,b],activity} = await fixture(),input=commit(activity.id);
  await saveCommitment(t.db,a,input);
  await expect(saveCommitment(t.db,a,{...input,minOthers:1})).rejects.toThrow('conflict');
  await deadline(activity.id);await expect(saveCommitment(t.db,b,commit(activity.id))).rejects.toThrow('conflict');
  await t.db.query("create function reject_test_delivery() returns trigger language plpgsql as $$ begin raise exception 'delivery fault'; end $$");
  await t.db.query('create trigger reject_test_delivery before insert on emba_outbox for each row execute function reject_test_delivery()');
  try {
    await expect(finalizeActivity(t.db,a,activity.id,1)).rejects.toThrow('delivery fault');
    expect((await t.db.query('select * from emba_resolution')).rows).toEqual([]);
    expect((await listInbox(t.db,a))).toEqual([]);
    expect((await readActivity(t.db,a,activity.id)).state).toBe('open');
  } finally {await t.db.query('drop trigger reject_test_delivery on emba_outbox');await t.db.query('drop function reject_test_delivery()');}
});
it('suppresses the eight-interested six-resolved complement and releases a safe partition only once',async()=>{
  const {members:[a],activity} = await fixture();
  // Seed already-authorized outcomes to exercise the release boundary independently of the resolver.
  for(let i=0;i<8;i++) {
    const p=await makePerson(t.db);
    await t.db.query("insert into emba_commitment(activity_id,revision,person_id,min_others,status) values($1,1,$2,0,$3)",[activity.id,p.id,i<6?'satisfied':'unresolved']);
  }
  await t.db.query("update emba_activity set state='finalized' where id=$1",[activity.id]);
  await closeActivity(t.db,a,activity.id,1,'completed');
  expect(await readOrganizerReport(t.db,a,activity.id)).toEqual({suppressed:true});
  for(let i=0;i<5;i++) {
    const p=await makePerson(t.db);
    await t.db.query("insert into emba_commitment(activity_id,revision,person_id,min_others,status) values($1,1,$2,0,'unresolved')",[activity.id,p.id]);
  }
  // Even if retained data changes, report refresh never releases a numerical delta.
  expect(await readOrganizerReport(t.db,a,activity.id)).toEqual({suppressed:true});
});
it('suppresses revoked and obsolete inbox items including opaque continuation requests',async()=>{
  const {members:[a,b],activity,input}=await fixture();
  const second=await createActivity(t.db,a,input);
  for(const id of [activity.id,second.id]) {
    await saveCommitment(t.db,b,commit(id));await deadline(id);await finalizeActivity(t.db,a,id,1);
  }
  const page=await pollInbox(t.db,b,{limit:1});expect(page.nextCursor).toBeTruthy();
  await expect(pollInbox(t.db,a,{cursor:page.nextCursor!,limit:1})).rejects.toThrow('forbidden');
  await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[b.personId]);
  expect((await pollInbox(t.db,b,{cursor:page.nextCursor!,limit:1})).items).toEqual([]);
  await expect(acknowledgeInbox(t.db,b,page.items[0].id)).rejects.toThrow('forbidden');
  const messages:string[]=[];await deliverPending(t.db,async m=>{messages.push(m.id);});expect(messages).toEqual([]);
  // Fresh revision invalidates old messages even while the recipient remains eligible.
  await t.db.query('update emba_membership set revoked_at=null where person_id=$1',[b.personId]);
  await reviseActivity(t.db,a,activity.id,1,input);
  expect((await listInbox(t.db,b)).map(m=>m.activity_id)).toEqual([activity.id,second.id]);
});
it('delegated polling cannot acknowledge and confirmed publication helper deduplicates the exact payload',async()=>{
  const {members:[a],activity,input}=await fixture();
  const agent=(await authenticate(t.db,'agent',async()=>({issuer:'test',subject:a.personId,clientId:'agent',expiresAt:Date.parse('2099-01-01'),scopes:['plan:read','activity:write']})))!;
  const global=await grantLease(t.db,a,{clientId:'agent',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
  await saveCommitment(t.db,a,commit(activity.id));await deadline(activity.id);await finalizeActivity(t.db,a,activity.id,1);
  await expect(listInbox(t.db,agent)).rejects.toThrow('forbidden');
  const scoped=await grantLease(t.db,a,{clientId:'agent',actions:['plan:read'],orgId:input.orgId,loopId:input.loopId,expiresAt:'2099-01-01T00:00:00Z'});
  await t.db.query('update emba_lease set revoked_at=now() where id=$1',[global.id]);
  const messages=await listInbox(t.db,agent);
  expect((await t.db.query('select lease_id from emba_audit where person_id=$1 and action=$2 and resource_id=$3',[a.personId,'inbox:read',messages[0].id])).rows).toContainEqual({lease_id:scoped.id});
  await t.db.query('update emba_lease set revoked_at=now() where id=$1',[scoped.id]);
  await expect(listInbox(t.db,agent)).rejects.toThrow('forbidden');
  await expect(acknowledgeInbox(t.db,agent,messages[0].id)).rejects.toThrow('forbidden');
  expect((await listInbox(t.db,a))[0].acknowledged_at).toBeNull();
  const publication={activityId:randomUUID(),operationId:randomUUID(),terms:input};
  await expect(t.db.tx(q=>createActivityInTransaction(q,agent,publication))).rejects.toThrow('forbidden');
  await grantLease(t.db,a,{clientId:'agent',actions:['activity:write'],orgId:input.orgId,loopId:input.loopId,expiresAt:'2099-01-01T00:00:00Z'});
  const saved=await t.db.tx(q=>createActivityInTransaction(q,agent,publication));
  expect(await t.db.tx(q=>createActivityInTransaction(q,agent,publication))).toEqual(saved);
  await expect(t.db.tx(q=>createActivityInTransaction(q,agent,{...publication,terms:{...input,title:'Changed'}}))).rejects.toThrow('conflict');
});
