// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import type {Principal} from '@/lib/emba/access';
import {TEAM_TOOLS} from '@/lib/emba/team-mcp';
import {CAMPUS_TOOLS,createCampusMcpServer} from '@/lib/campus/assistant';
import {CAMPUS_CARD_URI} from '@/lib/campus/assistant-card';
import {saveDeal} from '@/lib/campus/deals';
import {findCampus} from '@/lib/campus/listings';
import {addHandListing} from '@/lib/campus/manage';
import {checkIn,imIn,joinByToken,outingsOn} from '@/lib/campus/outings';

// Spec: openspec/changes/campus-assistant-tools/specs/campus-assistant-tools.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_deal');await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T22:00:00Z');   // 5pm on Tuesday in New York
const hours=(n:number)=>new Date(NOW.getTime()+n*3600000),minutes=(n:number)=>new Date(NOW.getTime()+n*60000);
const campus=(slug='cornell')=>findCampus(t.db,slug).then(found=>found!);
const event=async(title:string,startsAt=hours(2),endsAt:Date|null=null,slug='cornell')=>(await addHandListing(t.db,{campusId:(await campus(slug)).id,title,startsAt:startsAt.toISOString(),endsAt:endsAt?.toISOString()??null})).id;
/** A person with a school email, placed at the campus. */
async function student(name:string,slug='cornell') {
 const {id}=await makePerson(t.db,name);
 await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)',[id,(await campus(slug)).id]);
 return id;
}
const principal=(personId:string,verifiedEmail:string|null='x@cornell.edu')=>({personId,issuer:'https://issuer.test',subject:`user_${personId}`,clientId:'claude',scopes:[],verifiedEmail,expiresAt:Date.parse('2099-01-01'),authenticatedAt:null}) as unknown as Principal;
async function group(...people:string[]) {
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of people)await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
}
/** Everyone in one outing of the event, the first starting it. */
async function going(listing:string,...people:string[]) {
 const {token}=await imIn(t.db,people[0],listing,NOW);
 for(const id of people.slice(1))await joinByToken(t.db,id,token,NOW);
}
type Called={text:string;data:Record<string,unknown>;meta:Record<string,unknown>|undefined;raw:string;isError:boolean};
async function connect(personId:string,email?:string|null,at:()=>Date=()=>NOW) {
 const server=createCampusMcpServer(t.db,principal(personId,email),{now:at}),client=new Client({name:'claude',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(b);await client.connect(a);
 const call=async(name:string,args:Record<string,unknown>={}):Promise<Called>=>{
  const result=await client.callTool({name,arguments:args});
  return {text:(result.content as {text:string}[]).map(item=>item.text).join('\n'),data:(result.structuredContent??{}) as Record<string,unknown>,meta:result._meta as Record<string,unknown>|undefined,
   raw:JSON.stringify({content:result.content,structuredContent:result.structuredContent}),isError:Boolean(result.isError)};
 };
 return {client,call,close:async()=>{await client.close();await server.close();}};
}
const inIt=async(listing:string,id:string)=>(await outingsOn(t.db,[listing])).some(outing=>outing.members.some(member=>member.personId===id));
const tapCode=(called:Called)=>called.meta?.tap as string;

describe('the connection',()=>{
 it('has exactly the five tools, each with the card, and the team connection keeps its 27',async()=>{
  const s=await connect(await student('Ana'));
  try{
   const tools=(await s.client.listTools()).tools;
   expect(tools.map(tool=>tool.name).sort()).toEqual(['close_loop','find','interested','join','whos_in']);
   expect([...CAMPUS_TOOLS].sort()).toEqual(['close_loop','find','interested','join','whos_in']);
   for(const tool of tools)expect(tool._meta,tool.name).toEqual({ui:{resourceUri:CAMPUS_CARD_URI}});
   for(const name of ['find','whos_in'])expect(tools.find(tool=>tool.name===name)!.annotations?.readOnlyHint).toBe(true);
   for(const name of ['join','close_loop'])expect(tools.find(tool=>tool.name===name)!.description).toContain('never completes on its own');
   // No tool checks in, invites, posts or sends.
   expect(tools.map(tool=>tool.name).filter(name=>/check|invite|post|send|message/.test(name))).toEqual([]);
  }finally{await s.close();}
  expect([...TEAM_TOOLS].sort()).toEqual(['add_event','amend_record','answer','arrivals','ask','ask_results','claim','describe_resource','events','file_output','interested','invite_people','link_event','list_tags','log_decision','manage_group','my_travel','propose_idea','read_document','resolve_tag','save_resource','search_knowledge','team_brief','team_state','waiting','whats_new','whats_on']);
 });
 it('needs a school email: anyone else is told so, with the sign-in address, and gets no events',async()=>{
  await event('Blitz night');
  const {id}=await makePerson(t.db,'Gus'),s=await connect(id,'gus@gmail.com');
  try{
   const found=await s.call('find',{when:'week'});
   expect(found.text).toContain('need a school email');expect(found.data).toMatchObject({reason:'school_email_needed'});
   expect(found.raw).not.toContain('Blitz');
  }finally{await s.close();}
 });
 it('answers "not set up yet" with no error before the migration',async()=>{
  const a=await student('Ana');await event('Blitz night');
  await t.db.query('alter table campus_tap rename to campus_tap_waiting');
  const s=await connect(a);
  try{
   for(const name of ['find','whos_in','join']){
    const answer=await s.call(name,name==='find'?{}:{event:crypto.randomUUID()});
    expect(answer.isError,name).toBe(false);expect(answer.text).toBe('Going-out tools are not set up yet.');
   }
  }finally{await s.close();await t.db.query('alter table campus_tap_waiting rename to campus_tap');}
 });
});

describe('find and whos_in',()=>{
 it('lists tonight with counts and only the first names of people the person knows',async()=>{
  const [ana,dev,noor,...strangers]=[await student('Ana Lee'),await student('Dev Rao'),await student('Noor Haddad'),await student('Zed Stranger'),await student('Yara Unknown'),await student('Xiu Nobody'),await student('Wes Other')];
  await group(ana,dev,noor);
  const trivia=await event('Trivia night'),lunch=await event('Lunch run',hours(-4.5),hours(-3.5)),tomorrow=await event('Morning row',hours(15));
  await going(trivia,dev,noor,...strangers);
  const s=await connect(ana);
  try{
   const found=await s.call('find');
   const events=found.data.events as {event:string;title:string;going:number;known:string[];others:number;you:string|null}[];
   expect(events.map(each=>each.title)).toEqual(['Trivia night']);
   expect(events[0]).toMatchObject({event:trivia,going:6,known:['Dev','Noor'],others:4,you:null});
   expect(found.text).toContain('Trivia night');expect(found.text).toContain('6 going: Dev, Noor and 4 others.');
   for(const name of ['Zed','Yara','Xiu','Wes','Rao','Haddad'])expect(found.raw).not.toContain(name);
   for(const id of [dev,noor,...strangers])expect(found.raw).not.toContain(id);
   expect((await s.call('find',{when:'tomorrow'})).data.events).toEqual([expect.objectContaining({event:tomorrow})]);
   expect(((await s.call('find',{when:'week'})).data.events as {event:string}[]).map(each=>each.event)).not.toContain(lunch);
  }finally{await s.close();}
 });
 it('leaves out a deal outside its hours and lists it while it runs',async()=>{
  const ana=await student('Ana','cornell-tech'),tech=await campus('cornell-tech');
  const {rows:[place]}=await t.db.query<{id:string}>("insert into campus_place(campus_id,name,lat,lon,kind) values($1,'Nisi Bistro',40.76168,-73.94994,'food') returning id",[tech.id]);
  const noon=new Date('2026-11-17T17:00:00Z'),half=new Date('2026-11-17T22:30:00Z');
  await saveDeal(t.db,{campusId:tech.id,placeId:place.id,title:'Drinks at Nisi Bistro',line:'$2 off every drink',headCount:2,days:[0,1,2,3,4,5,6],from:'17:00',until:'19:00',note:''},noon);
  const early=await connect(ana,undefined,()=>noon),late=await connect(ana,undefined,()=>half);
  try{
   expect((await early.call('find',{when:'today'})).raw).not.toContain('Nisi');
   expect((await late.call('find',{when:'today'})).raw).toContain('Drinks at Nisi Bistro');
  }finally{await early.close();await late.close();}
 });
 it('whos_in names Dev and Noor, those out with most first, and counts four others; with only strangers it is a count',async()=>{
  const [ana,dev,noor,...strangers]=[await student('Ana'),await student('Dev'),await student('Noor'),await student('Zed'),await student('Yara'),await student('Xiu'),await student('Wes')];
  await group(ana,dev,noor);
  // Ana has been out with Noor before, so Noor comes first.
  const past=await event('Old night',hours(-30),hours(-28));
  const {rows:[outing]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'pastpastpastpastpast') returning id",[past]);
  for(const id of [ana,noor])await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id,checked_in_at) values($1,$2,$3,$4)',[outing.id,past,id,hours(-29).toISOString()]);
  const trivia=await event('Trivia night'),jog=await event('Jog');
  await going(trivia,dev,noor,...strangers);await going(jog,...strangers);
  const s=await connect(ana);
  try{
   const who=await s.call('whos_in',{event:trivia});
   expect(who.data.whosIn).toMatchObject({known:['Noor','Dev'],others:4});
   expect(who.text).toContain('Going: Noor, Dev and 4 others.');
   const only=await s.call('whos_in',{event:jog});
   expect(only.data.whosIn).toMatchObject({known:[],others:4});
   expect(only.text).toContain('4 people are going, nobody you know yet.');
   for(const name of ['Zed','Yara','Xiu','Wes'])expect(who.raw+only.raw).not.toContain(name);
  }finally{await s.close();}
 });
});

describe('interested',()=>{
 it('marks privately, tells two people who know each other, never a stranger, and unmarks',async()=>{
  const [ana,dev,sam]=[await student('Ana'),await student('Dev'),await student('Sam')];
  await group(ana,dev);
  const trivia=await event('Trivia night');
  const a=await connect(ana),d=await connect(dev),z=await connect(sam);
  try{
   const marked=await a.call('interested',{event:trivia});
   expect(marked.data).toMatchObject({saved:true,interested:true});expect(marked.text).toContain('Nobody else sees it.');
   // Dev has not marked it: he is told nothing of Ana's mark.
   expect((await d.call('whos_in',{event:trivia})).raw).not.toContain('Ana');
   await z.call('interested',{event:trivia});
   expect((await a.call('whos_in',{event:trivia})).raw).not.toContain('Sam');
   await d.call('interested',{event:trivia});
   expect((await a.call('whos_in',{event:trivia})).text).toContain('Dev is interested too.');
   expect((await d.call('whos_in',{event:trivia})).text).toContain('Ana is interested too.');
   expect((await z.call('whos_in',{event:trivia})).raw).not.toMatch(/Ana|Dev/);
   expect((await a.call('find')).data.events).toEqual([expect.objectContaining({you:'interested',interestedToo:['Dev']})]);
   const off=await a.call('interested',{event:trivia,on:false});
   expect(off.data).toMatchObject({saved:true,interested:false});
   expect((await d.call('whos_in',{event:trivia})).raw).not.toContain('Ana');
  }finally{await a.close();await d.close();await z.close();}
 });
});

describe('join needs the person\'s tap',()=>{
 it('the assistant asking joins nothing; the answer has the button and the link, and holds no code the button sends',async()=>{
  const [ana,dev]=[await student('Ana'),await student('Dev')];
  await group(ana,dev);
  const trivia=await event('Trivia night');await going(trivia,dev);
  const s=await connect(ana);
  try{
   const asked=await s.call('join',{event:trivia});
   expect(await inIt(trivia,ana)).toBe(false);
   expect(asked.data).toMatchObject({pending:true,action:'join',with:{known:['Dev'],others:0}});
   expect(asked.text).toContain('you would be with Dev');expect(asked.text).toContain('Checking in is done on the phone.');
   expect(asked.text).toMatch(/\/c\/tap\/[A-Za-z0-9_-]{16,}/);
   const code=tapCode(asked);
   expect(code).toMatch(/^[A-Za-z0-9_-]{16,}$/);
   expect(asked.raw).not.toContain(code);
   // The link's code is in the text, and the tool refuses it.
   const linkCode=/\/c\/tap\/([A-Za-z0-9_-]+)/.exec(asked.text)![1];
   expect((await s.call('join',{event:trivia,code:linkCode})).data).toMatchObject({saved:false,reason:'unknown'});
   expect(await inIt(trivia,ana)).toBe(false);
   // The press joins the outing "I'm in" would pick: Dev's.
   const pressed=await s.call('join',{event:trivia,code});
   expect(pressed.data).toMatchObject({saved:true,action:'join',joined:true});
   expect((await outingsOn(t.db,[trivia])).map(outing=>outing.members.map(member=>member.personId).sort())).toEqual([[ana,dev].sort()]);
   expect((await s.call('join',{event:trivia,code})).data).toMatchObject({saved:false,reason:'used'});
  }finally{await s.close();}
 });
 it('is too late after ten minutes, and refused from someone else',async()=>{
  const [ana,ben]=[await student('Ana'),await student('Ben')],trivia=await event('Trivia night');
  let clock=NOW;
  const a=await connect(ana,undefined,()=>clock),b=await connect(ben);
  try{
   const code=tapCode(await a.call('join',{event:trivia}));
   expect((await b.call('join',{event:trivia,code})).data).toMatchObject({saved:false,reason:'not_yours'});
   expect(await inIt(trivia,ben)).toBe(false);
   clock=minutes(11);
   const late=await a.call('join',{event:trivia,code});
   expect(late.data).toMatchObject({saved:false,reason:'expired'});expect(late.text).toContain('Ask again');
   expect(await inIt(trivia,ana)).toBe(false);
  }finally{await a.close();await b.close();}
 });
});

describe('close the loop needs the person\'s tap',()=>{
 it('asks to check in first and offers no button; once checked in, only the press closes it, and find no longer lists it',async()=>{
  const [ana,dev]=[await student('Ana'),await student('Dev')];
  await group(ana,dev);
  const trivia=await event('Trivia night',minutes(-20),hours(2));await going(trivia,ana,dev);
  const s=await connect(ana);
  try{
   const early=await s.call('close_loop',{event:trivia});
   expect(early.data).toMatchObject({pending:false,reason:'not_here'});expect(early.text).toContain('Check in on your phone first');
   expect(early.meta?.tap).toBeUndefined();
   await checkIn(t.db,ana,trivia,NOW);
   const asked=await s.call('close_loop',{event:trivia}),code=tapCode(asked);
   expect(asked.data).toMatchObject({pending:true,action:'close',checkedIn:1,of:2});expect(asked.raw).not.toContain(code);
   const closed=async()=>(await t.db.query<{c:boolean}>('select closed_at is not null as c from campus_outing_member where person_id=$1 and listing_id=$2',[ana,trivia])).rows[0].c;
   expect(await closed()).toBe(false);
   expect(((await s.call('find')).data.events as {event:string}[]).map(each=>each.event)).toContain(trivia);
   const pressed=await s.call('close_loop',{event:trivia,code});
   expect(pressed.data).toMatchObject({saved:true,action:'close',checkedIn:1,of:2});expect(pressed.text).toContain('1 of 2 checked in');
   expect(await closed()).toBe(true);
   expect(((await s.call('find')).data.events as {event:string}[]).map(each=>each.event)).not.toContain(trivia);
   // A join code is not a close code.
   const other=await event('Jog'),joinCode=tapCode(await s.call('join',{event:other}));
   expect((await s.call('close_loop',{event:other,code:joinCode})).data).toMatchObject({saved:false,reason:'unknown'});
  }finally{await s.close();}
 });
});
