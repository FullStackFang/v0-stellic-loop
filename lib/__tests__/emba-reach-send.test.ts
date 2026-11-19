// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import type {Principal} from '@/lib/emba/access';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setReachChoice} from '@/lib/emba/reach';
import {answerFromLink,personalAsk} from '@/lib/emba/reach-link';
import {drainReach,renderEmail,SENDING,type Carrier,type SendResult} from '@/lib/emba/reach-send';
import {revokeMembership} from '@/lib/emba/roles';
import {answerAsk,closeAsk,createAsk,extendAsk} from '@/lib/emba/team-asks';
import {setInterest} from '@/lib/emba/team-interest';
import {addEvent} from '@/lib/emba/team-events';
import {postAnnouncement} from '@/lib/emba/team-records';
import {saveBrief} from '@/lib/emba/team-read';

// Specs: openspec/changes/loop-club-reach/specs/outbound-messages.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
afterEach(()=>{vi.unstubAllEnvs();});
const on=()=>{vi.stubEnv('LOOP_REACH_SENDING','on');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://loop.test');};
/** A timezone in which it is now about `hour` o'clock, so a test can stand inside or outside the quiet hours. */
const zoneAt=(hour:number)=>{let offset=hour-new Date().getUTCHours();if(offset>12)offset-=24;if(offset<-11)offset+=24;return offset>=0?`Etc/GMT-${offset}`:`Etc/GMT+${-offset}`;};
const clock=(hour:number)=>t.db.query('update emba_team_state set timezone=$1',[zoneAt(hour)]);
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'club',slug:'vietnam'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'UTC',expectedVersion:0});
 await saveBrief(t.db,f.organizer,{...f.vietnam,body:'Vietnam trip.',timezone:'UTC',expectedVersion:0});
 await clock(12);
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
const inHours=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString().slice(0,19)+'Z';
type Sent=Parameters<Carrier['email']>[0];
/** A carrier that records what it was handed. Addresses are made from the person's id, as the sign-in provider would give them. */
function carrier(answer:(message:Sent)=>SendResult=()=>({ok:true,providerId:'p-1'})){
 const sent:Sent[]=[];
 const address=(personId:string)=>`${personId.slice(-3)}@example.test`;
 const it:Carrier={address:async personId=>address(personId),email:async message=>{const result=answer(message);if(result.ok)sent.push(message);return result;}};
 return {it,sent,to:(p:Principal)=>sent.filter(message=>message.to===address(p.personId)),address};
}
async function ask(f:F,who:Principal,team:{orgId:string;loopId:string},question:string,hours=72){
 const asked=await createAsk(t.db,who,{...team,question,kind:'one',options:['Yes','No'],closesAt:inHours(hours)});
 if(!asked.saved)throw new Error(`not asked: ${asked.reason}`);
 return asked.ask.number;
}
const rows=async(where='true')=>(await t.db.query<{personId:string;kind:string;state:string;attempts:number;answerToken:string}>(`select person_id as "personId",kind,state,attempts,answer_token as "answerToken" from emba_reach_message where ${where} order by created_at,person_id`)).rows;
const count=async(where:string)=>(await rows(where)).length;
/** Moves an ask back in time, keeping its length, so that its reminder has come due. The table's guard forbids it, so the guard is off for this one statement. */
const age=(question:string,interval:string)=>t.db.tx(async q=>{await q.query("set local session_replication_role='replica'");await q.query(`update emba_ask set created_at=created_at-$2::interval,closes_at=closes_at-$2::interval where question=$1`,[question,interval]);});

it('sends nothing and queues nothing while the switch is off',async()=>{
 const f=await fixture(),c=carrier();
 await ask(f,f.organizer,f.root,'Friday tasting?');
 expect(await postAnnouncement(t.db,f.organizer,{...f.root,text:'Cellar tour moved.',send:true})).toMatchObject({saved:true});
 expect(await drainReach(t.db,c.it)).toMatchObject({on:false,sent:0});
 expect(await rows()).toEqual([]);
 expect(c.sent).toEqual([]);
},120000);

