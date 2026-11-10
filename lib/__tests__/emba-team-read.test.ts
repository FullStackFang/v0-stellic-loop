// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,listLeases,renewGroupReadLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {createTeamEvent} from '@/lib/emba/team-events';
import {briefHistory,saveBrief,teamBrief,teamState,whatsNew} from '@/lib/emba/team-read';
import {amendRecord,claim,fileOutput,logDecision,postAnnouncement,type WriteResult} from '@/lib/emba/team-records';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'cohort',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,scope:{orgId:string;loopId:string},days:number,client='claude') {
 await grantLease(t.db,f.memberA,{...scope,clientId:client,actions:['plan:read'],expiresAt:new Date(Date.now()+days*86400000).toISOString()});
 return (await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse('2099-01-01T00:00:00Z')})))!;
}
const ok=(result:WriteResult)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const out=(f:F,extra:Record<string,unknown>={})=>({...f.root,url:'https://docs.google.com/document/d/abc',title:'Market sizing',summary:'TAM is 4.2bn.',decisionsVersion:0,...extra});
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const idFree=(value:unknown,f:F)=>{const text=JSON.stringify(value);for(const person of [...f.members,f.organizer])expect(text).not.toContain(person.personId);};

it('lets an owner or organizer write the brief on the site, keeps history, and returns it in team_brief',async()=>{
 const f=await fixture();
 expect(await teamBrief(t.db,f.memberA,f.root)).toMatchObject({team:{handle:'@cohort',name:'Synthetic EMBA'},timezone:'UTC',brief:null,announcements:[],counts:{openClaims:0,currentOutputs:0,currentDecisions:0},grantExpiresOn:null,untrusted:true});
 const first=await saveBrief(t.db,f.organizer,{...f.root,body:'  Final deck for Strategy.\r\n\r\n\r\n\r\nTen slides\u200B, due Friday.\t \n',deadline:'2026-11-20',timezone:'America/New_York',expectedVersion:0});
 expect(first).toMatchObject({version:1,body:'Final deck for Strategy.\n\nTen slides, due Friday.',deadline:'2026-11-20'});
 // A second editor holding the old version is told; nothing is merged.
 await expect(saveBrief(t.db,f.organizer,{...f.root,body:'Late edit',expectedVersion:0})).rejects.toThrow('conflict');
 expect(await saveBrief(t.db,f.organizer,{...f.root,body:'Twelve slides.',expectedVersion:1})).toMatchObject({version:2,deadline:null});
 expect((await briefHistory(t.db,f.organizer,f.root)).map(item=>[item.version,item.body])).toEqual([[2,'Twelve slides.'],[1,'Final deck for Strategy.\n\nTen slides, due Friday.']]);
 // Members and every assistant are denied, on the editor and on its history.
 const agent=await assistant(f,f.root,30);
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.memberA.personId]);
 await expect(saveBrief(t.db,agent,{...f.root,body:'From an assistant',expectedVersion:2})).rejects.toThrow('forbidden');
 await t.db.query("update emba_role set role='member' where person_id=$1",[f.memberA.personId]);
 await expect(saveBrief(t.db,f.memberA,{...f.root,body:'From a member',expectedVersion:2})).rejects.toThrow('forbidden');
 await expect(briefHistory(t.db,f.memberA,f.root)).rejects.toThrow('forbidden');
 for(const bad of [{body:'x'.repeat(4001)},{body:'ok',timezone:'Mars/Olympus'},{body:'ok',deadline:'2026-02-30'},{body:'ok',extra:1}])
  await expect(saveBrief(t.db,f.organizer,{...f.root,expectedVersion:2,...bad})).rejects.toThrow();
 expect(await teamBrief(t.db,agent,f.root)).toMatchObject({timezone:'America/New_York',brief:{version:2,body:'Twelve slides.',deadline:null},grantExpiresOn:null});
});
it('returns the five newest announcements, resource titles, counts, and a warning when the grant is about to end',async()=>{
 const f=await fixture();
 for(let i=1;i<=6;i++)ok(await postAnnouncement(t.db,f.organizer,{...f.root,text:`Note ${i}`}));
 ok(await amendRecord(t.db,f.organizer,{...f.root,number:6,action:'withdraw'}));
 ok(await claim(t.db,f.memberA,{...f.root,what:'Slides'}));
 ok(await claim(t.db,f.memberA,{...f.root,what:'Appendix',owner:'ben'}));
 ok(await fileOutput(t.db,f.memberA,out(f)));
 const brief=await teamBrief(t.db,f.memberB,f.root);
 expect(brief.announcements.map(item=>item.text)).toEqual(['Note 5','Note 4','Note 3','Note 2','Note 1']);
 expect(brief.counts).toEqual({openClaims:2,currentOutputs:1,currentDecisions:0});
 expect(brief.resources).toEqual({items:[],more:0});
 // Uploaded sources of the team are listed by title only.
 expect((await teamBrief(t.db,f.memberA,f.vietnam)).resources).toEqual({items:['Hanoi itinerary v1'],more:0});
 expect((await teamBrief(t.db,f.memberA,f.vietnam)).team).toEqual({handle:'@cohort/vietnam',name:'Synthetic EMBA'});
 const ending=await assistant(f,f.root,3,'ending');
 expect((await teamBrief(t.db,ending,f.root)).grantExpiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect((await teamBrief(t.db,await assistant(f,f.root,20,'fresh'),f.root)).grantExpiresOn).toBeNull();
 idFree(brief,f);expect(JSON.stringify(brief)).not.toMatch(uuids);
 // No grant for this team, or no membership: nothing.
 await expect(teamBrief(t.db,ending,f.vietnam)).rejects.toThrow('forbidden');
 await expect(teamBrief(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
});
it('answers where the team is: claims with due dates, current outputs, decisions and conflict flags',async()=>{
 const f=await fixture();
 await saveBrief(t.db,f.organizer,{...f.root,body:'Deck.',deadline:'2026-11-20',expectedVersion:0});
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 ok(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Google Slides.',newTopic:true}));
 ok(await claim(t.db,f.memberA,{...f.root,what:'Overdue part',dueOn:'2000-01-01'}));
 ok(await claim(t.db,f.memberA,{...f.root,what:'Deck part',dueOn:'2099-01-01',event:'final-deck',owner:'ben'}));
 ok(await claim(t.db,f.memberB,{...f.root,what:'No date'}));
 ok(await fileOutput(t.db,f.memberB,out(f,{decisionsVersion:1,conflictsWith:[1],fileAnyway:true,event:'final-deck'})));
 ok(await fileOutput(t.db,f.memberA,out(f,{decisionsVersion:1,title:'Old'})));
 ok(await fileOutput(t.db,f.memberA,out(f,{decisionsVersion:1,title:'New',replaces:6})));
 ok(await amendRecord(t.db,f.memberB,{...f.root,number:4,action:'done'}));
 const state=await teamState(t.db,f.memberA,f.root);
 expect(state).toMatchObject({team:{handle:'@cohort'},event:null,deadline:'2026-11-20',decisionsVersion:1,untrusted:true});
 expect(state.claims.items.map(item=>[item.number,item.claimStatus,item.dueOn,item.pastDue,item.event,item.owner?.handle])).toEqual([
  [2,'open','2000-01-01',true,null,'@cohort/ana'],[3,'proposed','2099-01-01',false,'final-deck','@cohort/ben']]);
 expect(state.outputs.items.map(item=>[item.number,item.title,item.event])).toEqual([[7,'New',null],[5,'Market sizing','final-deck']]);
 expect(state.decisions.items.map(item=>[item.number,item.topic,item.statement])).toEqual([[1,'deck-tool','Google Slides.']]);
 expect(state.conflicts).toEqual({items:[{output:5,decision:1,topic:'deck-tool',state:'flagged'}],more:0});
 idFree(state,f);expect(JSON.stringify(state)).not.toMatch(uuids);
 // For an event: its claims and outputs, and the team-wide decisions.
 const scoped=await teamState(t.db,f.memberA,{...f.root,event:'final-deck'});
 expect([scoped.event,scoped.claims.items.map(item=>item.number),scoped.outputs.items.map(item=>item.number),scoped.decisions.items.map(item=>item.number)]).toEqual(['final-deck',[3],[5],[1]]);
 await expect(teamState(t.db,f.memberA,{...f.root,event:'no-such'})).rejects.toThrow('not_found');
 await expect(teamState(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 // A read-only grant reads; an assistant with no grant for the team does not.
 expect((await teamState(t.db,await assistant(f,f.root,30),f.root)).claims.items).toHaveLength(2);
 await expect(teamState(t.db,await assistant(f,f.vietnam,30,'elsewhere'),f.root)).rejects.toThrow('forbidden');
});
it('caps each list at 30 and counts the rest',async()=>{
 const f=await fixture();
 for(let i=0;i<34;i++)ok(await claim(t.db,f.members[i%2],{...f.root,what:`Task ${i}`}));
 const state=await teamState(t.db,f.memberA,f.root);
 expect([state.claims.items.length,state.claims.more,state.outputs]).toEqual([30,4,{items:[],more:0}]);
});
it('returns changes in commit order behind an opaque cursor, and never misses one',async()=>{
 const f=await fixture();
 const empty=await whatsNew(t.db,f.memberA,f.root);
 expect(empty).toMatchObject({window:'last_7_days',changes:[],more:false});
 ok(await claim(t.db,f.memberA,{...f.root,what:'Slides',tags:['ben']}));
 ok(await claim(t.db,f.memberA,{...f.root,what:'Appendix',owner:'ben'}));
 ok(await fileOutput(t.db,f.memberA,out(f)));
 const first=await whatsNew(t.db,f.memberB,f.root);
 expect(first.window).toBe('last_7_days');
 expect(first.changes.map(item=>[item.action,item.record.number,item.by.handle,item.about?.isYou??null,item.mentionsYou])).toEqual([
  ['claimed',1,'@cohort/ana',null,true],['tagged',1,'@cohort/ana',true,true],['proposed',2,'@cohort/ana',true,true],['filed',3,'@cohort/ana',null,false]]);
 expect(first.cursor).toMatch(/^n[0-9a-f]{6}-[0-9a-z]+$/);
 // Ana is not mentioned by her own writes.
 expect((await whatsNew(t.db,f.memberA,f.root)).changes.map(item=>item.mentionsYou)).toEqual([false,false,false,false]);
 expect(await whatsNew(t.db,f.memberB,{...f.root,cursor:first.cursor})).toMatchObject({window:'cursor',changes:[],cursor:first.cursor,more:false});
 // A write after the call is in the next call with the returned cursor; the cursor taken when the team was empty sees everything.
 ok(await amendRecord(t.db,f.memberB,{...f.root,number:2,action:'confirm'}));
 ok(await amendRecord(t.db,f.memberA,{...f.root,number:3,action:'withdraw'}));
 const next=await whatsNew(t.db,f.memberB,{...f.root,cursor:first.cursor});
 expect(next.changes.map(item=>[item.action,item.record.number])).toEqual([['confirmed',2],['withdrawn',3]]);
 // A withdrawn record is still listed as a change, with none of its text.
 expect(next.changes[1].record).not.toHaveProperty('title');expect(JSON.stringify(next)).not.toContain('Market sizing');
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:empty.cursor})).changes).toHaveLength(6);
 idFree(next,f);expect(JSON.stringify(next)).not.toMatch(uuids);
 // A cursor belongs to one team; a malformed one is invalid.
 await expect(whatsNew(t.db,f.memberB,{...f.vietnam,cursor:first.cursor})).rejects.toThrow('not_found');
 await expect(whatsNew(t.db,f.memberB,{...f.root,cursor:'17'})).rejects.toThrow();
 await expect(whatsNew(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
});
it('pages thirty changes at a time, and without a cursor looks back seven days or to a given date',async()=>{
 const f=await fixture();
 for(let i=0;i<33;i++)ok(await claim(t.db,f.members[i%2],{...f.root,what:`Task ${i}`}));
 const page=await whatsNew(t.db,f.memberA,f.root);
 expect([page.changes.length,page.more,page.changes[0].record.number,page.changes[29].record.number]).toEqual([30,true,1,30]);
 const rest=await whatsNew(t.db,f.memberA,{...f.root,cursor:page.cursor});
 expect([rest.changes.map(item=>item.record.number),rest.more]).toEqual([[31,32,33],false]);
 // The change log is not editable; the test moves time by lifting its guard for one statement.
 await t.db.query('alter table emba_team_change disable trigger emba_team_change_fixed');
 await t.db.query("update emba_team_change set at=at-interval '10 days' where seq<=31");
 await t.db.query('alter table emba_team_change enable trigger emba_team_change_fixed');
 expect((await whatsNew(t.db,f.memberA,f.root)).changes.map(item=>item.record.number)).toEqual([32,33]);
 const since=new Date(Date.now()-12*86400000).toISOString().slice(0,10);
 expect(await whatsNew(t.db,f.memberA,{...f.root,since})).toMatchObject({window:'since',more:true});
 // The cursor is authoritative: with one, the date is not a second filter.
 expect((await whatsNew(t.db,f.memberA,{...f.root,cursor:page.cursor})).changes).toHaveLength(3);
});

it('renews a read-and-write team grant with the same actions, which clears the expiry warning',async()=>{
 const f=await fixture();
 const soon=new Date(Date.now()+3*86400000).toISOString();
 const lease=await grantLease(t.db,f.memberA,{...f.root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:soon});
 const agent=(await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse('2099-01-01T00:00:00Z')})))!;
 expect((await teamBrief(t.db,agent,f.root)).grantExpiresOn).not.toBeNull();
 // Only the member, on the site.
 await expect(renewGroupReadLease(t.db,agent,lease.id)).rejects.toThrow('forbidden');
 await expect(renewGroupReadLease(t.db,f.memberB,lease.id)).rejects.toThrow('forbidden');
 await renewGroupReadLease(t.db,f.memberA,lease.id);
 const leases=(await listLeases(t.db,f.memberA) as {id:string;actions:string[];revoked_at:string|null;expires_at:string}[]).filter(item=>item.actions.includes('group-memory:write'));
 expect(leases.map(item=>[item.id===lease.id,[...item.actions].sort(),item.revoked_at===null]).sort()).toEqual([[false,['group-memory:write','plan:read'],true],[true,['group-memory:write','plan:read'],false]]);
 const renewed=leases.find(item=>item.id!==lease.id)!;
 expect(Date.parse(renewed.expires_at)-Date.now()).toBeGreaterThan(29*86400000);
 expect((await teamBrief(t.db,agent,f.root)).grantExpiresOn).toBeNull();
 expect(ok(await claim(t.db,agent,{...f.root,what:'Still allowed'})).record.assistant).toBe('claude');
 // A grant of any other shape is not renewed here.
 const other=await grantLease(t.db,f.memberA,{...f.root,clientId:'other',actions:['plan:read','activity:write'],expiresAt:soon});
 await expect(renewGroupReadLease(t.db,f.memberA,other.id)).rejects.toThrow('forbidden');
});
