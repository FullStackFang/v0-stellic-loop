// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {grantRole,revokeMembership} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import * as asksModule from '@/lib/emba/team-asks';
import {answerAsk,askReminder,askResults,askShare,askShareMessage,ASKS,closeAsk,createAsk,listAsks,setAskReveal,type AnswerWrite,type AskWrite} from '@/lib/emba/team-asks';
import {addEvent} from '@/lib/emba/team-events';
import {saveBrief,teamBrief,whatsNew} from '@/lib/emba/team-read';
import {LIMITS} from '@/lib/emba/team-records';

// Specs: openspec/changes/loop-club-events-and-asks/specs/group-asks.
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
async function assistant(f:F,who:Principal,actions:string[]=['plan:read','group-memory:write'],client='claude',scope:{orgId:string;loopId:string}=f.root) {
 await grantLease(t.db,who,{...scope,clientId:client,actions,expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
/** A closing time some days from now, with an offset, so the test does not depend on the team's timezone. */
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,19)+'Z';
const asked=(result:AskWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result.ask;};
const answered=(result:AnswerWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result.ask;};
const dates=(f:F,who:Principal=f.memberA,extra:Record<string,unknown>={})=>createAsk(t.db,who,{...f.root,question:'Which date works?',kind:'dates',options:['2099-03-14','2099-03-21','2099-03-28'],closesAt:inDays(5),...extra});
const pick=(f:F,who:Principal,number:number,extra:Record<string,unknown>)=>answerAsk(t.db,who,{...f.root,number,...extra});
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const idFree=(value:unknown,f:F)=>{const text=JSON.stringify(value);for(const person of [...f.members,f.organizer])expect(text).not.toContain(person.personId);expect(text).not.toMatch(uuids);};
const follower=(f:F,who:Principal)=>t.db.query("update emba_role set role='follower' where person_id=$1",[who.personId]);
/** Moves an ask's closing time into the past, as if time had gone by. The guard on the table is the thing under test elsewhere, so it is set aside here only. */
async function elapse(number:number,closedAgo:string) {
 await t.db.query('alter table emba_ask disable trigger emba_ask_guard');
 await t.db.query(`update emba_ask set created_at=clock_timestamp()-interval '30 days',closes_at=clock_timestamp()-interval '${closedAgo}' where number=$1`,[number]);
 await t.db.query('alter table emba_ask enable trigger emba_ask_guard');
}

it('lets a member ask a question of each kind, with a closing time, a reveal setting and optionally an event',async()=>{
 const f=await fixture();
 expect((await addEvent(t.db,f.organizer,{...f.root,slug:'tasting',name:'Tasting',startsAt:'2099-03-01T19:00'})).saved).toBe(true);
 const agent=await assistant(f,f.memberA);
 const ask=asked(await dates(f,agent,{event:'tasting'}));
 expect(ask).toMatchObject({number:1,question:'Which date works?',kind:'dates',reveal:'named',event:'tasting',open:true,youAsked:true,assistant:'claude',by:{handle:'@club/ana',isYou:true},timezone:'America/New_York',
  options:[{number:1,label:'2099-03-14'},{number:2,label:'2099-03-21'},{number:3,label:'2099-03-28'}],yourAnswer:null,answered:0,results:[{number:1,count:0,people:[]},{number:2,count:0},{number:3,count:0}],written:[],canClose:true});
 expect(ask.shareUrl).toMatch(/\/a\/[0-9a-f]{32}$/);expect(ask.expected).toBeGreaterThan(5);expect(ask.missing).toHaveLength(ask.expected);
 expect(askShareMessage(ask)).toBe(`Which date works?\n${ask.shareUrl}`);
 idFree(ask,f);
 // The change log names the person and the assistant.
 expect((await t.db.query('select action,client_id,actor_id=$1 as asker from emba_team_change where ask_id is not null',[f.memberA.personId])).rows).toEqual([{action:'asked',client_id:'claude',asker:true}]);
 // The same open question again is the same ask.
 expect(await dates(f,agent,{event:'tasting'})).toMatchObject({saved:true,created:false,ask:{number:1}});
 // The other kinds, on the site.
 expect(asked(await createAsk(t.db,f.memberB,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1),reveal:'counts'}))).toMatchObject({number:2,kind:'one',reveal:'counts',assistant:null,results:[{label:'Red',count:0},{label:'White',count:0}]});
 expect(asked(await createAsk(t.db,f.memberB,{...f.root,question:'What should we bring?',kind:'many',options:['Cheese','Bread','Olives'],closesAt:inDays(60)}))).toMatchObject({number:3,kind:'many'});
 expect(asked(await createAsk(t.db,f.memberB,{...f.root,question:'Any  allergies?\n',kind:'text',closesAt:inDays(2)}))).toMatchObject({number:4,kind:'text',question:'Any allergies?',options:[]});
 // Refusals say what is wrong, and nothing is saved.
 const base={...f.root,question:'Q?',kind:'one',options:['A','B'],closesAt:inDays(1)};
 expect(await createAsk(t.db,f.memberA,{...base,options:['Only']})).toEqual({saved:false,reason:'options',problem:'too_few'});
 expect(await createAsk(t.db,f.memberA,{...base,options:Array.from({length:11},(_,i)=>`Option ${i}`)})).toEqual({saved:false,reason:'options',problem:'too_many'});
 expect(await createAsk(t.db,f.memberA,{...base,options:['Same','same']})).toEqual({saved:false,reason:'options',problem:'duplicate'});
 expect(await createAsk(t.db,f.memberA,{...base,kind:'text'})).toEqual({saved:false,reason:'options',problem:'not_for_text'});
 expect(await createAsk(t.db,f.memberA,{...base,kind:'dates',options:['2099-02-30','2099-03-01']})).toEqual({saved:false,reason:'options',problem:'not_a_date'});
 expect(await createAsk(t.db,f.memberA,{...base,closesAt:inDays(-1)})).toEqual({saved:false,reason:'closing_time',problem:'past'});
 expect(await createAsk(t.db,f.memberA,{...base,closesAt:inDays(61)})).toEqual({saved:false,reason:'closing_time',problem:'too_far'});
 expect(await createAsk(t.db,f.memberA,{...base,event:'no-such'})).toEqual({saved:false,reason:'unknown_event',value:'no-such'});
 for(const bad of [{question:'x'.repeat(201)},{question:' '},{options:['A','x'.repeat(81)]},{kind:'rank'},{closesAt:'Friday'},{reveal:'secret'},{personId:f.memberB.personId}])
  await expect(createAsk(t.db,f.memberA,{...base,...bad})).rejects.toThrow();
 // A follower can read and cannot ask; an assistant with a read-only grant, a grant for another team, and a non-member are denied.
 await follower(f,f.members[3]);
 expect(await createAsk(t.db,f.members[3],base)).toEqual({saved:false,reason:'members_only'});
 await expect(createAsk(t.db,await assistant(f,f.members[4],['plan:read'],'reader'),base)).rejects.toThrow('forbidden');
 await expect(createAsk(t.db,await assistant(f,f.members[4],['plan:read','group-memory:write'],'elsewhere',f.vietnam),base)).rejects.toThrow('forbidden');
 await expect(createAsk(t.db,f.nonmember,base)).rejects.toThrow('forbidden');
 expect((await t.db.query('select number from emba_ask order by number')).rows).toEqual([{number:1},{number:2},{number:3},{number:4}]);
 // The database keeps the bounds too.
 await expect(t.db.query("update emba_ask set question='Changed' where number=1")).rejects.toThrow();
 await expect(t.db.query("insert into emba_ask(org_id,loop_id,number,question,kind,reveal,closes_at) values($1,$2,99,'Q','text','named',clock_timestamp()+interval '61 days')",[f.orgId,f.rootId])).rejects.toThrow();
},120000);

