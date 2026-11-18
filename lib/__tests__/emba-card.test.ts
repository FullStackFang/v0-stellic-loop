// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
// jsdom ships no types and the project adds none: only what this test uses is described.
// @ts-expect-error no declaration file
import {JSDOM as Untyped} from 'jsdom';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {answerAsk,closeAsk,createAsk} from '@/lib/emba/team-asks';
import {CARD_HTML,CARD_MIME,CARD_URI} from '@/lib/emba/team-card';
import {addEvent} from '@/lib/emba/team-events';
import {waitingHeadline} from '@/lib/emba/team-format';
import {createTeamMcpServer} from '@/lib/emba/team-mcp';
import {saveBrief} from '@/lib/emba/team-read';
import {postAnnouncement} from '@/lib/emba/team-records';

// Spec: openspec/changes/loop-club-reach/specs/waiting (the in-chat card).
// The page runs in a DOM with this test standing in for the assistant: it
// answers the handshake, hands over real tool results, and passes the card's
// tool calls to the real connector.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,19)+'Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 await grantLease(t.db,f.memberB,{...root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:forever});
 const agent=(await authenticate(t.db,'test',async()=>({issuer:f.memberB.issuer,subject:f.memberB.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
 return {...f,root,agent};
}
async function connect(p:Principal) {
 const server=createTeamMcpServer(t.db,p),client=new Client({name:'claude',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(b);await client.connect(a);
 return {client,close:async()=>{await client.close();await server.close();}};
}
type CardWindow=Window&typeof globalThis;
const JSDOM=Untyped as new(html:string,options:{runScripts:'dangerously';pretendToBeVisual:boolean;beforeParse(window:CardWindow):void})=>{window:CardWindow};
type Message={jsonrpc:'2.0';id?:number;method?:string;params?:Record<string,unknown>};
/** The assistant's side of the bridge, for one card. */
function mount(client:Client,theme:'light'|'dark'='dark',bare=false) {
 const sent:Message[]=[];let read=0;
 const dom=new JSDOM(CARD_HTML,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){
  // The page is its own parent here, so what it posts is caught instead of delivered back to it.
  window.postMessage=((message:Message)=>{sent.push(message);}) as never;
 }});
 const {window}=dom,page=window.document;
 const deliver=(data:unknown,source:unknown=window)=>{window.dispatchEvent(new window.MessageEvent('message',{data,source:source as never}));};
 const host={offline:false};
 /** Answers everything the card has asked since the last time, until it asks nothing more. */
 const settle=async()=>{
  for(let quiet=0;quiet<2;){
   await new Promise(resolve=>setTimeout(resolve,0));
   if(read===sent.length){quiet++;continue;}
   quiet=0;
   const message=sent[read++];
   if(message.id===undefined)continue;
   if(message.method==='ui/initialize'&&bare)deliver({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
   else if(message.method==='ui/initialize')deliver({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'test-host',version:'1'},hostCapabilities:{serverTools:{}},
    hostContext:{theme,styles:{variables:{'--color-text-primary':'#eeeeee','not a variable':'red'}},toolInfo:{tool:{name:'waiting'}}}}});
   else if(message.method==='tools/call'){
    if(host.offline)deliver({jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'offline'}});
    else deliver({jsonrpc:'2.0',id:message.id,result:await client.callTool(message.params as never)});
   }
  }
 };
 /** The assistant called a tool and hands the card its result. */
 const give=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args});
  deliver({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:args}});
  deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result});
  await settle();
  return result;
 };
 const text=()=>page.getElementById('loop')!.textContent??'';
 const buttons=()=>[...page.querySelectorAll('button')];
 const tap=async(label:string|RegExp)=>{
  const found=buttons().find(item=>typeof label==='string'?item.textContent===label:label.test(item.textContent??''));
  if(!found)throw new Error(`no button ${label} among ${buttons().map(item=>item.textContent).join(' | ')}`);
  found.click();await settle();
 };
 const calls=()=>sent.filter(message=>message.method==='tools/call').map(message=>message.params);
 return {window,page,sent,deliver,settle,give,text,buttons,tap,calls,host,close:()=>window.close()};
}
const answers=async()=>(await t.db.query<{route:string}>('select route from emba_ask_answer')).rows;

