// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
// jsdom ships no types and the project adds none: only what this test uses is described.
// @ts-expect-error no declaration file
import {JSDOM as Untyped} from 'jsdom';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import type {Principal} from '@/lib/emba/access';
import {createCampusMcpServer} from '@/lib/campus/assistant';
import {CAMPUS_CARD_HTML,CAMPUS_CARD_URI,CARD_MIME} from '@/lib/campus/assistant-card';
import {findCampus} from '@/lib/campus/listings';
import {addHandListing} from '@/lib/campus/manage';
import {imIn,outingsOn} from '@/lib/campus/outings';

// Spec: openspec/changes/campus-assistant-tools/specs/campus-assistant-tools ("The card"). As in emba-card.test.ts, the
// page runs in a DOM with this test standing in for the assistant: it answers the handshake, hands over real tool
// results and passes the card's tool calls to the real connector.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T22:00:00Z');
async function student(name:string) {
 const {id}=await makePerson(t.db,name);
 await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)',[id,(await findCampus(t.db,'cornell'))!.id]);
 return id;
}
const event=async(title:string)=>(await addHandListing(t.db,{campusId:(await findCampus(t.db,'cornell'))!.id,title,startsAt:new Date(NOW.getTime()+2*3600000).toISOString(),endsAt:null})).id;
async function connect(personId:string) {
 const p={personId,issuer:'https://issuer.test',subject:`user_${personId}`,clientId:'claude',scopes:[],verifiedEmail:'x@cornell.edu',expiresAt:Date.parse('2099-01-01'),authenticatedAt:null} as unknown as Principal;
 const server=createCampusMcpServer(t.db,p,{now:()=>NOW}),client=new Client({name:'claude',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(b);await client.connect(a);
 return {client,close:async()=>{await client.close();await server.close();}};
}
type CardWindow=Window&typeof globalThis;
const JSDOM=Untyped as new(html:string,options:{runScripts:'dangerously';pretendToBeVisual:boolean;beforeParse(window:CardWindow):void})=>{window:CardWindow};
type Message={jsonrpc:'2.0';id?:number;method?:string;params?:Record<string,unknown>};
function mount(client:Client,theme:'light'|'dark'='dark') {
 const sent:Message[]=[];let read=0;
 const {window}=new JSDOM(CAMPUS_CARD_HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){window.postMessage=((message:Message)=>{sent.push(message);}) as never;}});
 const deliver=(data:unknown)=>{window.dispatchEvent(new window.MessageEvent('message',{data,source:window as never}));};
 const settle=async()=>{
  for(let quiet=0;quiet<2;){
   await new Promise(resolve=>setTimeout(resolve,0));
   if(read===sent.length){quiet++;continue;}
   quiet=0;
   const message=sent[read++];
   if(message.id===undefined)continue;
   if(message.method==='ui/initialize')deliver({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{serverTools:{}},hostContext:{theme}}});
   else if(message.method==='tools/call')deliver({jsonrpc:'2.0',id:message.id,result:await client.callTool(message.params as never)});
  }
 };
 const give=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args});
  deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result});
  await settle();
  return result;
 };
 const page=window.document,text=()=>page.querySelector('.card')!.textContent??'';
 const tap=async(label:string)=>{
  const found=[...page.querySelectorAll('button')].find(item=>item.textContent===label);
  if(!found)throw new Error(`no button ${label}`);
  found.click();await settle();
 };
 return {window,page,sent,settle,give,text,tap,calls:()=>sent.filter(message=>message.method==='tools/call').map(message=>message.params),close:()=>window.close()};
}

it('is one self-contained page that loads nothing, in light and dark, within the team card\'s size',async()=>{
 const s=await connect(await student('Ana'));
 try{
  const read=await s.client.readResource({uri:CAMPUS_CARD_URI});
  expect(read.contents).toEqual([{uri:CAMPUS_CARD_URI,mimeType:CARD_MIME,text:CAMPUS_CARD_HTML,_meta:{ui:{prefersBorder:false}}}]);
 }finally{await s.close();}
 expect(CAMPUS_CARD_URI).toMatch(/^ui:\/\//);
 expect(CAMPUS_CARD_HTML).not.toMatch(/https?:|\/\/[a-z]|\bsrc=|\bhref=|@import|url\(|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|openai|claude/i);
 expect(CAMPUS_CARD_HTML).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
 expect(CAMPUS_CARD_HTML).toContain('<meta name="color-scheme" content="light dark">');
 const style=/<style>([\s\S]*?)<\/style>/.exec(CAMPUS_CARD_HTML)![1];
 expect(style.replace(/light-dark\([^)]*\)/g,'')).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|:\s*(white|black)\b/i);
 expect(style).toMatch(/background:transparent/);
 expect(CAMPUS_CARD_HTML.length).toBeLessThan(32000);
});

it('draws what is on, marks interest through the model\'s own tool, and joins only on the Join press',async()=>{
 const [ana,dev]=[await student('Ana'),await student('Dev')];
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of [ana,dev])await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
 const trivia=await event('Trivia <b>night</b>');await imIn(t.db,dev,trivia,NOW);
 const s=await connect(ana);
 for(const theme of ['light','dark'] as const){
  const card=mount(s.client,theme);
  try{
   await card.settle();
   await card.give('find');
   expect(card.page.documentElement.style.colorScheme).toBe(theme);
   expect(card.text()).toContain('Tonight at Cornell');expect(card.text()).toContain('Trivia <b>night</b>');expect(card.text()).toContain('Dev');
   expect(card.page.querySelector('b')).toBeNull();
  }finally{card.close();}
 }
 const card=mount(s.client);
 try{
  await card.settle();await card.give('find');
  await card.tap('Interested');
  expect(card.calls().at(-1)).toEqual({name:'interested',arguments:{event:trivia,on:true}});
  expect(card.page.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Interested');
  const asked=await card.give('join',{event:trivia}),code=(asked._meta as {tap:string}).tap;
  expect(card.text()).toContain('Join this plan?');expect(card.text()).toContain('With Dev');
  expect(card.text()).not.toContain(code);
  expect((await outingsOn(t.db,[trivia]))[0].members.map(member=>member.personId)).toEqual([dev]);
  await card.tap('Join');
  expect(card.calls().at(-1)).toEqual({name:'join',arguments:{event:trivia,code}});
  expect(card.text()).toContain('You are in');expect(card.text()).toContain('Check in on your phone');
  expect((await outingsOn(t.db,[trivia]))[0].members.map(member=>member.personId).sort()).toEqual([ana,dev].sort());
  // Not now changes nothing on the server.
  const other=await event('Jog');
  await card.give('join',{event:other});
  const before=card.calls().length;
  await card.tap('Not now');
  expect(card.calls().length).toBe(before);expect(card.text()).toContain('Not joined.');
 }finally{card.close();await s.close();}
},120000);
