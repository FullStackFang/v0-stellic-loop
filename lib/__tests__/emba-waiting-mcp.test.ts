// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {authConfig,createTokenVerifier} from '@/lib/emba/auth-token';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {createAsk} from '@/lib/emba/team-asks';
import {addEvent} from '@/lib/emba/team-events';
import {LINE,TOTAL} from '@/lib/emba/team-format';
import {CHECK_ONCE,createTeamMcpServer,handleTeamMcpRequest} from '@/lib/emba/team-mcp';
import {saveBrief} from '@/lib/emba/team-read';
import {postAnnouncement} from '@/lib/emba/team-records';

// Specs: openspec/changes/loop-club-reach/specs/waiting and specs/pilot-metrics (the request log).
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 await grantLease(t.db,f.memberB,{...root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:forever});
 const agent=(await authenticate(t.db,'test',async()=>({issuer:f.memberB.issuer,subject:f.memberB.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
 return {...f,root,agent};
}
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,19)+'Z';
const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function rules(text:string) {
 expect(text.length,text).toBeLessThanOrEqual(TOTAL);
 expect(text).not.toMatch(/[{|]|\*\*/);expect(text).not.toMatch(uuid);
 for(const line of text.split('\n')){
  expect(line.startsWith('#'),line).toBe(false);
  if(line.includes('://'))expect(line,'a link stands alone on its line').toMatch(/^https:\/\/\S+$/);
  else expect([...line].length,line).toBeLessThanOrEqual(LINE);
 }
}
async function session(p:Principal) {
 const server=createTeamMcpServer(t.db,p),client=new Client({name:'claude',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(b);await client.connect(a);
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args}),text=(result.content as {text:string}[]).map(item=>item.text).join('\n');
  rules(text);
  return {text,data:(result.structuredContent??{}) as Record<string,unknown>,isError:Boolean(result.isError)};
 };
 return {client,call,close:async()=>{await client.close();await server.close();}};
}

it('tells assistants to check once per conversation, in the server instructions and on the tool, from one wording',async()=>{
 const f=await fixture(),s=await session(f.agent);
 try{
  expect(s.client.getInstructions()).toContain(CHECK_ONCE);
  const tool=(await s.client.listTools()).tools.find(item=>item.name==='waiting')!;
  expect(tool.description).toContain(CHECK_ONCE);
  expect(tool.annotations?.readOnlyHint).toBe(true);
  expect(Object.keys((tool.inputSchema as {properties?:object}).properties??{})).toEqual([]);
  expect(CHECK_ONCE).toMatch(/start of a new conversation.*call waiting once.*carry on with what they asked.*Do not call waiting again/);
  expect(CHECK_ONCE.length).toBeLessThan(320);
 }finally{await s.close();}
},120000);

it('states what is waiting as text and as data, and one short line when nothing is',async()=>{
 const f=await fixture(),s=await session(f.agent);
 try{
  const none=await s.call('waiting');
  expect(none.text).toBe('Nothing waiting from your groups.');
  expect(none.data).toMatchObject({count:0,items:[],more:[]});
  await createAsk(t.db,f.memberA,{...f.root,question:'Red or <b>white</b>?',kind:'one',options:['Red','White'],closesAt:inDays(1)});
  await addEvent(t.db,f.organizer,{...f.root,slug:'spring-mixer',name:'Spring mixer',startsAt:inDays(4),place:'The cellar'});
  const two=await s.call('waiting');
  expect(two.text).toMatch(/^2 things from your groups\.\nAsk #1 in @club \(Synthetic EMBA\), closes .* \(America\/New_York\), which is within 48 hours:\n> Red or <b>white<\/b>\?\nPick one option\. 0 of \d+ answered\.\n> 1\. Red\nOption 1: chosen by 0\.\n> 2\. White\nOption 2: chosen by 0\.\nTo answer, call answer with team @club and number 1\.\nEvent @club\/spring-mixer in @club \(Synthetic EMBA\): .*\. 0 interested\.\n> Spring mixer\n> Place: The cellar\nTo mark the user interested, call interested with team @club\/spring-mixer\. If it is not for them, call it with notForMe set to true\./);
  expect(two.data).toMatchObject({count:2,untrusted:true,items:[{kind:'ask',team:{handle:'@club'},ask:{number:1,options:[{number:1,label:'Red'},{number:2,label:'White'}]}},{kind:'event',event:{slug:'spring-mixer'}}]});
  // Acting through the tools the text names clears each item; saying an event is not for the user is told to nobody.
  expect((await s.call('answer',{team:'@club',number:1,choices:['Red']})).data).toMatchObject({saved:true});
  const declined=await s.call('interested',{team:'@club/spring-mixer',notForMe:true});
  expect(declined.data).toMatchObject({saved:true,interested:false,declined:true,event:{interested:0}});
  expect(declined.text).toContain('this event will not be offered to them again');
  expect((await s.call('interested',{team:'@club/spring-mixer',notForMe:true,interested:true})).isError).toBe(true);
  expect((await s.call('waiting')).text).toBe('Nothing waiting from your groups.');
  // An announcement is told once.
  await postAnnouncement(t.db,f.organizer,{...f.root,text:'Dues are due Friday.'});
  expect((await s.call('waiting')).text).toMatch(/^1 thing from your groups\.\nAnnouncement in @club \(Synthetic EMBA\):\nAnnouncement #2 by .*\n> Dues are due Friday\./);
  expect((await s.call('waiting')).text).toBe('Nothing waiting from your groups.');
 }finally{await s.close();}
},120000);

it('logs each connector request by route and never by content, with a session and the host the assistant stated',async()=>{
 const f=await fixture();
 const environment={LOOP_AUTH_ISSUER:'https://issuer.example',LOOP_AUTH_AUDIENCE:'https://loop.example/api/mcp',LOOP_AUTH_JWKS_URL:'https://issuer.example/jwks',LOOP_AUTH_CLIENT_IDS:'claude'};
 const pair=await generateKeyPair('ES256'),config=authConfig(environment);
 const auth={config,verify:createTokenVerifier(config,createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'test',alg:'ES256'}]}))};
 const token=async(subject:string,person:Principal)=>{
  await t.db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())',[environment.LOOP_AUTH_ISSUER,subject,person.personId]);
  return new SignJWT({iss:environment.LOOP_AUTH_ISSUER,aud:environment.LOOP_AUTH_AUDIENCE,sub:subject,exp:Math.floor(Date.now()/1000)+3600,client_id:'claude',scope:'plan:read group-memory:write'}).setProtectedHeader({alg:'ES256',kid:'test',typ:'at+jwt'}).sign(pair.privateKey);
 };
 const ben=await token('ben-subject',f.memberB);
 await grantLease(t.db,f.members[2],{...f.root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:forever});
 const other=await token('other-subject',f.members[2]);
 const post=(bearer:string,method:string,params:unknown,headers:Record<string,string>={})=>handleTeamMcpRequest(new Request('https://loop.example/api/mcp/team',{method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25',authorization:`Bearer ${bearer}`,...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{database:t.db,auth});
 const connect=(bearer:string,name:string)=>post(bearer,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name,version:'2.4.1'}});
 await createAsk(t.db,f.memberA,{...f.root,question:'Any allergies?',kind:'text',closesAt:inDays(3)});
 await createAsk(t.db,f.memberA,{...f.root,question:'Red or white?',kind:'one',options:['Red','White'],closesAt:inDays(3)});
 // Connecting hands out a session identifier and notes the host's name and version.
 const opened=await connect(ben,'claude-ai');
 expect(opened.status).toBe(200);
 const sessionId=opened.headers.get('mcp-session-id')!;
 expect(sessionId).toMatch(uuid);
 const inSession={'mcp-session-id':sessionId};
 expect((await post(ben,'tools/call',{name:'waiting',arguments:{}},inSession)).status).toBe(200);
 // A written answer, sent by the model; then a tap on the card.
 const secret='Shellfish, and my doctor says no sulphites';
 const written=JSON.parse(await (await post(ben,'tools/call',{name:'answer',arguments:{team:'@club',number:1,text:secret}},inSession)).text());
 expect(written.result.structuredContent).toMatchObject({saved:true});
 const tapped=JSON.parse(await (await post(ben,'tools/call',{name:'answer',arguments:{team:'@club',number:2,choices:['Red'],via:'card'}},inSession)).text());
 expect(tapped.result.structuredContent).toMatchObject({saved:true});
 expect((await post(ben,'tools/list',undefined,inSession)).status).toBe(200);
 const calls=async()=>(await t.db.query<{tool:string;via:string;first:boolean;session:boolean;host:string|null}>(`select c.tool,c.via,c.first_in_session as first,c.session_id is not null as session,s.host_name as host
  from emba_connector_call c left join emba_connector_session s on s.id=c.session_id order by c.id`)).rows;
 expect(await calls()).toEqual([{tool:'waiting',via:'model',first:true,session:true,host:'claude-ai'},{tool:'answer',via:'model',first:false,session:true,host:'claude-ai'},{tool:'answer',via:'card',first:false,session:true,host:'claude-ai'}]);
 // How each answer arrived is stored with it.
 expect((await t.db.query('select a.route,a.client_id from emba_ask_answer a join emba_ask k on k.id=a.ask_id order by k.number')).rows).toEqual([{route:'assistant',client_id:'claude'},{route:'assistant_card',client_id:'claude'}]);
 // Nothing a member wrote is anywhere in the log: not the answer, not the question, not an argument.
 const log=JSON.stringify([(await t.db.query('select * from emba_connector_call')).rows,(await t.db.query('select * from emba_connector_session')).rows]);
 for(const text of [secret,'Shellfish','allergies','Red','@club'])expect(log).not.toContain(text);
 expect((await t.db.query("select column_name from information_schema.columns where table_name='emba_connector_call' order by column_name")).rows.map(row=>(row as {column_name:string}).column_name))
  .toEqual(['at','client_id','first_in_session','id','person_id','session_id','tool','via']);
 // A session that connects and calls nothing is still seen; a later session whose first call is not waiting is told apart.
 await connect(ben,'chatgpt');
 const late=(await connect(ben,'claude-ai')).headers.get('mcp-session-id')!;
 await post(ben,'tools/call',{name:'events',arguments:{team:'@club'}},{'mcp-session-id':late});
 await post(ben,'tools/call',{name:'waiting',arguments:{}},{'mcp-session-id':late});
 expect((await calls()).slice(3)).toEqual([{tool:'events',via:'model',first:true,session:true,host:'claude-ai'},{tool:'waiting',via:'model',first:false,session:true,host:'claude-ai'}]);
 expect((await t.db.query('select host_name,host_version,(select count(*)::int from emba_connector_call c where c.session_id=s.id) as calls from emba_connector_session s order by at')).rows)
  .toEqual([{host_name:'claude-ai',host_version:'2.4.1',calls:3},{host_name:'chatgpt',host_version:'2.4.1',calls:0},{host_name:'claude-ai',host_version:'2.4.1',calls:2}]);
 // A request with no session, with someone else's, or with a made-up one is served the same and logged without a session.
 for(const headers of [{},{'mcp-session-id':'not-a-session'},{'mcp-session-id':'00000000-0000-4000-8000-000000000999'}] as Record<string,string>[])
  expect((await post(ben,'tools/call',{name:'waiting',arguments:{}},headers)).status).toBe(200);
 expect((await post(other,'tools/call',{name:'waiting',arguments:{}},inSession)).status).toBe(200);
 expect((await calls()).slice(5)).toEqual(Array.from({length:4},()=>({tool:'waiting',via:'model',first:false,session:false,host:null})));
 // A tool name that is not a plain name, and a host name that is not plain text, are not stored.
 await post(ben,'tools/call',{name:'Any allergies? <script>',arguments:{}});
 expect(await calls()).toHaveLength(9);
 await connect(ben,'bad\u0000name');
 expect((await t.db.query('select host_name from emba_connector_session order by at desc limit 1')).rows).toEqual([{host_name:null}]);
 // An unsigned request is refused before anything is logged.
 const before=(await t.db.query('select count(*)::int as n from emba_connector_session')).rows;
 expect((await connect('not-a-token','claude-ai')).status).toBe(401);
 expect((await t.db.query('select count(*)::int as n from emba_connector_session')).rows).toEqual(before);
},120000);