it('sends a new ask to each member the way they chose, once, naming no other member',async()=>{
 const f=await fixture(),c=carrier();on();
 await setReachChoice(t.db,f.memberA,{...f.root,way:'none'});
 await setReachChoice(t.db,f.memberB,{...f.root,way:'assistant'});
 await ask(f,f.organizer,f.root,'Friday tasting?');
 // One row per member who can answer; none for the person who asked.
 expect(await count("kind='ask_new'")).toBe(8);
 expect(await count(`person_id='${f.organizer.personId}'`)).toBe(0);
 expect(await drainReach(t.db,c.it)).toMatchObject({on:true,sent:6,skipped:2,held:0,failed:0});
 expect(c.to(f.memberA)).toEqual([]);expect(c.to(f.memberB)).toEqual([]);
 const [mail]=c.to(f.members[2]);
 const [{answerToken}]=await rows(`person_id='${f.members[2].personId}'`);
 expect(mail.subject).toBe('Synthetic EMBA: Friday tasting?');
 expect(mail.text).toContain('Organizer asked Synthetic EMBA:');
 expect(mail.text).toContain(`Answer: https://loop.test/groups/reach/answer/${answerToken}`);
 expect(mail.text).toMatch(/Stop messages from Synthetic EMBA: https:\/\/loop\.test\/groups\/reach\/stop\/[0-9a-f]{32}/);
 expect(mail.text).toMatch(/Closes .+ \(Etc\/GMT/);
 expect(mail.html).toContain(mail.stopLink);
 expect(mail.unsubscribeUrl).toBe(mail.stopLink.replace('/groups/reach/stop/','/api/reach/stop/'));
 // No message names a member other than the asker, or says who has answered.
 for(const message of c.sent)expect(message.text+message.html+message.subject).not.toMatch(/Member [A-Z0-9]|answered|@club/);
 // A second run sends nothing again. Interest and a single answer send nothing either.
 const added=await addEvent(t.db,f.organizer,{...f.root,slug:'tasting',name:'Tasting',startsAt:'2099-03-05T18:30'});
 expect(added.saved).toBe(true);
 await setInterest(t.db,f.members[2],{...f.root,event:'tasting',interested:true});
 await answerAsk(t.db,f.members[3],{...f.root,number:1,choices:['Yes']});
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,skipped:0});
 expect(c.sent).toHaveLength(6);
 expect(await count("state='sent' and way='email' and sent_at is not null and provider_id='p-1'")).toBe(6);
},120000);

it('retries a send the provider refused for now, and never repeats one that went through',async()=>{
 const f=await fixture();on();
 for(const member of f.members.slice(1))await setReachChoice(t.db,member,{...f.root,way:'none'});
 await ask(f,f.organizer,f.root,'Friday tasting?');
 let fail=true;
 const c=carrier(()=>fail?{ok:false,retry:true}:{ok:true,providerId:null});
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,retrying:1,skipped:7});
 expect(await rows("state='queued'")).toMatchObject([{personId:f.memberA.personId,attempts:1}]);
 fail=false;
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:1,retrying:0});
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0});
 expect(c.sent).toHaveLength(1);
 // A refusal the provider calls final, and one that never clears, both end as failed and are not tried forever.
 await ask(f,f.organizer,f.root,'Second question?');
 expect(await drainReach(t.db,carrier(()=>({ok:false,retry:false})).it)).toMatchObject({failed:1});
 await ask(f,f.organizer,f.root,'Third question?');
 const never=carrier(()=>({ok:false,retry:true}));
 for(let run=1;run<SENDING.attempts;run++)expect(await drainReach(t.db,never.it)).toMatchObject({retrying:1,failed:0});
 expect(await drainReach(t.db,never.it)).toMatchObject({retrying:0,failed:1});
 expect(await drainReach(t.db,never.it)).toMatchObject({retrying:0,failed:0});
 // A member with no verified address is not sent to.
 await ask(f,f.organizer,f.root,'Fourth question?');
 expect(await drainReach(t.db,{...c.it,address:async()=>null})).toMatchObject({failed:1,sent:0});
},120000);