it('declares one card on the five tools, with standard keys only, and serves it as one self-contained page',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 try{
  const tools=(await s.client.listTools()).tools,withCard=tools.filter(tool=>tool._meta!==undefined).map(tool=>tool.name).sort();
  expect(withCard).toEqual(['ask','ask_results','events','save_resource','waiting']);
  for(const tool of tools.filter(item=>withCard.includes(item.name)))expect(tool._meta).toEqual({ui:{resourceUri:CARD_URI}});
  // The two tools a button calls are the model's own: no card-only copy, and nothing that hides them from either side.
  expect(tools.filter(tool=>/card/i.test(tool.name))).toEqual([]);
  for(const name of ['answer','interested'])expect(tools.find(tool=>tool.name===name)!._meta).toBeUndefined();
  expect(CARD_URI).toMatch(/^ui:\/\//);
  const read=await s.client.readResource({uri:CARD_URI});
  expect(read.contents).toEqual([{uri:CARD_URI,mimeType:CARD_MIME,text:CARD_HTML,_meta:{ui:{prefersBorder:false}}}]);
  expect(CARD_MIME).toBe('text/html;profile=mcp-app');
  // Nothing is loaded from anywhere, and nothing only one assistant provides is used.
  expect(CARD_HTML).not.toMatch(/https?:|\/\/[a-z]|\bsrc=|\bhref=|@import|url\(|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|openai|claude/i);
  // Data never becomes markup.
  expect(CARD_HTML).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  // Every colour is Loop's own, with a pair wherever light and dark differ; the page behind the panel is the host's.
  expect(CARD_HTML).toContain('<meta name="color-scheme" content="light dark">');
  const style=/<style>([\s\S]*?)<\/style>/.exec(CARD_HTML)![1];
  expect(style.replace(/light-dark\([^)]*\)/g,'')).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|:\s*(white|black)\b/i);
  expect(style).toMatch(/background:transparent/);
  expect(CARD_HTML.length).toBeLessThan(32000);
 }finally{await s.close();}
},120000);

it('shows what is waiting, records a tap through the same tool the model calls, and updates in place',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 await createAsk(t.db,f.memberA,{...f.root,question:'Red or <b>white</b>? <img src=x onerror=alert(1)>',kind:'one',options:['Red','<i>White</i>'],closesAt:inDays(1)});
 await addEvent(t.db,f.organizer,{...f.root,slug:'spring-mixer',name:'Spring <script>mixer</script>',startsAt:inDays(4),place:'The cellar'});
 const card=mount(s.client);
 try{
  // The handshake comes first, and there is something to see before any result.
  expect(card.sent[0]).toMatchObject({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{appInfo:{name:'loop-card'},appCapabilities:{},protocolVersion:'2026-01-26'}});
  expect(card.text()).toBe('Loading from Loop');
  await card.settle();
  expect(card.sent[1]).toMatchObject({method:'ui/notifications/initialized'});
  // The host's theme and its style values are followed; a name that is not a style variable is not.
  expect(card.page.documentElement.style.colorScheme).toBe('dark');
  expect(card.page.documentElement.style.getPropertyValue('--color-text-primary')).toBe('#eeeeee');
  expect(card.page.documentElement.getAttribute('style')).not.toContain('red');
  // A message from anywhere but the host is ignored.
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[{type:'text',text:'x'}],structuredContent:{count:0,items:[]}}},null);
  expect(card.text()).toBe('Loading from Loop');

  const result=await card.give('waiting');
  // How many are waiting is said once, in the header.
  expect(card.page.getElementById('chip')!.textContent).toBe('2 waiting');
  // Member text is shown as the characters it is.
  expect(card.text()).toContain('Red or <b>white</b>? <img src=x onerror=alert(1)>');
  expect(card.text()).toContain('Spring <script>mixer</script>');
  expect(card.page.querySelectorAll('b,i,img,main script').length).toBe(0);
  expect(card.buttons().map(item=>item.textContent)).toEqual(['Red (0)','<i>White</i> (0)',"I'm in",'Not for me']);
  // The card shows nothing the text form does not state: each item's own words are in the text too.
  const stated=(result.content as {text:string}[])[0].text;
  for(const words of ['Red or <b>white</b>?','1. Red','2. <i>White</i>','answered.','Spring <script>mixer</script>','The cellar','@club/spring-mixer','0 interested'])expect(stated).toContain(words);

  // Tapping "I'm in": recorded, the control shows the new state, and the count rises, with no new message.
  await card.tap("I'm in");
  expect(card.calls()).toEqual([{name:'interested',arguments:{interested:true,team:'@club/spring-mixer',via:'card'}}]);
  expect(card.text()).toContain('1 interested, including you.');
  expect(card.buttons().map(item=>[item.textContent,item.getAttribute('aria-pressed')])).toEqual([['Red (0)','false'],['<i>White</i> (0)','false'],['Take it back',null]]);
  expect((await t.db.query('select route,client_id from emba_event_interest')).rows).toEqual([{route:'assistant_card',client_id:'claude'}]);
  // The model saying the same in text finds the same state.
  expect((await s.client.callTool({name:'interested',arguments:{team:'@club/spring-mixer'}})).structuredContent).toMatchObject({saved:true,interested:true,changed:false,event:{interested:1,youAreInterested:true}});

  // An answer by tap.
  await card.tap('<i>White</i> (0)');
  expect(card.calls()[1]).toEqual({name:'answer',arguments:{team:'@club',number:1,choices:[2],via:'card'}});
  // The filled option is the answer: no line repeats it.
  expect(card.text()).toContain('✓ Saved');
  expect(card.text()).not.toContain('You answered');
  expect(card.text()).toMatch(/1 of \d+ answered/);
  expect(card.buttons().slice(0,2).map(item=>[item.textContent,item.getAttribute('aria-pressed')])).toEqual([['Red (0)','false'],['<i>White</i> (1)','true']]);
  expect(await answers()).toEqual([{route:'assistant_card'}]);
  // Taking it back is its own button. A teardown request is answered.
  await card.tap('Take it back');
  expect(card.text()).toContain('0 interested.');
  expect((await t.db.query('select 1 from emba_event_interest')).rows).toEqual([]);
  card.deliver({jsonrpc:'2.0',id:77,method:'ui/resource-teardown',params:{}});
  expect(card.sent.at(-1)).toEqual({jsonrpc:'2.0',id:77,result:{}});
 }finally{card.close();await s.close();}
},120000);

