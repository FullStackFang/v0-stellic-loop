import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {listGroups,listPortalGroups,registerGroupAddress,resolveGroup,retireGroupAddress} from '@/lib/emba/groups';
import type {Db} from '@/lib/db';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();});
async function fixture(){const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);return f;}
async function delegate(f:Awaited<ReturnType<typeof fixture>>,clientId='claude',scopes=['plan:read']) {
 return (await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId,scopes,expiresAt:Date.parse('2099-01-01')})))!;
}
async function secondGroup(f:Awaited<ReturnType<typeof fixture>>) {
 const orgId=randomUUID(),loopId=randomUUID();
 await t.db.query("insert into emba_organization(id,name) values($1,'Second cohort')",[orgId]);
 await t.db.query("insert into emba_loop(id,org_id,path) values($1,$2,'other')",[loopId,orgId]);
 for(const [p,role] of [[f.organizer,'owner'],[f.memberA,'member']] as const){
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[orgId,p.personId]);
  await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)',[orgId,loopId,p.personId,role]);
 }
 return {orgId,loopId};
}
it('registers only for a current first-party root owner and never renames/reuses an address',async()=>{
 const f=await fixture(),data={...f.vietnam,namespace:'cohort-a',slug:'emba2027'};
 await expect(registerGroupAddress(t.db,f.memberA,data)).rejects.toThrow('forbidden');
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.organizer.personId]);
 await expect(registerGroupAddress(t.db,f.organizer,data)).rejects.toThrow('forbidden');
 await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[f.orgId,f.vietnam.loopId,f.memberA.personId]);
 await expect(registerGroupAddress(t.db,f.memberA,data)).rejects.toThrow('forbidden');
 expect(await registerGroupAddress(t.db,f.organizer,data)).toMatchObject({...data,handle:'@cohort-a/emba2027'});
 await expect(registerGroupAddress(t.db,f.organizer,{...data,slug:'renamed'})).rejects.toThrow('conflict');
 await retireGroupAddress(t.db,f.organizer,f.vietnam);
 expect(await resolveGroup(t.db,f.memberA,{handle:'@cohort-a/emba2027'})).toEqual({status:'unavailable',connectionsPath:'/emba'});
 await expect(registerGroupAddress(t.db,f.organizer,{...data,...f.estonia})).rejects.toThrow('conflict');
 await expect(t.db.query("update emba_group_address set retired_at=null")).rejects.toThrow();
 await expect(t.db.query("update emba_group_namespace set namespace='renamed'")).rejects.toThrow();
});
it('discovers only exact consented groups and reports ambiguity only among permitted matches',async()=>{
 const f=await fixture(),other=await secondGroup(f),p=await delegate(f);
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort-a',slug:'emba2027'});
 await registerGroupAddress(t.db,f.organizer,{...other,namespace:'cohort-b',slug:'emba2027'});
 expect(await listGroups(t.db,p,{})).toEqual([]);
 const unavailable={status:'unavailable',connectionsPath:'/emba'};
 expect(await resolveGroup(t.db,p,{handle:'@cohort-a/emba2027'})).toEqual(unavailable);
 expect(await resolveGroup(t.db,p,{handle:'@missing/emba2027'})).toEqual(unavailable);
 expect(await listPortalGroups(t.db,f.memberA)).toHaveLength(2);
 await expect(listPortalGroups(t.db,p)).rejects.toThrow('forbidden');
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'claude',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect(await resolveGroup(t.db,p,{handle:'@emba2027'})).toMatchObject({status:'resolved',group:{...f.vietnam}});
 await grantLease(t.db,f.memberA,{...other,clientId:'claude',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect(await resolveGroup(t.db,p,{handle:'@emba2027'})).toMatchObject({status:'ambiguous',groups:expect.any(Array)});
 expect(await listGroups(t.db,p,{limit:1})).toHaveLength(1);
 await revokeLease(t.db,f.memberA,lease.id);
 expect(await resolveGroup(t.db,p,{handle:'@cohort-a/emba2027'})).toEqual(unavailable);
 expect(await listGroups(t.db,await delegate(f,'chatgpt'),{})).toEqual([]);
 expect(await listGroups(t.db,await delegate(f,'claude',[]),{})).toEqual([]);
 await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.memberA.personId]);
 expect(await listGroups(t.db,p,{})).toEqual([]);
});
it('rejects malformed addresses, cross-org bindings and Data API access',async()=>{
 const f=await fixture();
 for(const namespace of ['Aaa','a',' aaaa','aa/aa','éé','x'.repeat(49)]) await expect(registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace,slug:'good'})).rejects.toThrow();
 await expect(registerGroupAddress(t.db,f.organizer,{orgId:randomUUID(),loopId:f.vietnam.loopId,namespace:'cohort',slug:'good'})).rejects.toThrow();
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'good'});
 const other=await secondGroup(f);
 await expect(registerGroupAddress(t.db,f.organizer,{...other,namespace:'cohort',slug:'different'})).rejects.toThrow('conflict');
 await expect(t.db.query('insert into emba_group_address(org_id,loop_id,namespace,slug) values($1,$2,$3,$4)',[f.orgId,other.loopId,'cohort','cross-tenant'])).rejects.toThrow();
 await expect(t.db.query('delete from emba_group_address')).rejects.toThrow();
 for(const role of ['anon','authenticated']) await expect(t.db.tx(async q=>{await q.query(`set local role ${role}`);await q.query('select * from emba_group_address');})).rejects.toThrow();
});
it('does not inherit a parent lease, accept expired consent or let hidden matches consume a list slot',async()=>{
 const f=await fixture(),p=await delegate(f);
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'aa-hidden'});
 await registerGroupAddress(t.db,f.organizer,{...f.estonia,namespace:'cohort',slug:'zz-visible'});
 await grantLease(t.db,f.memberA,{orgId:f.orgId,loopId:f.rootId,clientId:'claude',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect(await listGroups(t.db,p,{})).toEqual([]);
 const lease=await grantLease(t.db,f.memberA,{...f.estonia,clientId:'claude',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect(await listGroups(t.db,p,{limit:1})).toEqual([expect.objectContaining({loopId:f.estonia.loopId})]);
 await t.db.query("update emba_lease set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '2 seconds' where id=$1",[lease.id]);
 expect(await resolveGroup(t.db,p,{handle:'@cohort/zz-visible'})).toEqual({status:'unavailable',connectionsPath:'/emba'});
});
it('fails closed when audit or authority fails before output and masks expired-principal resolution',async()=>{
 const f=await fixture();await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'trip'});
 const failing:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  if(sql.startsWith('insert into emba_audit'))throw new Error('audit unavailable');return q.query<T>(sql,params);
 }}))};
 await expect(listGroups(failing,f.memberA,{})).rejects.toThrow('audit unavailable');
 const revoked:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  const result=await q.query<T>(sql,params);if(sql.startsWith('insert into emba_audit'))await q.query('update emba_role set revoked_at=now() where person_id=$1',[f.memberA.personId]);return result;
 }}))};
 await expect(listGroups(revoked,f.memberA,{})).rejects.toThrow('forbidden');
 const expired={...f.memberA,expiresAt:0};
 expect(await resolveGroup(t.db,expired,{handle:'@cohort/trip'})).toEqual({status:'unavailable',connectionsPath:'/emba'});
 expect(await resolveGroup(t.db,expired,{handle:'@cohort/unknown'})).toEqual({status:'unavailable',connectionsPath:'/emba'});
});
it('allows only one concurrent canonical binding without reassigning either loop',async()=>{
 const f=await fixture();
 const results=await Promise.allSettled([f.vietnam,f.estonia].map(scope=>registerGroupAddress(t.db,f.organizer,{...scope,namespace:'cohort',slug:'same'})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect((await t.db.query('select * from emba_group_address')).rows).toHaveLength(1);
});