it('takes one answer per member, replaceable and removable while the ask is open, valid for its kind',async()=>{
 const f=await fixture();
 asked(await dates(f));
 // Changing an answer: only the later one counts.
 expect(answered(await pick(f,f.memberB,1,{choices:['2099-03-14']}))).toMatchObject({answered:1,yourAnswer:{choices:[{number:1,label:'2099-03-14'}],text:null}});
 const changed=answered(await pick(f,f.memberB,1,{choices:[3,2,'3']}));
 expect(changed).toMatchObject({answered:1,yourAnswer:{choices:[{number:2},{number:3}]},results:[{number:1,count:0},{number:2,count:1},{number:3,count:1}]});
 expect(await pick(f,f.memberB,1,{choices:[2,3]})).toMatchObject({saved:true,changed:false});
 expect((await t.db.query('select count(*)::int as n from emba_ask_answer')).rows).toEqual([{n:1}]);
 // An option the ask does not have: nothing saved, and the reply lists the valid ones.
 const unknown=await pick(f,f.memberB,1,{choices:['2099-04-04']});
 expect(unknown).toMatchObject({saved:false,reason:'unknown_option',value:'2099-04-04',ask:{options:[{label:'2099-03-14'},{label:'2099-03-21'},{label:'2099-03-28'}],yourAnswer:{choices:[{number:2},{number:3}]}}});
 expect(await pick(f,f.memberB,1,{choices:[9]})).toMatchObject({saved:false,reason:'unknown_option',value:'9'});
 expect(await pick(f,f.memberB,1,{text:'Any day'})).toMatchObject({saved:false,reason:'answer_shape',problem:'needs_choice'});
 expect(await pick(f,f.memberB,1,{})).toMatchObject({saved:false,reason:'answer_shape',problem:'needs_choice'});
 expect(await pick(f,f.memberB,9,{choices:[1]})).toEqual({saved:false,reason:'unknown_ask',value:9});
 // Pick one takes exactly one; a written ask takes one line.
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1)}));
 expect(await pick(f,f.memberB,2,{choices:['Red','White']})).toMatchObject({saved:false,reason:'answer_shape',problem:'one_only'});
 expect(answered(await pick(f,f.memberB,2,{choices:['white']})).yourAnswer).toEqual({choices:[{number:2,label:'White'}],text:null});
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Any allergies?',kind:'text',closesAt:inDays(1)}));
 expect(await pick(f,f.memberB,3,{choices:[1]})).toMatchObject({saved:false,reason:'answer_shape',problem:'needs_text'});
 expect(await pick(f,f.memberB,3,{text:'  '})).toMatchObject({saved:false,reason:'answer_shape',problem:'needs_text'});
 await expect(pick(f,f.memberB,3,{text:'x'.repeat(401)})).rejects.toThrow();
 expect(answered(await pick(f,f.memberB,3,{text:'Nuts,\nplease note'})).yourAnswer).toEqual({choices:[],text:'Nuts, please note'});
 // Taking an answer back.
 expect(await pick(f,f.memberB,3,{remove:true})).toMatchObject({saved:true,changed:true,ask:{yourAnswer:null,answered:0}});
 expect(await pick(f,f.memberB,3,{remove:true})).toMatchObject({saved:true,changed:false});
 // Nobody answers for anyone else; a follower, a read-only assistant and a non-member cannot answer.
 await expect(pick(f,f.memberB,1,{choices:[1],personId:f.memberA.personId})).rejects.toThrow();
 await follower(f,f.members[3]);
 expect(await pick(f,f.members[3],1,{choices:[1]})).toEqual({saved:false,reason:'members_only'});
 await expect(pick(f,await assistant(f,f.members[4],['plan:read'],'reader'),1,{choices:[1]})).rejects.toThrow('forbidden');
 await expect(pick(f,f.nonmember,1,{choices:[1]})).rejects.toThrow('forbidden');
 // How each answer arrived is stored: the site, a share link, or an assistant and its name. An assistant cannot state its own route.
 await pick(f,f.members[2],1,{choices:[1],route:'share_link'});
 await pick(f,await assistant(f,f.members[4]),1,{choices:[1],route:'site'});
 expect((await t.db.query('select a.route,a.client_id from emba_ask_answer a join emba_ask k on k.id=a.ask_id where k.number=1 order by a.at')).rows).toEqual([{route:'site',client_id:null},{route:'share_link',client_id:null},{route:'assistant',client_id:'claude'}]);
 // The route is never part of what members read.
 expect(JSON.stringify(await askResults(t.db,f.memberA,{...f.root,number:1}))).not.toMatch(/share_link|"route"/);
},120000);