it('holds messages through the quiet hours and drops one whose ask closed meanwhile',async()=>{
 const f=await fixture(),c=carrier();on();
 for(const member of f.members.slice(1))await setReachChoice(t.db,member,{...f.root,way:'none'});
 await ask(f,f.organizer,f.root,'Night question?');await ask(f,f.organizer,f.root,'Closed by morning?');
 for(const hour of [21,23,3,7]){
  await clock(hour);
  // Rows of a team in its quiet hours are left as they are, whatever their member chose.
  expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,skipped:0,waiting:16});
 }
 expect(c.sent).toEqual([]);
 expect(await closeAsk(t.db,f.organizer,{...f.root,number:2})).toMatchObject({saved:true});
 await clock(8);
 // At 08:00 the open ask goes out; the closed one does not, and its result goes to the person who asked.
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:2,skipped:15,waiting:0});
 expect(c.sent.map(message=>message.subject)).toEqual(['Synthetic EMBA: Night question?','Closed · Synthetic EMBA: Closed by morning?']);
 expect((await rows(`person_id='${f.memberA.personId}'`)).map(row=>row.state)).toEqual(['sent','skipped']);
},120000);

it('sends a member at most three messages a day from one team, and the rest stay waiting',async()=>{
 const f=await fixture(),c=carrier();on();
 for(const member of f.members.slice(1))for(const team of [f.root,f.vietnam])await setReachChoice(t.db,member,{...team,way:'none'});
 for(const n of [1,2,3,4])await ask(f,f.organizer,f.root,`Question ${n}?`);
 await ask(f,f.organizer,f.vietnam,'Vietnam question?');
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:4,held:1});
 // Another team's message is not counted against this team's three.
 expect(c.to(f.memberA).map(message=>message.subject.split(': ')[1])).toEqual(['Question 1?','Question 2?','Question 3?','Vietnam question?']);
 // The fourth is held, not sent later, and the ask still waits for the member on the site and in their assistant.
 expect(await rows("state='held'")).toHaveLength(1);
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,held:0});
 const still=await t.db.query('select 1 from emba_ask k where k.question=$1 and k.closed_at is null and not exists(select 1 from emba_ask_answer a where a.ask_id=k.id)',['Question 4?']);
 expect(still.rows).toHaveLength(1);
},120000);

it('sends one reminder when it is due, only to members who have not answered, and none after the ask closes',async()=>{
 const f=await fixture(),c=carrier();on();
 await ask(f,f.organizer,f.root,'Long ask?',72);
 await ask(f,f.organizer,f.root,'Short ask?',10);
 await ask(f,f.organizer,f.root,'Closed early?',72);
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:24});
 await t.db.query("update emba_reach_message set sent_at=sent_at-interval '2 days'");
 // Not yet due: 24 hours before closing for the long ask, halfway for the short one.
 await age('Long ask?','47 hours');await age('Short ask?','4 hours 50 minutes');
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0});
 expect(await count("kind='ask_reminder'")).toBe(0);
 // Due now. One member answered the long ask first; the third ask was closed before its reminder.
 await answerAsk(t.db,f.memberA,{...f.root,number:1,choices:['Yes']});
 await age('Long ask?','2 hours');await age('Short ask?','20 minutes');await age('Closed early?','49 hours');
 await closeAsk(t.db,f.organizer,{...f.root,number:3});
 await drainReach(t.db,c.it);
 const reminders=await rows("kind='ask_reminder'");
 expect(reminders).toHaveLength(15);
 expect(reminders.filter(row=>row.personId===f.memberA.personId)).toHaveLength(1);
 expect(reminders.some(row=>row.personId===f.organizer.personId)).toBe(false);
 const mail=c.to(f.memberB).filter(message=>message.subject.startsWith('Reminder'));
 expect(mail.map(message=>message.subject).sort()).toEqual(['Reminder · Synthetic EMBA: Long ask?','Reminder · Synthetic EMBA: Short ask?']);
 expect(mail[0].text).toContain('you have not answered yet');
 expect(mail[0].text).not.toMatch(/Member [A-Z0-9]/);
 // Run again, late or not: never a second reminder.
 const before=c.sent.length;
 await drainReach(t.db,c.it);await drainReach(t.db,c.it);
 expect(c.sent).toHaveLength(before);
 expect(await count("kind='ask_reminder'")).toBe(15);
 // A member who answers after the reminder was written but before it is sent is not reminded.
 await ask(f,f.organizer,f.vietnam,'Vietnam ask?',10);
 await drainReach(t.db,c.it);await age('Vietnam ask?','6 hours');
 await t.db.query("update emba_reach_message set sent_at=sent_at-interval '6 hours' where kind='ask_new' and loop_id=$1",[f.vietnam.loopId]);
 await clock(23);await drainReach(t.db,c.it);
 await answerAsk(t.db,f.memberB,{...f.vietnam,number:1,choices:['No']});
 await clock(12);await drainReach(t.db,c.it);
 expect((await rows(`kind='ask_reminder' and person_id='${f.memberB.personId}' and loop_id='${f.vietnam.loopId}'`)).map(row=>row.state)).toEqual(['skipped']);
},180000);

