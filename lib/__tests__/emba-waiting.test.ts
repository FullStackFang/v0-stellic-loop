// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {answerAsk,closeAsk,createAsk,extendAsk} from '@/lib/emba/team-asks';
import {addEvent} from '@/lib/emba/team-events';
import {setInterest,upcomingEvents} from '@/lib/emba/team-interest';
import {saveBrief} from '@/lib/emba/team-read';
import {amendRecord,claim,postAnnouncement} from '@/lib/emba/team-records';
import {ON_YOU,onYou,waiting,WAITING,type OnYou,type Waiting} from '@/lib/emba/team-waiting';

// Specs: openspec/changes/loop-club-reach/specs/waiting.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'club',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
type Team={orgId:string;loopId:string};
async function assistant(f:F,who:Principal,teams:Team[]=[f.root],client='claude') {
 for(const team of teams)await grantLease(t.db,who,{...team,clientId:client,actions:['plan:read','group-memory:write'],expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,19)+'Z';
const ask=(f:F,who:Principal,question:string,days=5,team:Team=f.root)=>createAsk(t.db,who,{...team,question,kind:'one',options:['Yes','No'],closesAt:inDays(days)});
const event=(f:F,slug:string,days:number,team:Team=f.root)=>addEvent(t.db,f.organizer,{...team,slug,name:slug,startsAt:inDays(days)});
const kinds=(result:Waiting)=>result.items.map(item=>item.kind==='ask'?`ask ${item.ask.number}`:item.kind==='event'||item.kind==='idea'?`${item.kind} ${item.event.slug}`:`${item.kind} ${item.record.number}`);
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

it('returns unanswered asks, unacted events, mentions and announcements across teams, asks closing soonest first',async()=>{
 const f=await fixture();
 expect(await waiting(t.db,f.memberB)).toEqual({count:0,items:[],more:[],untrusted:true});
 await ask(f,f.memberA,'Later?',9);await ask(f,f.memberA,'Sooner?',2,f.vietnam);
 await event(f,'tasting',6);await event(f,'mixer',3);
 // An event with no date is a label: it never ends, so it never waits.
 expect((await addEvent(t.db,f.organizer,{...f.root,slug:'label',name:'Label'})).saved).toBe(true);
 expect((await claim(t.db,f.memberA,{...f.root,what:'Book the room',tags:['ben']})).saved).toBe(true);
 expect((await postAnnouncement(t.db,f.organizer,{...f.root,text:'Dues are due Friday.'})).saved).toBe(true);
 const result=await waiting(t.db,f.memberB);
 expect(kinds(result)).toEqual(['ask 1','ask 1','event mixer','event tasting','mention 2','announcement 3']);
 expect(result).toMatchObject({count:6,more:[],items:[{team:{handle:'@club/vietnam'},ask:{question:'Sooner?',yourAnswer:null}},{team:{handle:'@club'},ask:{question:'Later?'}},
  {team:{handle:'@club'},event:{slug:'mixer',youAreInterested:false}},{},{record:{kind:'claim',what:'Book the room',tags:[{handle:'@club/ben',isYou:true}]}},{record:{kind:'announcement',text:'Dues are due Friday.'}}]});
 // Nothing names a person or a thing by an internal id.
 expect(JSON.stringify(result)).not.toMatch(uuids);
 // The person who asked still has their own ask to answer; the organizer's own event and announcement do not wait for the organizer.
 expect(kinds(await waiting(t.db,f.memberA))).toEqual(['ask 1','ask 1','event mixer','event tasting','announcement 3']);
 expect(kinds(await waiting(t.db,f.organizer))).toEqual(['ask 1','ask 1']);
 // A follower reads the team and cannot answer or mark interest: only what they are shown waits for them.
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.members[3].personId]);
 expect(kinds(await waiting(t.db,f.members[3]))).toEqual(['announcement 3']);
 // Someone in no team has nothing waiting, and is told nothing.
 expect(await waiting(t.db,f.nonmember)).toEqual({count:0,items:[],more:[],untrusted:true});
 await expect(waiting(t.db,f.memberB,{personId:f.memberA.personId})).rejects.toThrow();
},120000);

