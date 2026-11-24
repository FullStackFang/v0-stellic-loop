// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {connectExt,revokeExt} from '@/lib/campus/ext';
import {findCampus} from '@/lib/campus/listings';
import {addHandListing} from '@/lib/campus/manage';
import {imIn,outingsOn} from '@/lib/campus/outings';
import {GET} from './event/route';
import {POST as IN} from './in/route';
import {POST as LEAVE} from './leave/route';

// Spec: openspec/changes/loopd-browser-extension/specs/browser-extension ("What it sends", "Connecting and
// disconnecting", "Works before the migration").
vi.mock('server-only',()=>({}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();});

const CONNECT=expect.stringMatching(/\/ext\/connect$/);
const EXT='chrome-extension://abcdefghijklmnopabcdefghijklmnop',LUMA='https://lu.ma/fall-founders-mixer';
async function setUp(){
 const cornell=(await findCampus(t.db,'cornell'))!,{id:ana}=await makePerson(t.db,'Ana Lopez'),{id:dev}=await makePerson(t.db,'Dev Patel');
 for(const id of [ana,dev])await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)',[id,cornell.id]);
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of [ana,dev])await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
 const {id:mixer}=await addHandListing(t.db,{campusId:cornell.id,title:'Fall Founders Mixer',startsAt:new Date(Date.now()+5*3600000).toISOString(),endsAt:null});
 await t.db.query("update campus_listing set source_url='https://luma.com/fall-founders-mixer' where id=$1",[mixer]);
 await imIn(t.db,dev,mixer);
 return {ana,dev,mixer,token:await connectExt(t.db,ana)};
}
const headers=(token:string|null,origin:string|null=EXT)=>({...origin?{origin}:{},...token?{authorization:`Bearer ${token}`}:{},'content-type':'application/json'});
const look=async(token:string|null,url=LUMA,origin:string|null=EXT)=>{const res=await GET(new Request(`http://loop.test/api/ext/event?url=${encodeURIComponent(url)}`,{headers:headers(token,origin)}));return {status:res.status,body:await res.json()};};
const press=async(route:typeof IN,token:string|null,url=LUMA,origin:string|null=EXT)=>{const res=await route(new Request('http://loop.test/api/ext/in',{method:'POST',headers:headers(token,origin),body:JSON.stringify({url})}));return {status:res.status,body:await res.json()};};

it('looks up the page for the token\'s person, and answers no people without a token or with a revoked one',async()=>{
 const {ana,token}=await setUp();
 expect(await look(token)).toMatchObject({status:200,body:{state:'known',known:[{first:'Dev'}]}});
 for(const none of [null,'x'.repeat(43)])expect(await look(none)).toEqual({status:200,body:{state:'out',going:1,connect:CONNECT,say:null}});
 await revokeExt(t.db,ana);
 expect((await look(token)).body).toMatchObject({state:'out'});
 expect(JSON.stringify((await look(token)).body)).not.toContain('Dev');
});
it('refuses a request from a web page, and lets the extension\'s own through',async()=>{
 const {token}=await setUp();
 expect((await look(token,LUMA,'https://lu.ma')).status).toBe(403);
 expect((await press(IN,token,LUMA,'https://evil.example')).status).toBe(403);
 expect((await look(token,LUMA,null)).status).toBe(200);
});
it("I'm in and Leave with the token; without one nothing changes",async()=>{
 const {ana,mixer,token}=await setUp();
 const inside=async()=>(await outingsOn(t.db,[mixer])).some(outing=>outing.members.some(member=>member.personId===ana));
 expect(await press(IN,null)).toMatchObject({status:401,body:{state:'out'}});
 expect(await inside()).toBe(false);
 expect(await press(IN,token)).toMatchObject({status:200,body:{state:'in',faces:[{first:'Ana',me:true},{first:'Dev'}]}});
 expect(await inside()).toBe(true);
 expect(await press(LEAVE,token)).toMatchObject({status:200,body:{state:'known'}});
 expect(await inside()).toBe(false);
});
it('answers a page that is not one event with no card',async()=>{
 const {token}=await setUp();
 expect(await look(token,'https://lu.ma/discover')).toEqual({status:200,body:{state:'not_event'}});
});
// Last: it takes the table away.
it('before the migration, answers as not connected with no count',async()=>{
 const {token}=await setUp();
 await t.db.query('drop table campus_ext_token');
 expect(await look(token)).toEqual({status:200,body:{state:'out',going:null,connect:CONNECT,say:null}});
});