it('tells the person who asked when their ask closes, and sends an announcement only when the organizer chose to',async()=>{
 const f=await fixture(),c=carrier();on();
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.members[7].personId]);
 await ask(f,f.memberA,f.root,'Where next?');
 await drainReach(t.db,c.it);
 // A follower cannot answer, so the ask is not sent to them.
 expect(c.to(f.members[7])).toEqual([]);
 await closeAsk(t.db,f.memberA,{...f.root,number:1});
 await drainReach(t.db,c.it);
 const result=c.sent.filter(message=>message.subject.startsWith('Closed'));
 expect(result.map(message=>message.to)).toEqual([c.address(f.memberA.personId)]);
 expect(result[0].text).toMatch(/See the answers: https:\/\/loop\.test\/a\/[0-9a-f]{32}/);
 expect(result[0].text).not.toMatch(/Member [B-Z0-9]|Organizer/);
 // An announcement that is only posted sends nothing; one marked to send goes to everyone who belongs, the follower too, and not its author.
 await t.db.query("update emba_reach_message set sent_at=sent_at-interval '2 days' where state='sent'");
 expect(await postAnnouncement(t.db,f.organizer,{...f.root,text:'Quiet note.'})).toMatchObject({saved:true});
 expect(await count("kind='announcement'")).toBe(0);
 expect(await postAnnouncement(t.db,f.organizer,{...f.root,text:'Cellar tour moved to Saturday.',send:true})).toMatchObject({saved:true});
 expect(await count("kind='announcement'")).toBe(8);
 const sent=c.sent.length;
 await drainReach(t.db,c.it);
 const announced=c.sent.slice(sent);
 expect(announced).toHaveLength(8);
 expect(c.to(f.members[7]).at(-1)!.text).toContain('Organizer announced to Synthetic EMBA:\n\nCellar tour moved to Saturday.');
 expect(c.to(f.members[7]).at(-1)!.text).toContain('Open in Loop: https://loop.test/groups/club/team');
 expect(c.to(f.organizer).filter(message=>message.subject.includes('announcement'))).toEqual([]);
},120000);