it('closes at its time by the database clock, or earlier by the asker or an organizer, and is never reopened',async()=>{
 const f=await fixture();
 asked(await dates(f));asked(await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1),reveal:'counts'}));
 await pick(f,f.memberB,1,{choices:[1]});await pick(f,f.memberB,2,{choices:['Red']});
 // One minute after the closing time: nothing is saved, and the reply shows the result the member may see.
 await elapse(1,'1 minute');
 const late=await pick(f,f.members[2],1,{choices:[2]});
 expect(late).toMatchObject({saved:false,reason:'closed',ask:{open:false,answered:1,results:[{number:1,count:1,people:[{handle:'@club/ben'}]},{number:2,count:0},{number:3,count:0}]}});
 expect(late.saved===false&&late.reason==='closed'&&late.ask.missing).toBeUndefined();
 expect(await pick(f,f.memberB,1,{remove:true})).toMatchObject({saved:false,reason:'closed'});
 // The table refuses a late answer even if a service were wrong.
 await expect(t.db.query("insert into emba_ask_answer(ask_id,person_id,choices,route) select id,$1,'{1}','site' from emba_ask where number=1",[f.members[2].personId])).rejects.toThrow();
 // Closing early: not another member; the asker can; it then takes no answers and stays closed.
 expect(await closeAsk(t.db,f.memberB,{...f.root,number:2})).toEqual({saved:false,reason:'not_yours'});
 expect(await closeAsk(t.db,f.memberA,{...f.root,number:2})).toMatchObject({saved:true,changed:true,ask:{open:false,canClose:false,results:[{label:'Red',count:1},{label:'White',count:0}]}});
 expect(await closeAsk(t.db,f.memberA,{...f.root,number:2})).toMatchObject({saved:true,changed:false});
 expect(await pick(f,f.members[2],2,{choices:['White']})).toMatchObject({saved:false,reason:'closed'});
 await expect(t.db.query('update emba_ask set closed_at=null where number=2')).rejects.toThrow();
 expect(await closeAsk(t.db,f.memberA,{...f.root,number:9})).toEqual({saved:false,reason:'unknown_ask',value:9});
 // An owner or organizer closes anyone's ask, also through an assistant with a read-and-write grant; a member's assistant cannot close another's.
 asked(await createAsk(t.db,f.memberB,{...f.root,question:'Third?',kind:'text',closesAt:inDays(1)}));
 expect(await closeAsk(t.db,await assistant(f,f.memberA),{...f.root,number:3})).toEqual({saved:false,reason:'not_yours'});
 expect(await closeAsk(t.db,await assistant(f,f.organizer,['plan:read','group-memory:write'],'lead'),{...f.root,number:3})).toMatchObject({saved:true,changed:true});
 // Asked, closed by its time (by Loop), closed early twice. Answers are not in the sequence.
 expect((await t.db.query('select c.action,k.number,c.actor_id is null as loop,c.client_id from emba_team_change c join emba_ask k on k.id=c.ask_id order by c.seq')).rows).toEqual([
  {action:'asked',number:1,loop:false,client_id:null},{action:'asked',number:2,loop:false,client_id:null},{action:'ask_closed',number:1,loop:true,client_id:null},
  {action:'ask_closed',number:2,loop:false,client_id:null},{action:'asked',number:3,loop:false,client_id:null},{action:'ask_closed',number:3,loop:false,client_id:'lead'}]);
},120000);