it('saves nothing from a stale card when the ask has closed, and says so',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1)});
 const card=mount(s.client,'light');
 try{
  await card.settle();await card.give('waiting');
  expect(card.page.documentElement.style.colorScheme).toBe('light');
  expect(card.buttons().map(item=>item.textContent)).toEqual(['Red (0)','White (0)']);
  // The ask closes after the card was drawn.
  expect(await closeAsk(t.db,f.memberA,{...f.root,number:1})).toMatchObject({saved:true,changed:true});
  await card.tap('Red (0)');
  expect(await answers()).toEqual([]);
  expect(card.text()).toContain('This ask has closed.');
  expect(card.text()).toContain('Nothing was saved.');
  expect(card.buttons()).toEqual([]);
 }finally{card.close();await s.close();}
},120000);

it('says it could not reach Loop and changes nothing, then works on the next tap',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 await createAsk(t.db,f.memberA,{...f.root,question:'Which days?',kind:'many',options:['Mon','Tue','Wed'],closesAt:inDays(2)});
 const card=mount(s.client);
 try{
  await card.settle();await card.give('ask_results',{team:'@club',number:1});
  // Pick-any: the options are switches, and a check and a cross join their row only once something differs from what is saved.
  expect(card.buttons().map(item=>[item.textContent,item.disabled])).toEqual([['Mon (0)',false],['Tue (0)',false],['Wed (0)',false]]);
  await card.tap('Wed (0)');await card.tap('Mon (0)');
  expect(card.calls()).toEqual([]);
  card.host.offline=true;
  await card.tap('✓');
  expect(card.text()).toContain("Couldn't reach Loop. Try again");
  expect(await answers()).toEqual([]);
  // The choice is still there to send again.
  expect(card.buttons().map(item=>[item.textContent,item.getAttribute('aria-pressed'),item.disabled])).toEqual([['Mon (1)','true',false],['Tue (0)','false',false],['Wed (1)','true',false],['✓',null,false],['✕',null,false]]);
  card.host.offline=false;
  await card.tap('✓');
  expect(card.calls().at(-1)).toEqual({name:'answer',arguments:{team:'@club',number:1,choices:[1,3],via:'card'}});
  expect(card.text()).not.toContain("Couldn't reach Loop");
  expect(card.buttons().map(item=>[item.textContent,item.getAttribute('aria-pressed')])).toEqual([['Mon (1)','true'],['Tue (0)','false'],['Wed (1)','true']]);
  expect(await answers()).toEqual([{route:'assistant_card'}]);

  // A result that is an error offers the read again, and the read can then succeed.
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{}}});
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{isError:true,content:[{type:'text',text:'Loop could not complete this right now.'}],structuredContent:{error:'unavailable'}}});
  expect(card.text()).toBe("Couldn't reach Loop. Try againTry again");
  await card.tap('Try again');
  expect(card.calls().at(-1)).toEqual({name:'waiting',arguments:{}});
  expect(card.text()).toBe(waitingHeadline(0));
 }finally{card.close();await s.close();}
},120000);