it('lets a personal link answer its one ask as its one member, and nothing once the ask closes or the member leaves or stops',async()=>{
 const f=await fixture(),c=carrier();on();
 await ask(f,f.organizer,f.root,'Friday tasting?');await ask(f,f.organizer,f.root,'Saturday too?');
 await drainReach(t.db,c.it);
 const link=async(p:Principal,number:number)=>(await t.db.query<{token:string}>('select g.answer_token as token from emba_reach_message g join emba_ask k on k.id=g.ask_id where g.person_id=$1 and k.number=$2',[p.personId,number])).rows[0].token;
 const mine=await link(f.memberA,1);
 // Reading the link shows the ask and writes nothing.
 expect(await personalAsk(t.db,mine)).toMatchObject({group:'Synthetic EMBA',asker:'Organizer',question:'Friday tasting?',kind:'one',open:true,yourAnswer:null,options:[{number:1,label:'Yes'},{number:2,label:'No'}]});
 expect((await t.db.query('select 1 from emba_ask_answer')).rows).toEqual([]);
 // Sending the form records the answer as that member's, by the personal link.
 expect(await answerFromLink(t.db,mine,{choices:['2']})).toMatchObject({saved:true,ask:{yourAnswer:'No',chosen:[2]}});
 expect((await t.db.query('select person_id,route,client_id,choices::int[] as choices from emba_ask_answer')).rows).toEqual([{person_id:f.memberA.personId,route:'personal_link',client_id:null,choices:[2]}]);
 expect(await answerFromLink(t.db,mine,{choices:['Yes']})).toMatchObject({saved:true,ask:{yourAnswer:'Yes'}});
 // The same checks as on the site: an option that is not there, or two for a pick-one ask, saves nothing.
 expect(await answerFromLink(t.db,mine,{choices:['Maybe']})).toMatchObject({saved:false,reason:'unknown_option'});
 expect(await answerFromLink(t.db,mine,{choices:['1','2']})).toMatchObject({saved:false,reason:'one_only'});
 expect(await answerFromLink(t.db,mine,{})).toMatchObject({saved:false,reason:'needs_choice'});
 // It answers that ask only: the member's link to another ask is another link.
 expect((await t.db.query('select count(*)::int as n from emba_ask_answer')).rows).toEqual([{n:1}]);
 for(const bad of ['','0'.repeat(32),mine.toUpperCase(),"' or 1=1 --"]){expect(await personalAsk(t.db,bad)).toBeNull();expect(await answerFromLink(t.db,bad,{choices:['1']})).toEqual({saved:false,reason:'gone'});}
 // Closed: the page says so and no answer is taken.
 const second=await link(f.memberB,2);
 await closeAsk(t.db,f.organizer,{...f.root,number:2});
 expect(await personalAsk(t.db,second)).toMatchObject({open:false,yourAnswer:null});
 expect(await answerFromLink(t.db,second,{choices:['1']})).toMatchObject({saved:false,reason:'closed'});
 // Stopped: the link stops working; turning messages back on brings it back.
 const first=await link(f.memberB,1);
 await setReachChoice(t.db,f.memberB,{...f.root,way:'none'});
 expect(await personalAsk(t.db,first)).toBeNull();
 expect(await answerFromLink(t.db,first,{choices:['1']})).toEqual({saved:false,reason:'gone'});
 await setReachChoice(t.db,f.memberB,{...f.root,way:'email'});
 expect(await personalAsk(t.db,first)).toMatchObject({open:true});
 // Left the group: the link is dead.
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberB.personId});
 expect(await personalAsk(t.db,first)).toBeNull();
 expect(await answerFromLink(t.db,first,{choices:['1']})).toEqual({saved:false,reason:'gone'});
 expect((await t.db.query('select count(*)::int as n from emba_ask_answer where person_id=$1',[f.memberB.personId])).rows).toEqual([{n:0}]);
},120000);

it('writes an email with a plain-text part, one link to act and one to stop, and escapes what members wrote',()=>{
 const mail=renderEmail({id:'m',kind:'ask_new',group:'Wine & <Cheese>',from:'Ana "A" <b>',text:'Red <script>alert(1)</script> or white?',closes:'Fri 20 Nov 2026, 18:00',timezone:'America/New_York',link:'https://loop.test/groups/reach/answer/abc',stopLink:'https://loop.test/groups/reach/stop/def'});
 expect(mail.text.split('\n\n')).toEqual(['Ana "A" <b> asked Wine & <Cheese>:','Red <script>alert(1)</script> or white?','Closes Fri 20 Nov 2026, 18:00 (America/New_York).','Answer: https://loop.test/groups/reach/answer/abc','Stop messages from Wine & <Cheese>: https://loop.test/groups/reach/stop/def']);
 expect(mail.html).not.toMatch(/<script|<b>|<Cheese>/);
 expect(mail.html).toContain('Red &lt;script&gt;alert(1)&lt;/script&gt; or white?');
 expect(mail.html.match(/<a /g)).toHaveLength(2);
});