it('shows results by the reveal setting, to members and followers only, and fixes the setting at the first answer',async()=>{
 const f=await fixture();
 asked(await dates(f));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1),reveal:'counts'}));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Any allergies?',kind:'text',closesAt:inDays(1),reveal:'counts'}));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Favourite grape?',kind:'text',closesAt:inDays(1)}));
 // Before anyone answers, the asker (and only the asker) can change the setting.
 expect(await setAskReveal(t.db,f.memberB,{...f.root,number:4,reveal:'counts'})).toEqual({saved:false,reason:'not_yours'});
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Fifth?',kind:'text',closesAt:inDays(1)}));
 expect(await setAskReveal(t.db,f.memberA,{...f.root,number:5,reveal:'counts'})).toMatchObject({saved:true,changed:true,ask:{reveal:'counts'}});
 // Only toward showing less: it is not switched back.
 expect(await setAskReveal(t.db,f.memberA,{...f.root,number:5,reveal:'named'})).toMatchObject({saved:false,reason:'reveal_fixed'});
 for(const [who,choice] of [[f.memberB,1],[f.members[2],1],[f.memberA,2]] as const)await pick(f,who,1,{choices:[choice]});
 for(const [who,choice] of [[f.memberB,'Red'],[f.members[2],'White'],[f.members[3],'Red']] as const)await pick(f,who,2,{choices:[choice]});
 await pick(f,f.memberB,3,{text:'Zebra'});await pick(f,f.members[2],3,{text:'Apple'});
 await pick(f,f.memberB,4,{text:'Syrah'});await pick(f,f.members[2],4,{text:'Gamay'});
 // After the first answer the setting is fixed, in the service and in the table.
 expect(await setAskReveal(t.db,f.memberA,{...f.root,number:2,reveal:'named'})).toMatchObject({saved:false,reason:'reveal_fixed'});
 await expect(t.db.query("update emba_ask set reveal='named' where number=2")).rejects.toThrow();
 // Named: who chose what. On the site by name; to an assistant by handle, or with no name at all.
 const site=(await askResults(t.db,f.members[4],{...f.root,number:1})).ask;
 expect(site.results.map(option=>[option.number,option.count,option.people!.map(person=>person.name)])).toEqual([[1,2,['Member 3','Member B']],[2,1,['Member A']],[3,0,[]]]);
 const agent=await assistant(f,f.members[4],['plan:read'],'reader'),seen=(await askResults(t.db,agent,{...f.root,number:1})).ask;
 expect(seen.results[0].people).toEqual([{handle:'@club/ben',isYou:false,former:false},{handle:null,isYou:false,former:false}]);
 expect(seen.missing).toBeUndefined();idFree(seen,f);expect(JSON.stringify(seen)).not.toMatch(/Member/);
 expect((await askResults(t.db,f.members[4],{...f.root,number:4})).ask.written).toMatchObject([{text:'Gamay',by:{name:'Member 3'}},{text:'Syrah',by:{name:'Member B'}}]);
 // Counts: totals only, for every viewer including the asker and an owner. Written answers carry no name and no order of arrival.
 for(const who of [f.memberA,f.organizer,f.members[4]]){
  const counts=(await askResults(t.db,who,{...f.root,number:2})).ask;
  expect(counts.results).toEqual([{number:1,label:'Red',count:2},{number:2,label:'White',count:1}]);
  expect(JSON.stringify(counts.results)).not.toMatch(/people|Member|@club/);
  expect((await askResults(t.db,who,{...f.root,number:3})).ask.written).toEqual([{text:'Apple'},{text:'Zebra'}]);
 }
 // A follower reads results; a person outside the team, and an assistant with no grant for it, read nothing.
 await follower(f,f.members[5]);
 expect((await askResults(t.db,f.members[5],{...f.root,number:2})).ask.results[0].count).toBe(2);
 await expect(askResults(t.db,f.nonmember,{...f.root,number:2})).rejects.toThrow('forbidden');
 await expect(listAsks(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 await expect(askResults(t.db,await assistant(f,f.memberB,['plan:read'],'elsewhere',f.vietnam),{...f.root,number:2})).rejects.toThrow('forbidden');
 await expect(askResults(t.db,f.memberA,{...f.root,number:99})).rejects.toThrow('not_found');
},120000);