it('keeps an item waiting until the member acts on it, for that member only',async()=>{
 const f=await fixture();
 await ask(f,f.memberA,'Red or white?');await ask(f,f.memberA,'Closing early?');
 await event(f,'mixer',3);await event(f,'tasting',6);await event(f,'hike',9);
 await postAnnouncement(t.db,f.organizer,{...f.root,text:'Dues are due Friday.'});
 await claim(t.db,f.memberA,{...f.root,what:'Bring glasses',owner:'ben'});
 const first=await waiting(t.db,f.memberB);
 expect(kinds(first)).toEqual(['ask 1','ask 2','event mixer','event tasting','event hike','mention 4','announcement 3']);
 // Asked again without acting: asks and events are still there; the mention and the announcement were shown once.
 expect(kinds(await waiting(t.db,f.memberB))).toEqual(['ask 1','ask 2','event mixer','event tasting','event hike']);
 // Answering, an ask closing, interest and a decline each clear their own item.
 expect((await answerAsk(t.db,f.memberB,{...f.root,number:1,choices:['Yes']})).saved).toBe(true);
 expect((await closeAsk(t.db,f.memberA,{...f.root,number:2})).saved).toBe(true);
 expect(await setInterest(t.db,f.memberB,{...f.root,event:'mixer'})).toMatchObject({saved:true,interested:true,declined:false,changed:true});
 expect(await setInterest(t.db,f.memberB,{...f.root,event:'tasting',interested:false,decline:true})).toMatchObject({saved:true,interested:false,declined:true,changed:true,event:{interested:0,youAreInterested:false}});
 expect(await setInterest(t.db,f.memberB,{...f.root,event:'tasting',interested:false,decline:true})).toMatchObject({saved:true,changed:false});
 expect(kinds(await waiting(t.db,f.memberB))).toEqual(['event hike']);
 // Taking an answer back makes the ask wait again; taking interest back without declining makes the event wait again.
 await answerAsk(t.db,f.memberB,{...f.root,number:1,remove:true});await setInterest(t.db,f.memberB,{...f.root,event:'mixer',interested:false});
 expect(kinds(await waiting(t.db,f.memberB))).toEqual(['ask 1','event mixer','event hike']);
 // A decline removes interest, is seen by nobody else, and is undone by marking interest.
 await setInterest(t.db,f.memberB,{...f.root,event:'hike'});
 expect(await setInterest(t.db,f.memberB,{...f.root,event:'hike',interested:false,decline:true})).toMatchObject({saved:true,changed:true,event:{interested:0}});
 expect(JSON.stringify(await upcomingEvents(t.db,f.memberA,{...f.root,people:true}))).not.toMatch(/declin/i);
 expect(await setInterest(t.db,f.memberB,{...f.root,event:'hike'})).toMatchObject({saved:true,interested:true,declined:false,event:{interested:1,youAreInterested:true}});
 expect((await t.db.query('select count(*)::int as n from emba_event_decline where person_id=$1',[f.memberB.personId])).rows).toEqual([{n:1}]);
 await expect(setInterest(t.db,f.memberB,{...f.root,event:'hike',interested:true,decline:true})).rejects.toThrow();
 // None of that changed what waits for another member.
 expect(kinds(await waiting(t.db,f.members[2]))).toEqual(['ask 1','event mixer','event tasting','event hike','announcement 3']);
 // An event that ended, an archived one and a withdrawn announcement do not wait.
 await t.db.query("update emba_team_event set starts_at=clock_timestamp()-interval '3 hours',ends_at=clock_timestamp()-interval '1 hour' where slug='mixer'");
 await postAnnouncement(t.db,f.organizer,{...f.root,text:'Never mind.'});
 expect((await amendRecord(t.db,f.organizer,{...f.root,number:5,action:'withdraw'})).saved).toBe(true);
 expect(kinds(await waiting(t.db,f.members[4]))).toEqual(['ask 1','event tasting','event hike','announcement 3']);
},120000);