it('keeps a sleeping team, a failing lookup, an odd provider id, a retired group or another run from stopping or doubling a send',async()=>{
 const f=await fixture(),c=carrier();on();
 for(const member of f.members.slice(1))for(const team of [f.root,f.vietnam])await setReachChoice(t.db,member,{...team,way:'none'});
 await ask(f,f.organizer,f.vietnam,'Vietnam question?');await ask(f,f.organizer,f.root,'Root question?');
 // One team is in its quiet hours and its rows are older: the other team's message still goes.
 await t.db.query('update emba_team_state set timezone=$1 where loop_id=$2',[zoneAt(23),f.vietnam.loopId]);
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:1,skipped:7,waiting:8});
 expect(c.sent.map(message=>message.subject)).toEqual(['Synthetic EMBA: Root question?']);
 // The sign-in provider cannot be asked for the address: tried again later, not given up.
 await clock(12);
 expect(await drainReach(t.db,{...c.it,address:async()=>{throw new Error('provider down');}})).toMatchObject({retrying:1,failed:0,skipped:7});
 // The provider accepts and returns an id the column would refuse: the send is still recorded, once.
 const odd=carrier(()=>({ok:true,providerId:'two\nlines'}));
 expect(await drainReach(t.db,odd.it)).toMatchObject({sent:1});
 expect(await drainReach(t.db,odd.it)).toMatchObject({sent:0});
 expect(odd.sent).toHaveLength(1);
 expect(await count("state='sent' and provider_id is null")).toBe(1);
 // A row another run is sending is left alone; a claim that was never finished lapses.
 await ask(f,f.organizer,f.root,'Third question?');
 await t.db.query("update emba_reach_message set claimed_at=clock_timestamp() where state='queued' and person_id=$1",[f.memberA.personId]);
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,skipped:7});
 await t.db.query("update emba_reach_message set claimed_at=clock_timestamp()-interval '11 minutes' where state='queued'");
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:1});
 // A group whose address was retired: its rows are dropped, not left to stand in front of everything else.
 await ask(f,f.organizer,f.vietnam,'Second Vietnam question?');
 await t.db.query('update emba_group_address set retired_at=clock_timestamp() where loop_id=$1',[f.vietnam.loopId]);
 expect(await drainReach(t.db,c.it)).toMatchObject({sent:0,skipped:8});
 expect(await count("state='queued'")).toBe(0);
 // An ask held overnight whose reminder came due meanwhile: the ask goes out at 08:00 and no reminder follows on its heels.
 await clock(23);
 await ask(f,f.organizer,f.root,'Night ask?',10);
 await age('Night ask?','6 hours');
 await drainReach(t.db,c.it);
 expect(await count("kind='ask_reminder'")).toBe(0);
 await clock(12);
 const before=c.sent.length;
 await drainReach(t.db,c.it);await drainReach(t.db,c.it);
 expect(c.sent.slice(before).map(message=>message.subject)).toEqual(['Synthetic EMBA: Night ask?']);
 // Members who chose not to be messaged have a reminder row that was dropped; nobody has one waiting or sent.
 expect(await count("kind='ask_reminder' and state<>'skipped'")).toBe(0);
},180000);