it('shows who has not answered to the asker, owners and organizers only, for one ask, until 7 days after it closes',async()=>{
 const f=await fixture();
 const ask=asked(await dates(f)),total=ask.expected;
 for(const who of [f.memberB,f.members[2],f.members[3]])await pick(f,who,1,{choices:[1]});
 // A follower is not someone the ask is waiting for.
 await follower(f,f.members[5]);
 const mine=(await askResults(t.db,f.memberA,{...f.root,number:1})).ask;
 expect([mine.answered,mine.expected,mine.missing!.length]).toEqual([3,total-1,total-4]);
 expect(mine.missing!.map(person=>person.name)).toContain('Member A');expect(mine.missing!.map(person=>person.name)).not.toContain('Member B');
 expect(mine.missing![0]).toMatchObject({isYou:true});
 // The reminder says how many, by when and where, and names nobody.
 expect(askReminder(mine)).toBe(`${total-4} still to answer by ${mine.closes}.\n${mine.shareUrl}`);
 expect(askReminder(mine)).not.toMatch(/Member|@club/);
 expect((await askResults(t.db,f.organizer,{...f.root,number:1})).ask.missing).toHaveLength(total-4);
 // To the asker's assistant the same people appear by handle, or with no name.
 const viaAssistant=(await askResults(t.db,await assistant(f,f.memberA,['plan:read'],'reader'),{...f.root,number:1})).ask;
 expect(viaAssistant.missing).toHaveLength(total-4);expect(JSON.stringify(viaAssistant)).not.toMatch(/Member/);idFree(viaAssistant,f);
 // Every other member, and a follower, sees the count and no list.
 for(const who of [f.memberB,f.members[4],f.members[5]]){
  const other=(await askResults(t.db,who,{...f.root,number:1})).ask;
  expect([other.answered,other.expected]).toEqual([3,total-1]);expect(other).not.toHaveProperty('missing');expect(other.canClose).toBe(false);
 }
 // No read lists non-responders for more than one ask: lists, what is new and the brief carry counts only.
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Second?',kind:'text',closesAt:inDays(1)}));
 for(const who of [f.memberA,f.organizer]){
  const views=[await listAsks(t.db,who,f.root),await whatsNew(t.db,who,f.root),await teamBrief(t.db,who,f.root)];
  expect(JSON.stringify(views)).not.toMatch(/"missing"/);
  expect((views[0] as Awaited<ReturnType<typeof listAsks>>).open.items.map(item=>[item.number,item.answered,item.expected])).toEqual([[2,0,total-1],[1,3,total-1]]);
 }
 // The service has no function that reads across asks: these are all its reads.
 expect(Object.keys(asksModule).filter(name=>typeof (asksModule as Record<string,unknown>)[name]==='function').sort()).toEqual(['answerAsk','askReminder','askResults','askShare','askShareMessage','asksById','asksDue','closeAsk','closeDueAsks','createAsk','listAsks','openAsks','setAskReveal']);
 // Six days after closing the list is still there; eight days after it is gone.
 await elapse(1,'6 days');
 expect((await askResults(t.db,f.memberA,{...f.root,number:1})).ask).toMatchObject({open:false,answered:3});
 expect((await askResults(t.db,f.memberA,{...f.root,number:1})).ask.missing).toHaveLength(total-4);
 await elapse(1,'8 days');
 for(const who of [f.memberA,f.organizer])expect((await askResults(t.db,who,{...f.root,number:1})).ask).not.toHaveProperty('missing');
 expect((await listAsks(t.db,f.memberA,f.root)).closed.items).toEqual([]);
},120000);

