// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {claim,fileOutput,LIMITS,logDecision,type WriteResult} from '@/lib/emba/team-records';

// Design D16. The in-process test database has one connection, so writers
// cannot overlap there. These run against a real Postgres (QB_DB=remote),
// where each write takes its own pooled connection.
const parallel=process.env.QB_DB==='remote';
let t:TestDb;
beforeAll(async()=>{if(parallel)t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{if(parallel){await t.reset();await t.db.query('delete from emba_deletion_tombstone');}});
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'cohort',slug:'workspace'});
 return {...f,root};
}
const numbers=(results:WriteResult[])=>results.flatMap(result=>result.saved?[result.record.number]:[]).sort((a,b)=>a-b);

it.skipIf(!parallel)('gives five simultaneous writers five different numbers and an unbroken change log',async()=>{
 const f=await fixture();
 const results=await Promise.all(f.members.slice(0,5).map((member,i)=>claim(t.db,member,{...f.root,what:`Part ${i}`})));
 expect(numbers(results)).toEqual([1,2,3,4,5]);
 const {rows}=await t.db.query<{seq:number}>('select seq::int as seq from emba_team_change order by seq');
 expect(rows.map(row=>row.seq)).toEqual([1,2,3,4,5]);
});
it.skipIf(!parallel)('does not deadlock when simultaneous writers name each other',async()=>{
 const f=await fixture();
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 for(let round=0;round<5;round++){
  const results=await Promise.all([
   claim(t.db,f.memberA,{...f.root,what:`For Ben ${round}`,owner:'ben',tags:['ben']}),
   claim(t.db,f.memberB,{...f.root,what:`For Ana ${round}`,owner:'ana',tags:['ana']}),
  ]);
  expect(results.map(result=>result.saved)).toEqual([true,true]);
 }
});
it.skipIf(!parallel)('lets exactly one of two simultaneous supersedes win',async()=>{
 const f=await fixture();
 await logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Slides.',newTopic:true});
 const results=await Promise.all(['Canva.','Keynote.'].map((statement,i)=>logDecision(t.db,f.members[i],{...f.root,topic:'deck-tool',statement,supersedes:1})));
 expect(results.filter(result=>result.saved)).toHaveLength(1);
 expect(results.find(result=>!result.saved)).toMatchObject({reason:'stale',current:{state:'current'}});
 const {rows}=await t.db.query("select 1 from emba_team_record where kind='decision' and state='current'");
 expect(rows).toHaveLength(1);
});
it.skipIf(!parallel)('never saves an output checked against decisions that changed during the save',async()=>{
 const f=await fixture();
 const [decision,output]=await Promise.all([
  logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Slides.',newTopic:true}),
  fileOutput(t.db,f.memberB,{...f.root,url:'https://docs.google.com/document/d/abc',title:'Deck',summary:'Built in Canva.',decisionsVersion:0}),
 ]);
 expect(decision.saved).toBe(true);
 // Either the output landed first, or it was sent back to read the new decision.
 if(output.saved)expect(output.record.number).toBe(1);
 else expect(output).toMatchObject({reason:'decisions_needed',decisionsVersion:1});
});
it.skipIf(!parallel)('stores one record for the same operation sent twice at once',async()=>{
 const f=await fixture();
 const input={...f.root,what:'Slides 1 to 5',operationId:'00000000-0000-4000-8000-000000000777'};
 const results=await Promise.all([claim(t.db,f.memberA,input),claim(t.db,f.memberA,input)]);
 expect(numbers(results)).toEqual([1,1]);
 expect(results.map(result=>result.saved&&result.replayed).sort()).toEqual([false,true]);
});
it.skipIf(!parallel)('holds the hourly cap when the last allowed writes arrive together',async()=>{
 const f=await fixture();
 for(let i=0;i<LIMITS.writesPerHour-1;i++)await claim(t.db,f.memberA,{...f.root,what:`Task ${i}`});
 const results=await Promise.all([1,2,3,4,5].map(i=>claim(t.db,f.memberA,{...f.root,what:`Last ${i}`})));
 expect(results.filter(result=>result.saved)).toHaveLength(1);
 expect(results.filter(result=>!result.saved&&result.reason==='cap')).toHaveLength(4);
},60000);
it.skipIf(!parallel)('saves nothing and says busy when the team lock is held past two seconds',async()=>{
 const f=await fixture();
 await claim(t.db,f.memberA,{...f.root,what:'First'});
 let release=()=>{};
 const held=t.db.tx(async q=>{
  await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[f.root.orgId,f.root.loopId]);
  await new Promise<void>(resolve=>{release=resolve;});
 });
 await new Promise(resolve=>setTimeout(resolve,200));
 expect(await claim(t.db,f.memberB,{...f.root,what:'Blocked'})).toEqual({saved:false,reason:'busy'});
 release();await held;
 expect((await claim(t.db,f.memberB,{...f.root,what:'Blocked'})).saved).toBe(true);
},15000);