// Specs: openspec/changes/loop-on-you/specs/group-asks.
it('words something to do as something done, and reminds and reports again after it is given a new closing time',async()=>{
 const f=await fixture(),c=carrier();on();
 const asked=await createAsk(t.db,f.organizer,{...f.root,question:'Upload your W8/W9',kind:'done',closesAt:inHours(72)});
 expect(asked.saved).toBe(true);
 await drainReach(t.db,c.it);
 const fresh=c.to(f.memberB)[0];
 expect(fresh.subject).toBe('To do · Synthetic EMBA: Upload your W8/W9');
 expect(fresh.text).toContain('asked Synthetic EMBA to do this:');expect(fresh.text).toContain('Mark it done');expect(fresh.text).toMatch(/Due .+\./);expect(fresh.text).not.toContain('Answer');
 // The reminder, once.
 await t.db.query("update emba_reach_message set sent_at=sent_at-interval '2 days'");
 await age('Upload your W8/W9','49 hours');await drainReach(t.db,c.it);
 const reminder=c.to(f.memberB).at(-1)!;
 expect(reminder.subject).toBe('Reminder · Synthetic EMBA: Upload your W8/W9');expect(reminder.text).toContain('you have not done it yet');
 const sentBefore=c.sent.length,tokens=(await rows("kind='ask_reminder'")).map(row=>row.answerToken);
 // It passes: the result goes to the person who posted it.
 await answerAsk(t.db,f.memberA,{...f.root,number:1});
 await age('Upload your W8/W9','24 hours');await drainReach(t.db,c.it);
 const result=c.to(f.organizer).at(-1)!;
 expect(result.subject).toBe('Passed · Synthetic EMBA: Upload your W8/W9');expect(result.text).toContain('See who did it');
 expect(c.sent).toHaveLength(sentBefore+1);
 // A new time: nothing is sent for the move itself, and nothing while its reminder is not due again.
 expect(await extendAsk(t.db,f.organizer,{...f.root,number:1,closesAt:inHours(72)})).toMatchObject({saved:true,changed:true});
 await drainReach(t.db,c.it);
 expect(c.sent).toHaveLength(sentBefore+1);
 // Its reminder comes due again: those who have still not done it are reminded once more, on the same rows, so earlier links still work.
 await t.db.query("update emba_ask set closes_at=clock_timestamp()+interval '20 hours' where question='Upload your W8/W9'");
 await drainReach(t.db,c.it);await drainReach(t.db,c.it);
 expect(c.to(f.memberB).filter(message=>message.subject.startsWith('Reminder'))).toHaveLength(2);
 expect(c.to(f.memberA).filter(message=>message.subject.startsWith('Reminder'))).toHaveLength(1);
 expect((await rows("kind='ask_reminder'")).map(row=>row.answerToken).sort()).toEqual([...tokens].sort());
 // And when it passes again, the result is sent again. (The first result is moved back with the ask, as it would be in real time.)
 await t.db.query("update emba_reach_message set created_at=created_at-interval '2 days',sent_at=sent_at-interval '2 days' where kind='ask_result'");
 await age('Upload your W8/W9','21 hours');await drainReach(t.db,c.it);await drainReach(t.db,c.it);
 expect(c.to(f.organizer).filter(message=>message.subject.startsWith('Passed'))).toHaveLength(2);
 expect(await count("kind='ask_result'")).toBe(1);
 // Opened again before a queued result went out: that result waits for the next closing.
 await extendAsk(t.db,f.organizer,{...f.root,number:1,closesAt:inHours(72)});
 await t.db.query("update emba_reach_message set created_at=created_at-interval '4 days',sent_at=sent_at-interval '4 days' where kind='ask_result'");
 await age('Upload your W8/W9','73 hours');await clock(23);await drainReach(t.db,c.it);
 expect((await rows("kind='ask_result'")).map(row=>row.state)).toEqual(['queued']);
 await extendAsk(t.db,f.organizer,{...f.root,number:1,closesAt:inHours(72)});
 await clock(12);await drainReach(t.db,c.it);
 expect((await rows("kind='ask_result'")).map(row=>row.state)).toEqual(['skipped']);
 expect(c.to(f.organizer).filter(message=>message.subject.startsWith('Passed'))).toHaveLength(2);
},240000);