it('caps open asks per member and per team, and counts asks and answers in the hourly limit',async()=>{
 const f=await fixture();
 const one=(who:Principal,i:number)=>createAsk(t.db,who,{...f.root,question:`Question ${i}?`,kind:'text',closesAt:inDays(1)});
 for(let i=0;i<ASKS.openPerMember;i++)asked(await one(f.memberA,i));
 expect(await one(f.memberA,99)).toEqual({saved:false,reason:'cap',cap:'own_open_asks'});
 // Closing one makes room.
 await closeAsk(t.db,f.memberA,{...f.root,number:1});
 asked(await one(f.memberA,100));
 for(const [index,who] of [f.memberB,f.members[2],f.members[3]].entries())for(let i=0;i<ASKS.openPerMember;i++)asked(await one(who,index*10+i));
 expect(await one(f.members[4],0)).toEqual({saved:false,reason:'cap',cap:'open_asks'});
 expect((await t.db.query('select count(*)::int as n from emba_ask where closed_at is null')).rows).toEqual([{n:ASKS.openPerTeam}]);
 // Answers count toward the limit of writes per hour, with asks, per person and assistant.
 const agent=await assistant(f,f.members[5]);
 for(let i=0;i<LIMITS.writesPerHour;i++)expect((await pick(f,agent,2,{text:`Answer ${i}`})).saved).toBe(true);
 expect(await pick(f,agent,2,{text:'One more'})).toEqual({saved:false,reason:'cap',cap:'writes_per_hour'});
 expect(await pick(f,f.members[5],2,{text:'From the site'})).toMatchObject({saved:true});
},240000);