it('draws the events, ask and results tools, a written-answer ask without a text box, and an empty state for each list',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 const card=mount(s.client);
 try{
  await card.settle();
  await card.give('waiting');expect(card.text()).toBe('Nothing waiting from your groups.');
  await card.give('events',{team:'@club'});expect(card.text()).toBe('No upcoming events.');
  await card.give('ask_results',{team:'@club'});expect(card.text()).toBe('No open asks.');
  await addEvent(t.db,f.organizer,{...f.root,slug:'tasting',name:'Tasting',startsAt:inDays(2)});
  await card.give('events',{team:'@club'});
  expect(card.text()).toMatch(/^Upcoming in @clubEvent @club\/tasting: .*Tasting0 interested\./);
  await card.tap('Not for me');
  expect(card.text()).toContain('Noted. It will not be offered to you again.');
  expect(card.buttons().map(item=>item.textContent)).toEqual(["I'm in"]);
  await card.give('events',{team:'@club/tasting'});
  expect(card.buttons().map(item=>item.textContent)).toEqual(["I'm in",'Not for me']);
  // The user's own new ask, through the model: the card shows it, and the same card can answer it.
  await card.give('ask',{team:'@club',question:'Any allergies?',kind:'text',closesAt:inDays(3)});
  expect(card.text()).toContain('Any allergies?');
  expect(card.text()).toContain('It takes a written answer: tell your assistant what to say.');
  expect(card.page.querySelectorAll('input,textarea,select,a,form').length).toBe(0);
  await card.give('ask',{team:'@club',question:'Red or white?',options:['Red','White'],closesAt:inDays(3)});
  await card.tap(/^Red/);
  expect(card.buttons().find(item=>/^Red/.test(item.textContent??''))!.getAttribute('aria-pressed')).toBe('true');
  await card.give('ask_results',{team:'@club'});
  expect(card.text()).toMatch(/^Open asks in @club/);
  expect(card.text()).toContain('Any allergies?');
  // A result the card has no drawing for is shown as its own first line of text, never as nothing.
  await card.give('ask',{team:'@club',question:'Too late?',options:['A','B'],closesAt:'2020-01-01T10:00'});
  expect(card.text()).toBe('Not saved. The closing time must be in the future.');
  await card.give('ask_results',{team:'@club',number:99});
  expect(card.text()).toBe('Nothing in this team matches that reference.');
 }finally{card.close();await s.close();}
},120000);

it('draws a dates ask as day tiles with counts, adds a day from its calendar, and lets an added day go when nobody chooses it',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 const dayIn=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10),[first,second,extra]=[dayIn(3),dayIn(4),dayIn(6)];
 await createAsk(t.db,f.memberA,{...f.root,question:'Which day?',kind:'dates',options:[first,second],closesAt:inDays(2)});
 await answerAsk(t.db,f.memberA,{...f.root,number:1,choices:[first]});
 const card=mount(s.client);
 const tiles=()=>[...card.page.querySelectorAll('button.day')].map(item=>[/, (\d+) picked$/.exec(item.getAttribute('aria-label')!)?.[1]??'0',item.getAttribute('aria-pressed')]);
 const tile=async(index:number)=>{(card.page.querySelectorAll('button.day')[index] as HTMLButtonElement).click();await card.settle();};
 const options=async()=>(await t.db.query<{label:string;added:boolean}>('select label,added_by is not null as added from emba_ask_option order by label')).rows;
 try{
  await card.settle();await card.give('waiting');
  // What the group has picked so far shows before the user answers; nothing is filled, because none of it is theirs.
  expect(tiles()).toEqual([['1','false'],['0','false']]);
  expect(card.buttons().map(item=>item.textContent)).toEqual([expect.any(String),expect.any(String),'+']);
  // The calendar opens under the days and stays open; a day picked there joins the line, and nothing is sent yet.
  await card.tap('+');
  if(extra.slice(0,7)!==first.slice(0,7))await card.tap('›');
  (card.page.querySelectorAll('button.cell')[Number(extra.slice(8))-1] as HTMLButtonElement).click();await card.settle();
  expect(card.page.querySelector('.cal')).not.toBeNull();
  expect(tiles()).toEqual([['1','false'],['0','false'],['1','true']]);
  expect(card.calls()).toEqual([]);
  expect(card.page.querySelectorAll('input,textarea,select,a,form').length).toBe(0);
  await card.tap('✓');
  expect(card.calls()[0]).toEqual({name:'answer',arguments:{team:'@club',number:1,addDays:[extra],via:'card'}});
  expect(await options()).toEqual([{label:first,added:false},{label:second,added:false},{label:extra,added:true}]);
  expect(tiles()).toEqual([['1','false'],['0','false'],['1','true']]);
  expect(card.page.querySelector('.cal')).toBeNull();
  // Someone else picks the added day: the user dropping it takes their own pick away and leaves the day.
  await answerAsk(t.db,f.memberA,{...f.root,number:1,choices:[first,extra]});
  await tile(2);await tile(1);await card.tap('✓');
  expect(card.calls()[1]).toEqual({name:'answer',arguments:{team:'@club',number:1,choices:[2],via:'card'}});
  expect(tiles()).toEqual([['1','false'],['1','true'],['1','false']]);
  expect((await options()).length).toBe(3);
  // Once nobody picks it, it is gone.
  await answerAsk(t.db,f.memberA,{...f.root,number:1,choices:[first]});
  expect(await options()).toEqual([{label:first,added:false},{label:second,added:false}]);
  // A day that has passed is refused, and so is a day on an ask that is not about days.
  expect(await answerAsk(t.db,f.memberB,{...f.root,number:1,addDays:['2020-01-01']})).toMatchObject({saved:false,reason:'add_days',problem:'past'});
  await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(2)});
  expect(await answerAsk(t.db,f.memberB,{...f.root,number:2,choices:[1],addDays:[extra]})).toMatchObject({saved:false,reason:'add_days',problem:'not_dates'});
 }finally{card.close();await s.close();}
},120000);