it('returns nothing from a team the assistant holds no grant for, and never names it',async()=>{
 const f=await fixture();
 await ask(f,f.memberA,'In the club?');await ask(f,f.memberA,'In Vietnam?',2,f.vietnam);
 await postAnnouncement(t.db,f.organizer,{...f.vietnam,text:'Vietnam only.'});
 // The grant is on the group inside the club: it reaches that group and nothing above it.
 const agent=await assistant(f,f.memberB,[f.vietnam]);
 const result=await waiting(t.db,agent);
 expect(kinds(result)).toEqual(['ask 1','announcement 2']);
 expect(result).toMatchObject({count:2,more:[],items:[{team:{handle:'@club/vietnam'}},{team:{handle:'@club/vietnam'}}]});
 expect(JSON.stringify(result)).not.toMatch(/In the club/);
 // The club's ask was not shown to the assistant, so it still waits where the member can see it.
 expect(kinds(await waiting(t.db,f.memberB)).filter(kind=>kind.startsWith('ask'))).toEqual(['ask 1','ask 1']);
 // An assistant with no grant at all, and one whose grant ended, get nothing.
 const none=(await authenticate(t.db,'test',async()=>({issuer:f.memberB.issuer,subject:f.memberB.subject,clientId:'other',scopes:['plan:read'],expiresAt:Date.parse(forever)})))!;
 expect(await waiting(t.db,none)).toEqual({count:0,items:[],more:[],untrusted:true});
 await t.db.query("update emba_lease set revoked_at=clock_timestamp() where client_id='claude'");
 expect(await waiting(t.db,agent)).toEqual({count:0,items:[],more:[],untrusted:true});
},120000);

it('returns at most 10 items and says how many more wait in which team',async()=>{
 const f=await fixture();
 for(let n=1;n<=4;n++)await ask(f,f.members[n+1],`Club question ${n}?`,n);
 for(let n=1;n<=4;n++)await ask(f,f.members[n+1],`Vietnam question ${n}?`,n+10,f.vietnam);
 for(let n=1;n<=5;n++)await event(f,`night-${n}`,n);
 await postAnnouncement(t.db,f.organizer,{...f.root,text:'One.'});await postAnnouncement(t.db,f.organizer,{...f.vietnam,text:'Two.'});
 const result=await waiting(t.db,f.memberB);
 expect(result.items).toHaveLength(WAITING.items);
 expect(kinds(result)).toEqual(['ask 1','ask 2','ask 3','ask 4','ask 1','ask 2','ask 3','ask 4','event night-1','event night-2']);
 expect(result.count).toBe(15);
 expect(result.more).toEqual([{team:{handle:'@club/vietnam',name:'Synthetic EMBA'},count:1},{team:{handle:'@club',name:'Synthetic EMBA'},count:4}]);
 // What was not returned was not shown: the announcements still wait.
 expect((await t.db.query('select count(*)::int as n from emba_waiting_shown')).rows).toEqual([{n:0}]);
},120000);