it('puts asked and closed in what is new, never an answer, and lists the open asks the caller has yet to answer',async()=>{
 const f=await fixture();
 const start=await whatsNew(t.db,f.memberB,f.root);
 expect(start.unanswered).toEqual({items:[],more:0});
 expect((await teamBrief(t.db,f.memberB,f.root)).asks).toEqual({open:0,unanswered:0});
 asked(await dates(f));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1)}));
 for(const who of f.members.slice(1,6))await pick(f,who,1,{choices:[1]});
 const news=await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor});
 expect(news.changes.map(change=>[change.action,change.ask?.number,change.ask?.question,change.by.handle,change.record,change.event])).toEqual([['asked',1,'Which date works?','@club/ana',undefined,undefined],['asked',2,'Red or white?','@club/ana',undefined,undefined]]);
 // The one still unanswered, with its closing time and options, marked as closing within 48 hours.
 expect(news.unanswered).toMatchObject({items:[{number:2,question:'Red or white?',closingSoon:true,open:true,options:[{number:1,label:'Red'},{number:2,label:'White'}],yourAnswer:null}],more:0});
 expect(news.unanswered.items[0].closes).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
 expect((await whatsNew(t.db,f.memberA,f.root)).unanswered.items.map(item=>[item.number,item.closingSoon])).toEqual([[2,true],[1,false]]);
 expect((await teamBrief(t.db,f.memberB,f.root)).asks).toEqual({open:2,unanswered:1});
 expect((await teamBrief(t.db,f.memberA,f.root)).asks).toEqual({open:2,unanswered:2});
 idFree(news,f);
 // A follower cannot answer, so nothing waits for a follower.
 await follower(f,f.members[6]??f.members[5]);
 expect((await whatsNew(t.db,f.members[6]??f.members[5],f.root)).unanswered.items).toEqual([]);
 // An ask that passed its time shows as closed in what is new, entered by Loop, once.
 await elapse(2,'1 minute');
 const later=await whatsNew(t.db,f.memberB,{...f.root,cursor:news.cursor});
 expect(later.changes.map(change=>[change.action,change.ask?.number,change.ask?.open,change.by,change.assistant])).toEqual([['ask_closed',2,false,{handle:null,isYou:false,former:true},null]]);
 expect(later.unanswered.items).toEqual([]);
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:later.cursor})).changes).toEqual([]);
 expect((await t.db.query('select count(*)::int as n from emba_team_change')).rows).toEqual([{n:3}]);
 // A person outside the team cannot make Loop do even that.
 await elapse(1,'1 minute');
 await expect(whatsNew(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 expect((await t.db.query('select count(*)::int as n from emba_team_change')).rows).toEqual([{n:3}]);
},120000);

