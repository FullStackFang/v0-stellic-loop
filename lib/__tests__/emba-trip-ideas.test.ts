// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {revokeMembership} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import {answerAsk,askResults,closeAsk} from '@/lib/emba/team-asks';
import {addEvent,archiveEvent,IDEAS} from '@/lib/emba/team-events';
import {formatDay,formatIdeaWrite,formatNews,formatWaiting,LINE,TOTAL} from '@/lib/emba/team-format';
import {cancelIdea,changeIdea,proposeIdea,type IdeaWrite} from '@/lib/emba/team-ideas';
import {eventDetail,eventShare,setInterest,upcomingEvents,whatsOn} from '@/lib/emba/team-interest';
import {saveBrief,whatsNew} from '@/lib/emba/team-read';
import {waiting} from '@/lib/emba/team-waiting';

// Specs: openspec/changes/loop-trip/specs/group-ideas.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
afterEach(()=>{vi.unstubAllEnvs();});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'trip',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'trip',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await setMemberHandle(t.db,f.members[2],{orgId:f.orgId,handle:'cy'});
 await saveBrief(t.db,f.organizer,{...root,body:'Vietnam trip.',timezone:'UTC',expectedVersion:0});
 return {...f,root,a:f.memberA,b:f.memberB,c:f.members[2],d:f.members[3]};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,who:Principal,client='claude') {
 await grantLease(t.db,who,{...f.root,clientId:client,actions:['plan:read','group-memory:write'],expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const ok=(result:IdeaWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const at=(offset:number,time='15:00')=>`${day(offset)}T${time}`;
const join=async(f:F,who:Principal,event:string,interested=true)=>{const result=await setInterest(t.db,who,{...f.root,event,interested});if(!result.saved)throw new Error(`not marked: ${JSON.stringify(result)}`);return result;};
const actions=async()=>(await t.db.query<{action:string}>('select action from emba_team_change order by seq')).rows.map(row=>row.action);
const stateOf=async(slug:string)=>(await t.db.query<{state:string;day:string|null;archived:boolean;proposer:string|null}>("select state,to_char(day,'YYYY-MM-DD') as day,archived_at is not null as archived,proposer_id as proposer from emba_team_event where slug=$1 order by created_at desc limit 1",[slug])).rows[0];
/** Moves rows back in time. The tables' guards forbid it, so they are off for this one statement. */
const backdate=(sql:string,values:unknown[]=[])=>t.db.tx(async q=>{await q.query("set local session_replication_role='replica'");await q.query(sql,values);});
const textRules=(text:string)=>{
 expect(text.length).toBeLessThanOrEqual(TOTAL);expect(text).not.toMatch(uuids);expect(text).not.toMatch(/[{|]|\*\*/);
 for(const line of text.split('\n'))if(!line.startsWith('https://'))expect(line.length).toBeLessThanOrEqual(LINE);
};

it('saves an idea in one call through an assistant, with its proposer in and its share link',async()=>{
 const f=await fixture(),agent=await assistant(f,f.a);
 const saved=ok(await proposeIdea(t.db,agent,{...f.root,name:'Buy suits',startsAt:at(3),place:'Tailor on Hang Gai'}));
 expect(saved).toMatchObject({changed:true,event:{slug:'buy-suits',name:'Buy suits',place:'Tailor on Hang Gai',interested:1,youAreInterested:true,archived:false,
  idea:{state:'idea',needed:3,needs:2,youProposed:true,offeredDays:[],day:null,dayAsk:null}}});
 expect(saved.event.shareUrl).toMatch(/\/e\/[0-9a-f]{32}$/);
 expect(JSON.stringify(saved)).not.toMatch(uuids);
 expect(await actions()).toEqual(['event_proposed']);
 const text=formatIdeaWrite(saved,{handle:'@trip',name:'Trip'});textRules(text);
 expect(text).toContain('Idea @trip/buy-suits');expect(text).toContain('1 in, including you, needs 2 more of 3. The user proposed it.');expect(text).toContain('> Buy suits');
 // A second idea of the same name gets the next tag; a name with nothing to make a tag from gets a plain one.
 expect(ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits'})).event.slug).toBe('buy-suits-2');
 expect(ok(await proposeIdea(t.db,f.a,{...f.root,name:'Phở'})).event.slug).toBe('pho');
 expect(ok(await proposeIdea(t.db,f.a,{...f.root,name:'夜市'})).event.slug).toBe('idea');
 // Someone outside the team sees its name, time and place through the share link, and no names.
 const outside=await eventShare(t.db,null,saved.event.shareUrl!.split('/').at(-1)!);
 expect(outside).toMatchObject({view:'outside',outside:{name:'Buy suits',place:'Tailor on Hang Gai',interested:null}});
 expect(JSON.stringify(outside)).not.toContain('ana');
});
it('takes an idea with no time or place, and holds the limits on what a member may propose',async()=>{
 const f=await fixture();
 const cooking=ok(await proposeIdea(t.db,f.a,{...f.root,name:'Cooking class',needed:2,offeredDays:[day(4),day(2),day(2)]}));
 expect(cooking.event).toMatchObject({startsAt:null,place:null,shareUrl:null,idea:{needed:2,needs:1,offeredDays:[day(2),day(4)]}});
 // A sixth open idea is refused and nothing is saved.
 for(const name of ['Two','Three','Four','Five'])ok(await proposeIdea(t.db,f.a,{...f.root,name}));
 expect(await proposeIdea(t.db,f.a,{...f.root,name:'Six'})).toEqual({saved:false,reason:'cap',cap:'own_open_ideas'});
 expect(formatIdeaWrite({saved:false,reason:'cap',cap:'own_open_ideas'},{handle:'@trip',name:'Trip'})).toMatch(/^Not saved\. Limit reached: 5 open ideas/);
 expect((await t.db.query("select count(*)::int as n from emba_team_event where state='idea'")).rows).toEqual([{n:5}]);
 // Another member still has room; a cancelled idea frees a place.
 ok(await proposeIdea(t.db,f.b,{...f.root,name:'Six'}));
 ok(await cancelIdea(t.db,f.a,{...f.root,event:'five'}));ok(await proposeIdea(t.db,f.a,{...f.root,name:'Six again'}));
 for(const bad of [{needed:1},{needed:21},{needed:2.5},{name:''},{name:'x'.repeat(IDEAS.name+1)},{offeredDays:['2099-02-30']},{offeredDays:Array.from({length:11},(_,index)=>`2099-03-${index+10}`)},{slug:'mine'},{state:'planned'}])
  await expect(proposeIdea(t.db,f.b,{...f.root,name:'Bad',...bad})).rejects.toThrow();
 expect(await proposeIdea(t.db,f.b,{...f.root,name:'Yesterday',startsAt:at(-1)})).toEqual({saved:false,reason:'in_the_past'});
 expect(await proposeIdea(t.db,f.b,{...f.root,name:'Stale',offeredDays:[day(-2)]})).toEqual({saved:false,reason:'offered_day_past'});
 expect(await proposeIdea(t.db,f.b,{...f.root,name:'Backwards',startsAt:at(3,'15:00'),endsAt:at(3,'14:00')})).toEqual({saved:false,reason:'end_before_start'});
 // A follower reads ideas and proposes none; someone outside the team is refused outright; a read-only assistant cannot propose.
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.c.personId]);
 expect(await proposeIdea(t.db,f.c,{...f.root,name:'Follower idea'})).toEqual({saved:false,reason:'members_only'});
 expect(await setInterest(t.db,f.c,{...f.root,event:'cooking-class'})).toEqual({saved:false,reason:'members_only'});
 expect((await whatsOn(t.db,f.c,f.root)).ideas.items.map(idea=>idea.slug)).toContain('cooking-class');
 await expect(proposeIdea(t.db,f.nonmember,{...f.root,name:'Outsider idea'})).rejects.toMatchObject({code:'forbidden'});
 await expect(whatsOn(t.db,f.nonmember,f.root)).rejects.toMatchObject({code:'forbidden'});
 await grantLease(t.db,f.b,{...f.root,clientId:'reader',actions:['plan:read'],expiresAt:forever});
 const reader=(await authenticate(t.db,'test',async()=>({issuer:f.b.issuer,subject:f.b.subject,clientId:'reader',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
 await expect(proposeIdea(t.db,reader,{...f.root,name:'Read only'})).rejects.toMatchObject({code:'forbidden'});
});
it('becomes a plan in the write that adds the last person, and stays one when someone drops out',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits',startsAt:at(3),place:'Tailor'}));
 expect((await join(f,f.b,'buy-suits')).event.idea).toMatchObject({state:'idea',needs:1});
 // Members and followers see who is in and how many more it needs.
 expect((await eventDetail(t.db,f.d,{...f.root,event:'buy-suits'})).event).toMatchObject({interested:2,youAreInterested:false,idea:{needs:1},people:[{handle:'@trip/ana'},{handle:'@trip/ben'}]});
 const third=await join(f,f.c,'buy-suits');
 expect(third.event).toMatchObject({interested:3,idea:{state:'planned',needs:0}});
 expect(await actions()).toEqual(['event_proposed','event_planned']);
 // Loop made it a plan: the entry names no member.
 expect((await t.db.query("select actor_id from emba_team_change where action='event_planned'")).rows).toEqual([{actor_id:null}]);
 expect((await whatsNew(t.db,f.d,f.root)).changes.map(change=>[change.action,change.event?.slug])).toEqual([['event_proposed','buy-suits'],['event_planned','buy-suits']]);
 expect(formatNews(await whatsNew(t.db,f.d,f.root))).toMatch(/: idea @trip\/buy-suits has the people it needs and is now a plan, /);
 // It is listed with the fixed events from then on.
 expect((await upcomingEvents(t.db,f.d,f.root)).events.items.map(event=>event.slug)).toEqual(['buy-suits']);
 // One drops out: two are in a plan that needed three, and it remains a plan.
 expect((await join(f,f.c,'buy-suits',false)).event).toMatchObject({interested:2,idea:{state:'planned'}});
 expect(await stateOf('buy-suits')).toMatchObject({state:'planned',archived:false});
 // The database keeps the rule: a plan is not turned back into an idea, and an idea is never a fixed event.
 await expect(t.db.query("update emba_team_event set state='idea' where slug='buy-suits'")).rejects.toThrow();
 await expect(t.db.query("update emba_team_event set state='fixed',needed=null where slug='buy-suits'")).rejects.toThrow();
 await expect(t.db.query("update emba_team_event set place=null where slug='buy-suits'")).rejects.toThrow();
});
it('becomes a plan once when two join at the same moment',async()=>{
 const f=await fixture();vi.stubEnv('LOOP_REACH_SENDING','on');
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits',startsAt:at(3),place:'Tailor'}));
 await join(f,f.b,'buy-suits');
 const both=await Promise.all([setInterest(t.db,f.c,{...f.root,event:'buy-suits'}),setInterest(t.db,f.d,{...f.root,event:'buy-suits'})]);
 expect(both.map(result=>result.saved)).toEqual([true,true]);
 expect((await eventDetail(t.db,f.a,{...f.root,event:'buy-suits'})).event).toMatchObject({interested:4,idea:{state:'planned'}});
 expect((await actions()).filter(action=>action==='event_planned')).toEqual(['event_planned']);
 // One invite for each of the four, and no second one for anybody.
 const {rows}=await t.db.query<{personId:string;n:number}>("select person_id as \"personId\",count(*)::int as n from emba_reach_message where kind='invite' group by person_id");
 expect(rows.map(row=>row.n)).toEqual([1,1,1,1]);
 expect(rows.map(row=>row.personId).sort()).toEqual([f.a,f.b,f.c,f.d].map(person=>person.personId).sort());
});
it('becomes a plan on the write that adds the last detail',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Street food',needed:2,startsAt:at(2,'19:00')}));
 expect((await join(f,f.b,'street-food')).event.idea).toMatchObject({state:'idea',needs:0});
 // Enough people, a time and no place: no ask opens, and the proposer is told what it needs.
 expect((await t.db.query('select count(*)::int as n from emba_ask')).rows).toEqual([{n:0}]);
 const told=await waiting(t.db,f.a);
 expect(told.items).toMatchObject([{kind:'idea',why:'needs_place',event:{slug:'street-food'}}]);
 expect(formatWaiting(told)).toContain('has the people it needs and no place');
 expect((await waiting(t.db,f.b)).items).toEqual([]);
 // Someone who is in and did not propose it cannot add the place.
 expect(await changeIdea(t.db,f.b,{...f.root,event:'street-food',place:'Old Quarter'})).toEqual({saved:false,reason:'not_yours'});
 const placed=ok(await changeIdea(t.db,f.a,{...f.root,event:'street-food',place:'Old Quarter'}));
 expect(placed.event).toMatchObject({place:'Old Quarter',idea:{state:'planned'}});
 expect(await actions()).toEqual(['event_proposed','event_changed','event_planned']);
 expect((await waiting(t.db,f.a)).items).toEqual([]);
});
it('lets the proposer and organizers change and cancel a plan, and never revives a cancelled one',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits',needed:2,startsAt:at(3),place:'Tailor'}));
 await join(f,f.b,'buy-suits');
 expect(await cancelIdea(t.db,f.b,{...f.root,event:'buy-suits'})).toEqual({saved:false,reason:'not_yours'});
 expect(await changeIdea(t.db,f.a,{...f.root,event:'buy-suits',place:null})).toEqual({saved:false,reason:'plan_needs_time_and_place'});
 expect(await changeIdea(t.db,f.a,{...f.root,event:'buy-suits',startsAt:null})).toEqual({saved:false,reason:'plan_needs_time_and_place'});
 await expect(changeIdea(t.db,f.a,{...f.root,event:'buy-suits',needed:5})).rejects.toThrow();
 // An organizer moves it; saying the same again changes nothing.
 const moved=ok(await changeIdea(t.db,f.organizer,{...f.root,event:'buy-suits',startsAt:at(3,'16:00')}));
 expect(moved).toMatchObject({changed:true,event:{idea:{state:'planned',youProposed:false}}});
 expect(await changeIdea(t.db,f.organizer,{...f.root,event:'buy-suits',startsAt:at(3,'16:00')})).toMatchObject({saved:true,changed:false});
 // Events are managed as events and ideas as ideas: an organizer's archive does not reach a plan.
 expect(await archiveEvent(t.db,f.organizer,{...f.root,event:'buy-suits'})).toEqual({saved:false,reason:'unknown_event',value:'buy-suits'});
 const cancelled=ok(await cancelIdea(t.db,f.a,{...f.root,event:'buy-suits'}));
 expect(cancelled.event).toMatchObject({archived:true,idea:{state:'cancelled'}});
 expect(formatIdeaWrite(cancelled,{handle:'@trip',name:'Trip'})).toMatch(/^Saved\. It is cancelled and will not come back\./);
 // It leaves the day's list and what is new reports it.
 const list=await whatsOn(t.db,f.b,{...f.root,day:day(3)});
 expect([...list.events,...list.plans,...list.ideas.items]).toEqual([]);
 expect((await actions()).at(-1)).toBe('event_cancelled');
 expect(formatNews(await whatsNew(t.db,f.b,f.root))).toMatch(/@trip\/ana cancelled @trip\/buy-suits\./);
 // Nothing brings it back, in the service or in the database.
 expect(await setInterest(t.db,f.c,{...f.root,event:'buy-suits'})).toEqual({saved:false,reason:'unknown_event',value:'buy-suits'});
 expect(await changeIdea(t.db,f.a,{...f.root,event:'buy-suits',place:'Elsewhere'})).toEqual({saved:false,reason:'unknown_event',value:'buy-suits'});
 await expect(t.db.query("update emba_team_event set state='planned',archived_at=null where slug='buy-suits'")).rejects.toThrow();
 await expect(t.db.query("update emba_team_event set archived_at=null where slug='buy-suits'")).rejects.toThrow();
});
it('opens one ask for a missing day to those who are in, and the day with most answers wins',async()=>{
 const f=await fixture(),days=[day(2),day(3),day(4)];
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Cooking class',offeredDays:days}));
 await join(f,f.b,'cooking-class');
 expect((await t.db.query('select count(*)::int as n from emba_ask')).rows).toEqual([{n:0}]);
 const third=await join(f,f.c,'cooking-class');
 expect(third.event.idea).toMatchObject({state:'idea',needs:0,day:null,dayAsk:{number:1,open:true}});
 // The ask is the proposer's, lists the offered days, and is put to the three who are in.
 const asked=(await askResults(t.db,f.a,{...f.root,number:1})).ask;
 expect(asked).toMatchObject({kind:'dates',reveal:'named',event:'cooking-class',youAsked:true,by:{handle:'@trip/ana'},assistant:null,forThoseIn:true,answered:0,expected:3,options:days.map((label,index)=>({number:index+1,label}))});
 expect(asked.question).toBe('Which day for Cooking class?');
 expect(Date.parse(asked.closesAt)-Date.parse(asked.createdAt)).toBe(IDEAS.askHours*3600000);
 expect(asked.missing?.map(person=>person.handle).sort()).toEqual(['@trip/ana','@trip/ben','@trip/cy']);
 expect((await actions()).at(-1)).toBe('asked');
 expect(formatNews(await whatsNew(t.db,f.d,f.root))).toMatch(/Loop asked the members who are in on idea @trip\/cooking-class to choose its day \(ask #1\)\./);
 // It waits for those who are in and for nobody else, who cannot answer it.
 expect((await waiting(t.db,f.b)).items).toMatchObject([{kind:'ask',ask:{number:1}}]);
 expect((await waiting(t.db,f.d)).items).toEqual([]);
 expect((await whatsNew(t.db,f.d,f.root)).unanswered.items).toEqual([]);
 expect(await answerAsk(t.db,f.d,{...f.root,number:1,choices:[1]})).toMatchObject({saved:false,reason:'not_in'});
 // Two for the second day, one for the third. The last answer closes it and sets the day.
 expect(await answerAsk(t.db,f.a,{...f.root,number:1,choices:[days[1]]})).toMatchObject({saved:true,ask:{open:true}});
 expect(await answerAsk(t.db,f.b,{...f.root,number:1,choices:[days[2]]})).toMatchObject({saved:true,ask:{open:true}});
 expect(await answerAsk(t.db,f.c,{...f.root,number:1,choices:[2]})).toMatchObject({saved:true,ask:{open:false,answered:3,expected:3}});
 expect(await stateOf('cooking-class')).toMatchObject({state:'idea',day:days[1]});
 expect((await actions()).at(-1)).toBe('ask_closed');
 // The proposer is asked to set the time.
 const told=await waiting(t.db,f.a);
 expect(told.items).toMatchObject([{kind:'idea',why:'needs_time',event:{slug:'cooking-class',idea:{day:days[1],dayAsk:{number:1,open:false}}}}]);
 expect(formatWaiting(told)).toContain(`and a day, ${days[1]}, and no start time`);
 expect((await whatsOn(t.db,f.d,{...f.root,day:days[1]})).ideas.items.map(idea=>idea.slug)).toEqual(['cooking-class']);
 expect((await whatsOn(t.db,f.d,{...f.root,day:days[2]})).ideas.items).toEqual([]);
 // It loses and regains a member: no second ask is opened.
 await join(f,f.c,'cooking-class',false);await join(f,f.d,'cooking-class');
 expect((await t.db.query('select count(*)::int as n from emba_ask')).rows).toEqual([{n:1}]);
 // The proposer sets the time and the place, and it becomes a plan.
 expect(ok(await changeIdea(t.db,f.a,{...f.root,event:'cooking-class',startsAt:`${days[1]}T10:00`})).event.idea).toMatchObject({state:'idea'});
 expect(ok(await changeIdea(t.db,f.a,{...f.root,event:'cooking-class',place:'Kitchen'})).event.idea).toMatchObject({state:'planned'});
 expect((await t.db.query('select count(*)::int as n from emba_ask')).rows).toEqual([{n:1}]);
 // The database refuses a second ask for the idea even if the service were wrong.
 await expect(t.db.query('update emba_team_event set day_ask_id=null')).rejects.toThrow();
});
it('leaves a tied day to the proposer, closes the ask after 48 hours, and asks over the days left of the trip when none were offered',async()=>{
 const f=await fixture();
 // The fixed programme ends in five days: the days to choose from are tomorrow to then.
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'farewell',name:'Farewell dinner',startsAt:at(5,'19:00')})).toMatchObject({saved:true});
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Boat trip',needed:2}));
 await join(f,f.b,'boat-trip');
 const asked=(await askResults(t.db,f.a,{...f.root,number:1})).ask;
 expect(asked.options.map(option=>option.label)).toEqual([1,2,3,4,5].map(day));
 // One answer each for different days: a tie.
 await answerAsk(t.db,f.a,{...f.root,number:1,choices:[1,2]});
 // The member who has not answered drops out and takes nothing with them; the ask stays open for the one who is left.
 expect((await askResults(t.db,f.a,{...f.root,number:1})).ask).toMatchObject({open:true,answered:1,expected:2});
 await backdate("update emba_ask set created_at=created_at-interval '49 hours',closes_at=closes_at-interval '49 hours'");
 // A read finds it past its time, notes it closed, and the day stays open because two days tie.
 expect((await whatsNew(t.db,f.b,f.root)).changes.map(change=>change.action)).toEqual(['event_added','event_proposed','asked','ask_closed']);
 expect(await stateOf('boat-trip')).toMatchObject({state:'idea',day:null});
 expect(await answerAsk(t.db,f.b,{...f.root,number:1,choices:[1]})).toMatchObject({saved:false,reason:'closed'});
 const ideas=async(who:Principal)=>(await waiting(t.db,who)).items.filter(item=>item.kind==='idea');
 expect(await ideas(f.a)).toMatchObject([{kind:'idea',why:'choose_day',event:{slug:'boat-trip'}}]);
 expect(formatWaiting(await waiting(t.db,f.a))).toContain('The user chooses the day');
 expect(await changeIdea(t.db,f.b,{...f.root,event:'boat-trip',day:day(2)})).toEqual({saved:false,reason:'not_yours'});
 expect(ok(await changeIdea(t.db,f.a,{...f.root,event:'boat-trip',day:day(2)})).event.idea).toMatchObject({day:day(2)});
 expect(await ideas(f.a)).toMatchObject([{kind:'idea',why:'needs_time'}]);
 expect((await t.db.query('select count(*)::int as n from emba_ask')).rows).toEqual([{n:1}]);
});
it('sets the day from an ask its asker closes early, counting only those still in',async()=>{
 const f=await fixture(),days=[day(2),day(3)];
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Museum',offeredDays:days}));
 await join(f,f.b,'museum');await join(f,f.c,'museum');
 await answerAsk(t.db,f.b,{...f.root,number:1,choices:[1]});await answerAsk(t.db,f.c,{...f.root,number:1,choices:[2]});
 // Whoever drops out takes their answer about the day with them.
 await join(f,f.c,'museum',false);
 expect((await askResults(t.db,f.a,{...f.root,number:1})).ask).toMatchObject({answered:1,expected:2});
 expect(await closeAsk(t.db,f.a,{...f.root,number:1})).toMatchObject({saved:true,changed:true});
 expect(await stateOf('museum')).toMatchObject({day:days[0]});
});
it('lapses an idea that goes nowhere, and keeps it in the team\'s history',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Someday'}));ok(await proposeIdea(t.db,f.a,{...f.root,name:'Tonight',startsAt:at(1)}));
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Fresh'}));
 await backdate("update emba_team_event set created_at=created_at-interval '14 days 1 minute' where slug='someday'");
 await backdate("update emba_team_event set starts_at=clock_timestamp()-interval '12 hours 1 minute' where slug='tonight'");
 // By the clock alone they are gone from the lists, before anything has noted it.
 expect((await eventDetail(t.db,f.b,{...f.root,event:'someday'})).event.idea).toMatchObject({state:'lapsed'});
 expect(await stateOf('someday')).toMatchObject({state:'idea',archived:false});
 // The day's list leaves them out, and notes the lapse as it does.
 expect((await whatsOn(t.db,f.b,f.root)).ideas.items.map(idea=>idea.slug)).toEqual(['fresh']);
 expect(await stateOf('someday')).toMatchObject({state:'lapsed',archived:true});
 // A read notes them, as Loop, in the change sequence.
 const news=await whatsNew(t.db,f.b,f.root);
 expect(news.changes.map(change=>change.action).sort()).toEqual(['event_lapsed','event_lapsed','event_proposed','event_proposed','event_proposed']);
 expect(formatNews(news)).toMatch(/idea @trip\/someday lapsed without becoming a plan\./);
 expect(await stateOf('someday')).toMatchObject({state:'lapsed',archived:true});expect(await stateOf('tonight')).toMatchObject({state:'lapsed',archived:true});
 expect(await setInterest(t.db,f.b,{...f.root,event:'someday'})).toEqual({saved:false,reason:'unknown_event',value:'someday'});
 // They no longer count toward the member's five, and the tag is free again.
 expect(ok(await proposeIdea(t.db,f.a,{...f.root,name:'Someday'})).event.slug).toBe('someday');
 await expect(t.db.query("update emba_team_event set state='idea',archived_at=null where state='lapsed'")).rejects.toThrow();
 // A write that meets an idea past its time refuses it: joining is not counted. The next read notes the lapse.
 await backdate("update emba_team_event set created_at=created_at-interval '15 days' where slug='fresh'");
 expect(await setInterest(t.db,f.b,{...f.root,event:'fresh'})).toEqual({saved:false,reason:'unknown_event',value:'fresh'});
 expect((await t.db.query("select count(*)::int as n from emba_event_interest i join emba_team_event e on e.id=i.event_id where e.slug='fresh'")).rows).toEqual([{n:1}]);
 await whatsNew(t.db,f.b,f.root);
 expect(await stateOf('fresh')).toMatchObject({state:'lapsed'});
});
it('lists what is on a day: fixed events, plans and ideas with names, those closest to their number first',async()=>{
 const f=await fixture(),agent=await assistant(f,f.d),thursday=day(3);
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'temple',name:'Temple visit',startsAt:`${thursday}T09:00`,place:'Temple of Literature'})).toMatchObject({saved:true});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'other-day',name:'Other day',startsAt:at(4)})).toMatchObject({saved:true});
 await join(f,f.b,'temple');
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Dinner',needed:2,startsAt:`${thursday}T19:00`,place:'Bun cha place'}));await join(f,f.b,'dinner');
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Far off',needed:5,startsAt:`${thursday}T12:00`}));
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits',startsAt:`${thursday}T15:00`,place:'Tailor'}));await join(f,f.b,'buy-suits');
 ok(await proposeIdea(t.db,f.c,{...f.root,name:'Any day'}));ok(await proposeIdea(t.db,f.c,{...f.root,name:'Friday only',offeredDays:[day(4)]}));
 const list=await whatsOn(t.db,agent,{...f.root,day:thursday});
 expect(list).toMatchObject({day:thursday,events:[{slug:'temple',interested:1,people:[{handle:'@trip/ben'}]}],plans:[{slug:'dinner',idea:{state:'planned'},people:[{handle:'@trip/ana'},{handle:'@trip/ben'}]}]});
 // The idea one short comes before the one two short and the one four short. An idea with no day yet belongs to every day; one offered for Friday only does not.
 expect(list.ideas.items.map(idea=>[idea.slug,idea.idea!.needs])).toEqual([['buy-suits',1],['any-day',2],['far-off',4]]);
 expect(list.ideas.items[0]).toMatchObject({youAreInterested:false,people:[{handle:'@trip/ana'},{handle:'@trip/ben'}],morePeople:0});
 expect(JSON.stringify(list)).not.toMatch(uuids);
 const text=formatDay(list);textRules(text);
 expect(text).toContain(`What is on ${thursday}:`);expect(text).toContain('Idea @trip/buy-suits');expect(text).toContain('2 in, needs 1 more of 3.');expect(text).toContain('In: @trip/ana, @trip/ben.');
 expect(text.indexOf('Fixed events:')).toBeLessThan(text.indexOf('Plans:'));expect(text.indexOf('Plans:')).toBeLessThan(text.indexOf('Ideas, those closest'));
 // Loop lists; it recommends nothing.
 expect(text).not.toMatch(/recommend|suggest|should/i);
 // With no day: everything that has not ended.
 const all=await whatsOn(t.db,f.d,f.root);
 expect(all.events.map(event=>event.slug)).toEqual(['temple','other-day']);expect(all.ideas.items.map(idea=>idea.slug).sort()).toEqual(['any-day','buy-suits','far-off','friday-only']);
 await expect(whatsOn(t.db,f.d,{...f.root,day:'tomorrow'})).rejects.toThrow();
});
it('shows an idea one short of its number to members who are not in, in waiting and in what is new',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits',startsAt:at(3),place:'Tailor'}));
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Two short'}));
 expect((await waiting(t.db,f.d)).items).toEqual([]);expect((await whatsNew(t.db,f.d,f.root)).oneShort).toBeUndefined();
 await join(f,f.b,'buy-suits');
 const told=await waiting(t.db,f.d);
 expect(told).toMatchObject({count:1,items:[{kind:'idea',why:'one_short',team:{handle:'@trip'},event:{slug:'buy-suits',idea:{needs:1}}}]});
 const text=formatWaiting(told);textRules(text);
 expect(text).toContain('Idea @trip/buy-suits in @trip');expect(text).toContain('needs one more person');expect(text).toContain('call interested with team @trip/buy-suits');
 expect((await whatsNew(t.db,f.d,f.root)).oneShort?.map(idea=>idea.slug)).toEqual(['buy-suits']);
 expect(formatNews(await whatsNew(t.db,f.d,f.root))).toContain('Ideas that need one more person, which the user is not in on:');
 // Not to those who are in, and not to a follower, who cannot join.
 expect((await waiting(t.db,f.b)).items).toEqual([]);expect((await whatsNew(t.db,f.a,f.root)).oneShort).toBeUndefined();
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.members[4].personId]);
 expect((await waiting(t.db,f.members[4])).items).toEqual([]);expect((await whatsNew(t.db,f.members[4],f.root)).oneShort).toBeUndefined();
 // Saying it is not for them stops it; joining makes it a plan, which waits for nobody.
 expect(await setInterest(t.db,f.d,{...f.root,event:'buy-suits',interested:false,decline:true})).toMatchObject({saved:true,declined:true});
 expect((await waiting(t.db,f.d)).items).toEqual([]);expect((await whatsNew(t.db,f.d,f.root)).oneShort).toBeUndefined();
 await join(f,f.c,'buy-suits');
 expect((await waiting(t.db,f.members[5])).items).toEqual([]);
});
it('follows membership: a leaver is out of every idea, their open ideas lapse and their plans pass to organizers',async()=>{
 const f=await fixture();
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Open idea'}));
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Made plan',needed:2,startsAt:at(3),place:'Somewhere'}));await join(f,f.b,'made-plan');
 ok(await proposeIdea(t.db,f.b,{...f.root,name:'Others idea'}));await join(f,f.a,'others-idea');
 // The export lists the ideas a person proposed; those they are in on are among their interests.
 const mine=await exportPersonalData(t.db,{...f.a,authenticatedAt:Date.now()});
 expect(mine.ideas.map(idea=>(idea as {slug:string;state:string}).slug).sort()).toEqual(['made-plan','open-idea']);
 expect(mine.eventInterests.map(mark=>(mark as {slug:string}).slug).sort()).toEqual(['made-plan','open-idea','others-idea']);
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.a.personId});
 expect(await stateOf('open-idea')).toMatchObject({state:'lapsed',archived:true});
 expect(await stateOf('made-plan')).toMatchObject({state:'planned',archived:false,proposer:null});
 expect((await actions()).filter(action=>action==='event_lapsed')).toEqual(['event_lapsed']);
 // They are counted in nothing, and named in nothing.
 expect((await eventDetail(t.db,f.c,{...f.root,event:'others-idea'})).event).toMatchObject({interested:1,idea:{needs:2},people:[{handle:'@trip/ben'}]});
 expect((await eventDetail(t.db,f.c,{...f.root,event:'made-plan'})).event).toMatchObject({interested:1,idea:{state:'planned'}});
 // The plan stays, and the team's organizers look after it; a member who is merely in does not.
 expect(await cancelIdea(t.db,f.b,{...f.root,event:'made-plan'})).toEqual({saved:false,reason:'not_yours'});
 expect(ok(await changeIdea(t.db,f.organizer,{...f.root,event:'made-plan',place:'Elsewhere'})).event.place).toBe('Elsewhere');
 expect(ok(await cancelIdea(t.db,f.organizer,{...f.root,event:'made-plan'})).event.idea).toMatchObject({state:'cancelled'});
 // Deleting an account unlinks what is left.
 ok(await proposeIdea(t.db,f.c,{...f.root,name:'Deleted soon'}));
 await applyDeletionTombstones(t.db,[f.c.personId]);
 expect(await stateOf('deleted-soon')).toMatchObject({state:'lapsed',proposer:null});
 expect((await t.db.query('select count(*)::int as n from emba_team_event where proposer_id=$1',[f.c.personId])).rows).toEqual([{n:0}]);
});
it('sets the day of a timed-out ask on a plain read of the site, with nobody calling what is new',async()=>{
 const f=await fixture(),days=[day(2),day(3)];
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Museum',offeredDays:days}));
 await join(f,f.b,'museum');await join(f,f.c,'museum');
 await answerAsk(t.db,f.a,{...f.root,number:1,choices:[2]});await answerAsk(t.db,f.b,{...f.root,number:1,choices:[2]});
 await backdate("update emba_ask set created_at=created_at-interval '49 hours',closes_at=closes_at-interval '49 hours'");
 expect(await stateOf('museum')).toMatchObject({day:null});
 // The proposer opens what is waiting: the ask is noted closed, the day is set, and they are asked for the time.
 expect((await waiting(t.db,f.a)).items).toMatchObject([{kind:'idea',why:'needs_time',event:{slug:'museum',idea:{day:days[1]}}}]);
 expect(await stateOf('museum')).toMatchObject({state:'idea',day:days[1]});
 expect((await actions()).filter(action=>action==='ask_closed')).toEqual(['ask_closed']);
 expect((await t.db.query("select actor_id from emba_team_change where action='ask_closed'")).rows).toEqual([{actor_id:null}]);
 // The same through the day's list, for another idea.
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Gallery',needed:2,offeredDays:days}));await join(f,f.b,'gallery');
 await answerAsk(t.db,f.a,{...f.root,number:2,choices:[1]});
 await backdate("update emba_ask set created_at=created_at-interval '49 hours',closes_at=closes_at-interval '49 hours' where closed_at is null");
 expect((await whatsOn(t.db,f.d,{...f.root,day:days[0]})).ideas.items.map(idea=>[idea.slug,idea.idea!.day])).toEqual([['gallery',days[0]]]);
 expect((await actions()).filter(action=>action==='ask_closed')).toHaveLength(2);
});
it('closes the ask for a day when the last member it waits for drops out, and keeps Loop\'s asks out of the member\'s own room for asks',async()=>{
 const f=await fixture(),days=[day(2),day(3)];
 ok(await proposeIdea(t.db,f.a,{...f.root,name:'Museum',offeredDays:days}));
 await join(f,f.b,'museum');await join(f,f.c,'museum');
 await answerAsk(t.db,f.a,{...f.root,number:1,choices:[1]});await answerAsk(t.db,f.b,{...f.root,number:1,choices:[1]});
 expect((await askResults(t.db,f.a,{...f.root,number:1})).ask).toMatchObject({open:true,answered:2,expected:3});
 await join(f,f.c,'museum',false);
 expect((await askResults(t.db,f.a,{...f.root,number:1})).ask).toMatchObject({open:false,answered:2,expected:2});
 expect(await stateOf('museum')).toMatchObject({state:'idea',day:days[0]});
 expect((await actions()).at(-1)).toBe('ask_closed');
});