// Specs: openspec/changes/loop-on-you/specs/on-you-page.
const todo=(f:F,who:Principal,question:string,days=5,team:Team=f.root)=>createAsk(t.db,who,{...team,question,kind:'done',closesAt:inDays(days)});
const rowsOf=(result:OnYou)=>result.rows.map(row=>row.kind==='ask'||row.kind==='missed'?`${row.kind} ${row.ask.question}`:`${row.kind} ${row.event.slug}`);
/** Moves an ask's closing time into the past, as if time had gone by. */
async function elapse(question:string,closedAgo:string) {
 await t.db.query('alter table emba_ask disable trigger emba_ask_guard');
 await t.db.query(`update emba_ask set created_at=clock_timestamp()-interval '30 days',closes_at=clock_timestamp()-interval '${closedAgo}' where question=$1`,[question]);
 await t.db.query('alter table emba_ask enable trigger emba_ask_guard');
}
it('lists what is on a member across their groups by when, with missed things to do last and proposed work beside it',async()=>{
 const f=await fixture();
 const empty=await onYou(t.db,f.memberB);
 expect(empty).toMatchObject({count:0,rows:[],more:[],claims:[],untrusted:true});
 expect(empty.groups.map(group=>[group.team.handle,group.timezone,group.posts])).toEqual(expect.arrayContaining([['@club','America/New_York',true],['@club/vietnam',expect.any(String),true]]));
 await ask(f,f.memberA,'Vote late?',9);await todo(f,f.memberA,'Upload the form',4,f.vietnam);await ask(f,f.memberA,'Vote soon?',1);
 await event(f,'tasting',6);await event(f,'mixer',2);
 // Mentions and announcements are not things to do on a day: they are left off, and reading here does not mark them as shown.
 expect((await claim(t.db,f.memberA,{...f.root,what:'Book the room',tags:['ben']})).saved).toBe(true);
 expect((await postAnnouncement(t.db,f.organizer,{...f.root,text:'Dues are due Friday.'})).saved).toBe(true);
 // Work proposed for the member comes beside the rows, oldest first.
 expect((await claim(t.db,f.memberA,{...f.root,what:'Bring the projector',owner:'ben'})).saved).toBe(true);
 const result=await onYou(t.db,f.memberB);
 // By when, across kinds and groups: not asks first.
 expect(rowsOf(result)).toEqual(['ask Vote soon?','event mixer','ask Upload the form','event tasting','ask Vote late?']);
 expect(result).toMatchObject({count:5,more:[],rows:[{team:{handle:'@club'},ask:{kind:'one',options:[{label:'Yes'},{label:'No'}]}},{},{team:{handle:'@club/vietnam'},scope:f.vietnam,ask:{kind:'done'}},{},{}],
  claims:[{team:{handle:'@club'},scope:f.root,record:{kind:'claim',what:'Bring the projector',claimStatus:'proposed'}}]});
 expect((await t.db.query('select 1 from emba_waiting_shown')).rows).toEqual([]);
 const told=await waiting(t.db,f.memberB);
 expect(told.items.filter(item=>item.kind==='mention'||item.kind==='announcement')).toHaveLength(3);
 // Acting takes a row away; so does answering the proposal.
 await answerAsk(t.db,f.memberB,{...f.vietnam,number:1});
 await setInterest(t.db,f.memberB,{...f.root,event:'mixer'});
 const proposed=result.claims[0].record.number;
 expect((await amendRecord(t.db,f.memberB,{...f.root,operationId:crypto.randomUUID(),number:proposed,action:'confirm'})).saved).toBe(true);
 const after=await onYou(t.db,f.memberB);
 expect(rowsOf(after)).toEqual(['ask Vote soon?','event tasting','ask Vote late?']);expect(after.claims).toEqual([]);
 // A thing to do that passed without the member is listed as missed, after everything open; a vote that passed simply leaves.
 const waiver=await todo(f,f.memberA,'Sign the waiver',3),fee=await todo(f,f.memberA,'Pay the fee',3);
 if(!waiver.saved||!fee.saved)throw new Error('to-do not saved');
 await answerAsk(t.db,f.memberB,{...f.root,number:fee.ask.number});
 await elapse('Sign the waiver','1 day');await elapse('Pay the fee','1 day');await elapse('Vote soon?','1 hour');
 const missed=await onYou(t.db,f.memberB);
 expect(rowsOf(missed)).toEqual(['event tasting','ask Vote late?','missed Sign the waiver']);
 expect(missed.count).toBe(2);
 // The person who posted it missed it too; a follower has nothing on them.
 expect(rowsOf(await onYou(t.db,f.memberA))).toContain('missed Sign the waiver');
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.members[3].personId]);
 const follows=await onYou(t.db,f.members[3]);
 expect(follows).toMatchObject({count:0,rows:[]});expect(follows.groups.every(group=>!group.posts)).toBe(true);
 // Given a new time it is an ordinary row again; after 7 days a missed one is gone.
 expect((await extendAsk(t.db,f.memberA,{...f.root,number:waiver.ask.number,closesAt:inDays(2)})).saved).toBe(true);
 expect(rowsOf(await onYou(t.db,f.memberB))).toEqual(['ask Sign the waiver','event tasting','ask Vote late?']);
 await elapse('Sign the waiver','8 days');
 expect(rowsOf(await onYou(t.db,f.memberB))).toEqual(['event tasting','ask Vote late?']);
 expect(JSON.stringify((await onYou(t.db,f.memberB)).rows.map(({scope:_scope,...row})=>row))).not.toMatch(uuids);
},240000);

it('keeps the soonest rows when one group has many, and says how many more each group holds',async()=>{
 const f=await fixture();
 await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 // More events in one group than the assistant's read lists of a kind, and a later ask in another group.
 for(let n=0;n<ON_YOU.rows+4;n++)expect((await event(f,`night-${String(n).padStart(2,'0')}`,2+n)).saved).toBe(true);
 await ask(f,f.memberA,'Sooner than all?',1,f.vietnam);
 const result=await onYou(t.db,f.memberB);
 expect(result.rows).toHaveLength(ON_YOU.rows);
 expect(rowsOf(result).slice(0,3)).toEqual(['ask Sooner than all?','event night-00','event night-01']);
 expect(rowsOf(result).at(-1)).toBe(`event night-${ON_YOU.rows-2}`);
 expect(result.count).toBe(ON_YOU.rows+5);
 expect(result.more).toEqual([{team:{handle:'@club',name:expect.any(String)},count:5}]);
 // The assistant's read is as it was.
 expect((await waiting(t.db,f.memberB)).items).toHaveLength(WAITING.items);
},240000);