it('removes answers to open asks and closes own open asks when a member leaves, keeps closed answers as a former member, and exports them',async()=>{
 const f=await fixture();
 asked(await dates(f,f.memberB));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1)}));
 asked(await createAsk(t.db,f.memberA,{...f.root,question:'Closed one?',kind:'one',options:['Yes','No'],closesAt:inDays(1)}));
 for(const who of [f.memberA,f.members[2],f.members[3]]){await pick(f,who,1,{choices:[1]});await pick(f,who,3,{choices:['Yes']});}
 await closeAsk(t.db,f.memberA,{...f.root,number:3});
 const recent=await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.parse(forever),authenticatedAt:Date.now()-1000}));
 const exported=await exportPersonalData(t.db,recent!);
 expect(exported.asks).toMatchObject([{number:2,question:'Red or white?',options:['Red','White']},{number:3,question:'Closed one?'}]);
 expect(exported.askAnswers).toMatchObject([{number:1,question:'Which date works?',chose:['2099-03-14'],route:'site'},{number:3,chose:['Yes']}]);
 const before=(await askResults(t.db,f.memberB,{...f.root,number:1})).ask;
 expect(before.answered).toBe(3);
 // Leaving mid-ask: the answer no longer counts and one fewer is expected; the leaver's own open ask is closed.
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberA.personId});
 const after=(await askResults(t.db,f.memberB,{...f.root,number:1})).ask;
 expect([after.answered,after.expected,after.results[0].count]).toEqual([2,before.expected-1,2]);
 expect((await askResults(t.db,f.memberB,{...f.root,number:2})).ask).toMatchObject({open:false,by:{handle:null,former:true}});
 // The answer to the closed ask stays, as a former member's.
 const kept=(await askResults(t.db,f.memberB,{...f.root,number:3})).ask;
 expect(kept.results[0]).toMatchObject({label:'Yes',count:3});
 expect(kept.results[0].people!.filter(person=>person.former)).toEqual([{handle:null,isYou:false,former:true}]);
 expect(JSON.stringify(kept)).not.toMatch(/Member A|@club\/ana/);
 expect((await t.db.query("select c.action,c.actor_id=$1 as organizer from emba_team_change c join emba_ask k on k.id=c.ask_id where k.number=2 and c.action='ask_closed'",[f.organizer.personId])).rows).toEqual([{action:'ask_closed',organizer:true}]);
 // Losing the right to post does the same.
 await grantRole(t.db,f.organizer,{...f.root,personId:f.members[2].personId,role:'follower'});
 expect((await askResults(t.db,f.memberB,{...f.root,number:1})).ask.answered).toBe(1);
 // Account deletion: the kept answer and an ask the person asked lose their link to the person.
 asked(await createAsk(t.db,f.members[3],{...f.root,question:'Mine?',kind:'text',closesAt:inDays(1)}));
 await applyDeletionTombstones(t.db,[f.members[3].personId]);
 expect((await t.db.query('select 1 from emba_ask_answer where person_id=$1 union all select 1 from emba_ask where asker_id=$1',[f.members[3].personId])).rows).toEqual([]);
 expect((await askResults(t.db,f.memberB,{...f.root,number:1})).ask.answered).toBe(0);
 expect((await askResults(t.db,f.memberB,{...f.root,number:3})).ask.results[0].count).toBe(3);
 expect((await askResults(t.db,f.memberB,{...f.root,number:4})).ask).toMatchObject({open:false,by:{former:true}});
},120000);

it('shows someone outside the team the question, the group name and the closing time, and nothing about answers',async()=>{
 const f=await fixture();
 const ask=asked(await dates(f)),token=ask.shareUrl.split('/').at(-1)!;
 for(const who of f.members.slice(0,6))await pick(f,who,1,{choices:[1]});
 for(const who of [null,f.nonmember]){
  const page=await askShare(t.db,who,token);
  expect(page).toMatchObject({view:'outside',signedIn:who!==null,join:null,outside:{group:'Synthetic EMBA',question:'Which date works?',closesAt:ask.closesAt,timezone:'America/New_York'}});
  expect(Object.keys(page.outside).sort()).toEqual(['closes','closesAt','group','question','timezone']);
  expect(JSON.stringify(page)).not.toMatch(/Member|@club|2099-03-14|answered|count/);idFree(page,f);
 }
 // A member answers from the page it opens; a follower reads it; an assistant never gets the member view here.
 const member=await askShare(t.db,f.memberB,token);
 expect(member).toMatchObject({view:'member',namespace:'club',scope:f.root,detail:{ask:{number:1,yourAnswer:{choices:[{number:1}]}}},outside:{question:'Which date works?'}});
 expect(answered(await pick(f,f.memberB,1,{choices:[2],route:'share_link'})).yourAnswer).toMatchObject({choices:[{number:2}]});
 expect((await askShare(t.db,await assistant(f,f.memberB),token)).view).toBe('outside');
 await expect(askShare(t.db,null,'0'.repeat(32))).rejects.toThrow('not_found');
 await expect(askShare(t.db,null,'nope')).rejects.toThrow();
 expect((await t.db.query('select 1 from emba_membership where person_id=$1',[f.nonmember.personId])).rows).toEqual([]);
});