it('keeps an announcement that did not fit the text for the next call, and tells it once when it fits',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 try{
  const long=(n:number)=>Array.from({length:10},(_,index)=>`Ask ${n} option ${index+1} ${'x'.repeat(60)}`);
  for(let n=1;n<=5;n++)await createAsk(t.db,f.memberA,{...f.root,question:`Question ${n}?`,kind:'one',options:long(n),closesAt:inDays(n)});
  await postAnnouncement(t.db,f.organizer,{...f.root,text:'Dues are due Friday.'});
  const read=async()=>{const result=await s.client.callTool({name:'waiting',arguments:{}});return {text:(result.content as {text:string}[])[0].text,kinds:((result.structuredContent as {items:{kind:string}[]}).items).map(item=>item.kind)};};
  // The asks fill the text: the announcement is in the structured form, not in the text, and is not used up.
  for(let turn=0;turn<2;turn++){
   const full=await read();
   expect(full.kinds).toEqual(['ask','ask','ask','ask','ask','announcement']);
   expect(full.text).not.toContain('Dues are due Friday.');
   expect(full.text).toMatch(/\d more not shown\./);
  }
  for(let n=1;n<=5;n++)await closeAsk(t.db,f.memberA,{...f.root,number:n});
  expect((await read()).text).toContain('Dues are due Friday.');
  expect((await read()).text).toBe('Nothing waiting from your groups.');
 }finally{await s.close();}
},120000);

it('still shows what is waiting in an assistant that sends no theme, no styles and passes on no tool calls',async()=>{
 const f=await fixture(),s=await connect(f.agent);
 await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(1)});
 const card=mount(s.client,'dark',true);
 try{
  await card.settle();
  expect(card.sent[1]).toMatchObject({method:'ui/notifications/initialized'});
  await card.give('waiting');
  expect(card.text()).toContain('Red or white?');
  expect(card.text()).toContain('To answer, tell your assistant.');
  expect(card.buttons().map(item=>[item.textContent,item.disabled])).toEqual([['Red (0)',true],['White (0)',true]]);
  // A result that carries its text alone is shown by its first line; one that carries nothing asks for another try.
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[{type:'text',text:'1 thing from your groups.\nAsk #1'}]}});
  expect(card.text()).toBe('1 thing from your groups.');
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[]}});
  expect(card.text()).toBe("Couldn't reach Loop. Try again");
  // Messages a host may send at any time: a theme change is followed, a cancelled call is said, a ping is answered, anything else is refused.
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:'light'}});
  expect(card.page.documentElement.style.colorScheme).toBe('light');
  card.deliver({jsonrpc:'2.0',method:'ui/notifications/tool-cancelled',params:{reason:'user'}});
  expect(card.text()).toBe('Cancelled.');
  card.deliver({jsonrpc:'2.0',id:5,method:'ping'});
  expect(card.sent.at(-1)).toEqual({jsonrpc:'2.0',id:5,result:{}});
  card.deliver({jsonrpc:'2.0',id:6,method:'ui/unknown'});
  expect(card.sent.at(-1)).toMatchObject({id:6,error:{code:-32601}});
  expect(card.calls()).toEqual([]);
 }finally{card.close();await s.close();}
},120000);
