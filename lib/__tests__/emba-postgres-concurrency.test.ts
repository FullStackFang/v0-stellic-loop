// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {uploadDocument,processDocument,deleteDocument} from '@/lib/emba/knowledge';
import {registerAnnouncementKey,retireAnnouncementKey} from '@/lib/emba/announcements';
import {issueInvitation,acceptInvitation} from '@/lib/emba/invitations';
import {openTestDb,makePerson,type TestDb} from '@/test/db';
import {authenticate,canAccessLoop} from '@/lib/emba/access';
import {saveMemory} from '@/lib/emba/memory';
import type {Db,Q} from '@/lib/db';
import {approveConfirmation,consumeConfirmation} from '@/lib/emba/confirmation';
import {createActivity,saveCommitment,finalizeActivity,withdrawCommitment,readActivity} from '@/lib/emba/activities';

describe.skipIf(process.env.QB_DB!=='remote')('native PostgreSQL cross-connection serialization',()=>{
 let t:TestDb;
 beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});afterAll(async()=>{await t.close();});
 async function member() {
  const person=await makePerson(t.db);await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('native',$1,$2,now())",[person.id,person.id]);
  const claims={issuer:'native',subject:person.id,expiresAt:Date.now()+3600000,verifiedEmail:person.id+'@example.test'};
  return {p:(await authenticate(t.db,'trusted',async()=>claims))!,agent:(await authenticate(t.db,'trusted',async()=>({...claims,clientId:'test-agent'})))!};
 }
 it('serializes same-person writes before shared authorization locks can be upgraded',async()=>{
  const {p}=await member();
  // Widen the upgrade race on real independent backend connections. A shared
  // authorization lock held before the person UPDATE deadlocks here.
  const delayed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
   const result=await q.query<T>(sql,params);
   if(sql.includes('for share'))await q.query('select pg_sleep(0.025)');
   return result;
  }}))};
  const inputs=[1,2].map(()=>({operationId:randomUUID(),kind:'want',text:'Quiet walk',category:'outdoors',strength:0.8,confidence:1}));
  const results=await Promise.all(inputs.map(input=>saveMemory(delayed,p,input)));
  expect(new Set(results.map(r=>r.id)).size).toBe(2);
 },20000);
 it('holds inherited authority rows and hierarchy against concurrent revocation until commit',async()=>{
  const {p}=await member();
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Lock test') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'lock') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,p.personId]);
  const assertLocked=async(sql:string,params:unknown[])=>{
   await expect(t.db.tx(async(q:Q)=>{await q.query("set local lock_timeout='100ms'");await q.query(sql,params);})).rejects.toMatchObject({code:'55P03'});
  };
  await t.db.tx(async q=>{
   expect(await canAccessLoop(q,p,org.id,loop.id,'commit')).toBe(true);
   await assertLocked('update emba_role set revoked_at=now() where person_id=$1',[p.personId]);
   await assertLocked('update emba_membership set revoked_at=now() where person_id=$1',[p.personId]);
   await assertLocked("update emba_loop set path='changed' where id=$1",[loop.id]);
  });
  await t.db.query('update emba_role set revoked_at=now() where person_id=$1',[p.personId]);
  expect(await t.db.tx(q=>canAccessLoop(q,p,org.id,loop.id,'commit'))).toBe(false);
 });
 it('activity reads wait for a deleting person before taking the activity lock',async()=>{
  const {p}=await member();
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Deletion lock test') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'lock') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,p.personId]);
  const activity=await createActivity(t.db,p,{orgId:org.id,loopId:loop.id,title:'Walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T00:00:00Z'});
  let waiting!:()=>void;const atPersonalLock=new Promise<void>(resolve=>{waiting=resolve;});
  const observed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
   if(sql.includes('for share'))waiting();
   return q.query<T>(sql,params);
  }}))};
  let read:ReturnType<typeof readActivity>|undefined;
  try {
   await t.db.tx(async q=>{
    await q.query('select id from person where id=$1 for update',[p.personId]);
    read=readActivity(observed,p,activity.id);
    await atPersonalLock;
    // The privacy purge takes activity next. NOWAIT exposes inversion without
    // relying on the PostgreSQL deadlock detector or timing sleeps.
    await q.query('select id from emba_activity where id=$1 for update nowait',[activity.id]);
   });
  } finally {await read;}
 });
 it('document and key mutations authorize before locking resources used by deletion',async()=>{
  const {p}=await member();
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Resource locks') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'lock') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,p.personId]);
  const doc=await uploadDocument(t.db,p,{operationId:randomUUID(),orgId:org.id,loopId:loop.id,title:'Guide',mediaType:'text/plain',body:'Hanoi walk'});
  const {publicKey}=generateKeyPairSync('ed25519');
  const key=await registerAnnouncementKey(t.db,p,{orgId:org.id,loopId:loop.id,publicKey:publicKey.export({type:'spki',format:'pem'}).toString()});
  for(const [run,sql,id] of [
   [(db:Db)=>processDocument(db,p,doc.id,1),'select document_id from emba_document_version where document_id=$1 for update nowait',doc.id],
   [(db:Db)=>deleteDocument(db,p,doc.id,1),'select document_id from emba_document_version where document_id=$1 for update nowait',doc.id],
   [(db:Db)=>retireAnnouncementKey(db,p,key.id,'retired'),'select id from emba_announcement_key where id=$1 for update nowait',key.id],
  ] as const) {
   let waiting!:()=>void;const atPersonalLock=new Promise<void>(resolve=>{waiting=resolve;});
   const observed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(query:string,params?:unknown[])=>{
    if(query.includes('for share')&&query.includes('person'))waiting();
    return q.query<T>(query,params);
   }}))};
   let operation:Promise<void>|undefined;
   try {await t.db.tx(async q=>{
    await q.query('select id from person where id=$1 for update',[p.personId]);
    operation=run(observed);await atPersonalLock;
    await q.query(sql,[id]);
   });} finally {await operation;}
  }
 });
 it('invitation acceptance locks the issuer before its invitation, matching issuer erasure',async()=>{
  const issuer=await member(),recipient=await member();
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Invitation locks') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'lock') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,issuer.p.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,issuer.p.personId]);
  const invite=await issueInvitation(t.db,issuer.p,{orgId:org.id,loopId:loop.id,recipientEmail:recipient.p.verifiedEmail!,role:'member',expiresAt:'2099-01-01T00:00:00Z'});
  let waiting!:()=>void;const atIssuerLock=new Promise<void>(resolve=>{waiting=resolve;});
  const observed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
   if(params?.includes(issuer.p.personId)&&(sql.includes('from person')||sql.includes('join emba_identity')))waiting();
   return q.query<T>(sql,params);
  }}))};
  let acceptance:Promise<void>|undefined;
  try {await t.db.tx(async q=>{
   await q.query('select id from person where id=$1 for update',[issuer.p.personId]);
   await q.query('select person_id from emba_identity where person_id=$1 for update',[issuer.p.personId]);
   acceptance=acceptInvitation(observed,recipient.p,invite.token);await atIssuerLock;
   await q.query('select id from emba_invitation where id=$1 for update nowait',[invite.id]);
  });} finally {await acceptance;}
 });
 it('uses distinct backend connections and consumes a raced approval only once',async()=>{
  const a=await member();
  const input={clientId:'test-agent',action:'publication' as const,targetId:randomUUID(),expectedVersion:1,payload:{title:'Native race'}};
  const approval=await approveConfirmation(t.db,a.p,input);
  const pids=new Set<number>();let release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});
  await Promise.all([1,2].map(()=>t.db.tx(async q=>{const {rows:[row]}=await q.query<{pid:number}>('select pg_backend_pid() pid');pids.add(row.pid);if(pids.size===2)release();await barrier;})));
  expect(pids.size).toBe(2);
  let effects=0;
  const results=await Promise.allSettled([1,2].map(()=>consumeConfirmation(t.db,a.agent,approval.id,input,async q=>{await q.query('update person set show_name=false where id=$1',[a.p.personId]);effects++;return true;})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(effects).toBe(1);
 });
 it('serializes withdrawal against deadline finalization and preserves one resolution/outbox',async()=>{
  const a=await member(),b=await member();
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('EMBA native') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'emba') returning id",[org.id]);
  for(const {p} of [a,b]){await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,p.personId]);}
  const activity=await createActivity(t.db,a.p,{orgId:org.id,loopId:loop.id,title:'Race walk',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',deadline:'2099-01-01T00:00:00Z'});
  for(const {p} of [a,b])await saveCommitment(t.db,p,{activityId:activity.id,revision:1,operationId:randomUUID(),minOthers:1,requires:[]});
  await t.db.query("update emba_activity_revision set deadline=clock_timestamp()-interval '1 second' where activity_id=$1",[activity.id]);
  await Promise.all([finalizeActivity(t.db,a.p,activity.id,1),withdrawCommitment(t.db,b.p,activity.id,1)]);
  await finalizeActivity(t.db,a.p,activity.id,1);
  expect((await t.db.query('select * from emba_resolution where activity_id=$1',[activity.id])).rows).toHaveLength(1);
  expect((await t.db.query("select * from emba_commitment where activity_id=$1 and status='satisfied'",[activity.id])).rows).toEqual([]);
  const {rows:[counts]}=await t.db.query<{inbox:number;outbox:number}>('select (select count(*)::int from emba_inbox) inbox,(select count(*)::int from emba_outbox) outbox');
  expect(counts.inbox).toBeGreaterThan(0);expect(counts.outbox).toBe(counts.inbox);
 });
});
