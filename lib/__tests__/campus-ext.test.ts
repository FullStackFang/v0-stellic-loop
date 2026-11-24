// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {connectExt,extConnected,extReady,inFromPage,leaveFromPage,lookUp,normalPage,personOfToken,revokeExt,sourceUrlOf} from '@/lib/campus/ext';
import {parseFeed,readFeeds} from '@/lib/campus/import';
import {findCampus} from '@/lib/campus/listings';
import {addFeed,addHandListing} from '@/lib/campus/manage';
import {checkIn,imIn,outingsOn} from '@/lib/campus/outings';
import {postPlan} from '@/lib/campus/plans';
import type {PageRead} from '@/lib/emba/event-link';

// Spec: openspec/changes/loopd-browser-extension/specs/browser-extension and specs/campus-listings
// ("A feed event keeps the address of its page").
vi.mock('server-only',()=>({}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T17:00:00Z');
const BASE='https://loop.test',options={base:BASE,photos:async()=>({})};
const campus=async(slug='cornell')=>(await findCampus(t.db,slug))!;
/** A person placed at a campus, as signing in to Loopd places them. */
async function person(name:string,slug='cornell'){
 const {id}=await makePerson(t.db,name);
 await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)',[id,(await campus(slug)).id]);
 return id;
}
async function group(...people:string[]){
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of people)await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
}
const LUMA='https://lu.ma/fall-founders-mixer';
/** A hand-entered event that came from this page (as a feed event would). */
async function event(source=`https://luma.com/fall-founders-mixer`,slug='cornell'){
 const {id}=await addHandListing(t.db,{campusId:(await campus(slug)).id,title:'Fall Founders Mixer',startsAt:new Date(NOW.getTime()+5*3600000).toISOString(),endsAt:null});
 await t.db.query('update campus_listing set source_url=$2 where id=$1',[id,source]);
 return id;
}
const page=(over:Partial<Extract<PageRead,{ok:true}>['facts']>={}):PageRead=>({ok:true,facts:{name:'Rooftop Closing Party',startsAt:'2026-11-19T23:00:00.000Z',endsAt:null,place:'40 E 1st St',host:'Posh host',...over}});
const reads=(answer:PageRead)=>vi.fn(async()=>answer);
/** Everything a card answer says, as one string, to look for names that must not be there. */
const said=(answer:unknown)=>JSON.stringify(answer);

it('the migration is there in the test database',async()=>{expect(await extReady(t.db)).toBe(true);});

describe('the page address',()=>{
 it('lower-cases the host and drops www., the query, the fragment and a trailing slash',()=>{
  expect(normalPage('https://LU.MA/fall-founders-mixer/?utm_source=ig#top')?.key).toBe('https://luma.com/fall-founders-mixer');
  expect(normalPage('https://www.Eventbrite.com/e/nyc-climate-tech-night-tickets-123?aff=x')?.key).toBe('https://eventbrite.com/e/nyc-climate-tech-night-tickets-123');
  expect(normalPage('https://posh.vip/e/rooftop-closing-party/')?.key).toBe('https://posh.vip/e/rooftop-closing-party');
  // Every stored form of the same page.
  expect(normalPage(LUMA)?.forms).toEqual(['https://luma.com/fall-founders-mixer','https://lu.ma/fall-founders-mixer']);
  expect(normalPage('https://eventbrite.com/e/x')?.forms).toContain('https://www.eventbrite.com/e/x');
 });
 it('keeps a different path a different event',()=>{
  expect(normalPage('https://lu.ma/other-event')?.key).not.toBe(normalPage(LUMA)?.key);
 });
 it('refuses an address that is not https, a host not on the list, and pages that are not one event',()=>{
  for(const raw of ['http://lu.ma/fall-founders-mixer','https://example.com/e/x','https://lu.ma.evil.com/x','https://lu.ma/','https://luma.com/discover','https://lu.ma/a/b','https://posh.vip/rooftop','https://www.eventbrite.com/d/ny--new-york/events/','not a link',42])
   expect(normalPage(raw)).toBeNull();
 });
 it('reads a CampusGroups event by its number, from every address the same event goes by',()=>{
  const key='https://cornelltech.campusgroups.com/rsvp?id=2132977';
  for(const raw of [key,'https://cornelltech.campusgroups.com/ctdei/rsvp?id=2132977','https://cornelltech.campusgroups.com/CTDEI/rsvp_boot?id=2132977&ref=x','https://cornelltech.campusgroups.com/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3Nw==','https://cornelltech.campusgroups.com/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3Nw%3D%3D'])
   expect(normalPage(raw)?.key).toBe(key);
  expect(normalPage('https://cornelltech.campusgroups.com/rsvp?id=2132988')?.key).not.toBe(key);
  // Another school's number is not this school's event, and the club's home page is no event.
  expect(normalPage('https://cornell.campusgroups.com/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3Nw==')).toBeNull();
  expect(normalPage('https://cornelltech.campusgroups.com/ctdei/home/')).toBeNull();
 });
});

describe('the token',()=>{
 it('is given once, kept only as a hash, names its person, and is refused once disconnected',async()=>{
  const a=await person('Ana Lopez'),token=await connectExt(t.db,a);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(said((await t.db.query('select * from campus_ext_token')).rows)).not.toContain(token);
  expect(await personOfToken(t.db,token,NOW)).toBe(a);
  expect(await extConnected(t.db,a)).toBe(true);
  expect((await t.db.query('select last_used_at from campus_ext_token')).rows[0]).toEqual({last_used_at:NOW.toISOString()});
  await revokeExt(t.db,a,NOW);
  expect(await personOfToken(t.db,token,NOW)).toBeNull();
  expect(await extConnected(t.db,a)).toBe(false);
  for(const other of ['',null,'x'.repeat(43),`${token}x`])expect(await personOfToken(t.db,other,NOW)).toBeNull();
 });
});

describe('what the card shows',()=>{
 it('names and shows the people they know who are in, those they have been out with most first, and counts the rest',async()=>{
  const [ana,dev,noor,bea]=[await person('Ana Lopez'),await person('Dev Patel'),await person('Noor Ali'),await person('Bea Kim')];
  const strangers=await Promise.all(['Sam Stone','Kit Vale','Lee Moss'].map(name=>person(name)));
  await group(ana,dev,noor,bea);
  // Ana and Bea went out together once before, so Bea comes first.
  const before=await event('https://luma.com/before');
  await imIn(t.db,ana,before,NOW);await imIn(t.db,bea,before,NOW);
  for(const id of [ana,bea])await checkIn(t.db,id,before,new Date(NOW.getTime()+5*3600000));
  const mixer=await event();
  for(const id of [dev,noor,bea,...strangers])await imIn(t.db,id,mixer,NOW);
  const card=await lookUp(t.db,ana,`${LUMA}?utm_source=ig`,NOW,options);
  expect(card).toMatchObject({state:'known',campus:'Cornell',others:3});
  if(card.state!=='known')throw new Error(card.state);
  expect(card.known.map(face=>face.first)).toEqual(['Bea','Dev','Noor']);
  expect(card.known.every(face=>face.photo.startsWith(`${BASE}/animals/`))).toBe(true);
  expect(card.invite).toMatch(new RegExp(`^${BASE}/o/`));
  for(const name of ['Sam','Kit','Lee'])expect(said(card)).not.toContain(name);
 });
 it('says nobody they know is in, with no names or faces, when only strangers are',async()=>{
  const ana=await person('Ana Lopez'),sam=await person('Sam Stone'),mixer=await event();
  await imIn(t.db,sam,mixer,NOW);
  const card=await lookUp(t.db,ana,LUMA,NOW,options);
  expect(card).toEqual({state:'none',campus:'Cornell',kit:expect.any(Object),seen:true,others:1});
  expect(said(card)).not.toContain('Sam');
 });
 it('is new to Loopd when no event on their campus has that page',async()=>{
  const ana=await person('Ana Lopez');await event('https://luma.com/fall-founders-mixer','cornell-tech');
  expect(await lookUp(t.db,ana,LUMA,NOW,options)).toMatchObject({state:'none',seen:false,others:0});
 });
 it('shows nothing for a page that is not one event',async()=>{
  expect(await lookUp(t.db,await person('Ana Lopez'),'https://luma.com/discover',NOW,options)).toEqual({state:'not_event'});
 });
 it('not connected: no names or faces, a count for a public event, and none for a posted plan',async()=>{
  const [ana,dev]=[await person('Ana Lopez'),await person('Dev Patel')],mixer=await event();
  for(const id of [ana,dev])await imIn(t.db,id,mixer,NOW);
  const card=await lookUp(t.db,null,LUMA,NOW,options);
  expect(card).toEqual({state:'out',going:2,connect:`${BASE}/ext/connect`,say:null});
  const plan=await postPlan(t.db,ana,await campus(),{title:'Rooftop',starts:'2026-11-19T18:00',link:'https://posh.vip/e/rooftop-closing-party'},NOW);
  await imIn(t.db,dev,plan.id,NOW);
  expect(await lookUp(t.db,null,'https://posh.vip/e/rooftop-closing-party',NOW,options)).toEqual({state:'out',going:null,connect:`${BASE}/ext/connect`,say:null});
 });
 it('a connected person with no campus sees no people, and what Loopd says to someone with no school',async()=>{
  const {id}=await makePerson(t.db,'Nell Dorn');await event();
  expect(await lookUp(t.db,id,LUMA,NOW,options)).toMatchObject({state:'out',say:expect.stringContaining('school email')});
 });
});

describe("I'm in and Leave from the card",()=>{
 it('joins the group of people they know, then shows their face first with the group, the share link and Leave',async()=>{
  const [ana,dev]=[await person('Ana Lopez'),await person('Dev Patel')],sam=await person('Sam Stone');
  await group(ana,dev);
  const mixer=await event();await imIn(t.db,dev,mixer,NOW);await imIn(t.db,sam,mixer,NOW);
  const card=await inFromPage(t.db,ana,LUMA,NOW,options);
  expect(card).toMatchObject({state:'in',others:0,leave:true});
  if(card.state!=='in')throw new Error(card.state);
  expect(card.faces.map(face=>[face.first,!!face.me])).toEqual([['Ana',true],['Dev',false]]);
  const [devs]=(await outingsOn(t.db,[mixer])).filter(outing=>outing.members.some(member=>member.personId===dev));
  expect(devs.members.map(member=>member.personId)).toContain(ana);
  expect(card.share).toBe(`${BASE}/o/${devs.token}`);
  expect(said(card)).not.toMatch(/Sam|register|ticket/i);
  // Leaving puts the card back as it was.
  expect(await leaveFromPage(t.db,ana,LUMA,NOW,options)).toMatchObject({state:'known',known:[{first:'Dev'}]});
 });
 it('adds an event Loopd has not seen as a plan with that link, read from the page, and puts them in it',async()=>{
  const ana=await person('Ana Lopez'),read=reads(page());
  const card=await inFromPage(t.db,ana,'https://posh.vip/e/rooftop-closing-party?ref=ig',NOW,{...options,read});
  expect(read).toHaveBeenCalledWith('https://posh.vip/e/rooftop-closing-party');
  expect(card).toMatchObject({state:'in',faces:[{first:'Ana',me:true}]});
  const {rows}=await t.db.query("select title,link,origin,starts_at,posted_by from campus_listing where origin='member'");
  expect(rows).toEqual([{title:'Rooftop Closing Party',link:'https://posh.vip/e/rooftop-closing-party',origin:'member',starts_at:'2026-11-19T23:00:00.000Z',posted_by:ana}]);
 });
 it('two people pressing at once on a new event make one plan, with both in it',async()=>{
  const [ana,ben]=[await person('Ana Lopez'),await person('Ben Ito')],read=reads(page());
  await Promise.all([ana,ben].map(id=>inFromPage(t.db,id,'https://posh.vip/e/rooftop-closing-party',NOW,{...options,read})));
  const {rows}=await t.db.query<{id:string}>("select id from campus_listing where origin='member'");
  expect(rows).toHaveLength(1);
  expect((await outingsOn(t.db,[rows[0].id])).flatMap(outing=>outing.members.map(member=>member.personId)).sort()).toEqual([ana,ben].sort());
 });
 it('refuses in the app\'s words when they have the most plans, and adds nothing',async()=>{
  const ana=await person('Ana Lopez'),here=await campus();
  for(const n of [1,2,3])await postPlan(t.db,ana,here,{title:`Plan ${n}`,starts:`2026-11-2${n}T18:00`},NOW);
  expect(await inFromPage(t.db,ana,'https://posh.vip/e/rooftop-closing-party',NOW,{...options,read:reads(page())})).toEqual({state:'refused',message:'You have three plans coming up. Cancel one, or wait until one has passed.'});
  expect((await t.db.query("select 1 from campus_listing where link is not null")).rows).toHaveLength(0);
 });
 it('sends them to finish in Loopd when the campus needs a listed place and the page names none',async()=>{
  const ana=await person('Ana Lopez','cornell-tech');
  expect(await inFromPage(t.db,ana,'https://posh.vip/e/rooftop-closing-party',NOW,{...options,read:reads(page({place:'Somewhere unknown'}))}))
   .toEqual({state:'finish',finish:`${BASE}/c/cornell-tech?post=${encodeURIComponent('https://posh.vip/e/rooftop-closing-party')}`});
  // A page Loopd does not read (CampusGroups) is finished in Loopd too.
  expect(await inFromPage(t.db,ana,'https://cornelltech.campusgroups.com/rsvp?id=1',NOW,{...options,read:reads(page())})).toMatchObject({state:'finish'});
  expect((await t.db.query("select 1 from campus_listing where origin='member'")).rows).toHaveLength(0);
 });
 it('says why when the page is gone',async()=>{
  const ana=await person('Ana Lopez');
  expect(await inFromPage(t.db,ana,'https://posh.vip/e/x',NOW,{...options,read:reads({ok:false,reason:'gone'})})).toEqual({state:'refused',message:'That page is gone, or says the event is off.'});
 });
 it('keeps them in once they have checked in',async()=>{
  const ana=await person('Ana Lopez'),mixer=await event();
  await imIn(t.db,ana,mixer,NOW);await checkIn(t.db,ana,mixer,new Date(NOW.getTime()+5*3600000));
  expect(await leaveFromPage(t.db,ana,LUMA,new Date(NOW.getTime()+5*3600000),options)).toEqual({state:'refused',message:'You have checked in, so you are staying in.'});
 });
});

describe('a feed event keeps the address of its page',()=>{
 const calendar=(...lines:string[])=>['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:e1','SUMMARY:Bagels and Belonging','DTSTART:20261118T133000Z',...lines,'END:VEVENT','END:VCALENDAR'].join('\r\n');
 const stored=async()=>(await t.db.query<{source_url:string|null}>('select source_url from campus_listing')).rows.map(row=>row.source_url);
 it('keeps the page the feed gives, in the form the extension looks up, and follows it when the item changes',async()=>{
  const here=await campus(),url='https://feeds.test/cg.ics';
  await addFeed(t.db,{campusId:here.id,source:'CampusGroups',url});
  await readFeeds(t.db,{now:NOW,fetch:async()=>calendar('URL:https://cornelltech.campusgroups.com/rsvp?id=2132977')});
  expect(await stored()).toEqual(['https://cornelltech.campusgroups.com/rsvp?id=2132977']);
  await readFeeds(t.db,{now:NOW,fetch:async()=>calendar('URL:https://cornelltech.campusgroups.com/rsvp?id=2132978')});
  expect(await stored()).toEqual(['https://cornelltech.campusgroups.com/rsvp?id=2132978']);
  // Recognised from the address the student sees, and nothing on the event leads out.
  const ana=await person('Ana Lopez');
  expect(await lookUp(t.db,ana,'https://cornelltech.campusgroups.com/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3OA==',NOW,options)).toMatchObject({state:'none',seen:true});
  const {rows:[row]}=await t.db.query<{link:string|null;about:string|null}>('select link,about from campus_listing');
  expect(row).toEqual({link:null,about:null});
 });
 it('imports as before with no address when the feed gives none, or one that is not https',async()=>{
  const here=await campus();
  await addFeed(t.db,{campusId:here.id,source:'Luma',url:'https://feeds.test/a.ics'});
  await readFeeds(t.db,{now:NOW,fetch:async()=>calendar()});
  expect(await stored()).toEqual([null]);
  await readFeeds(t.db,{now:NOW,fetch:async()=>calendar('URL:http://lu.ma/x')});
  expect(await stored()).toEqual([null]);
  expect(parseFeed(calendar('URL:javascript:alert(1)'),'America/New_York')[0].url).toBeNull();
  expect(sourceUrlOf('https://lu.ma/fall-founders-mixer?utm_source=feed')).toBe('https://luma.com/fall-founders-mixer');
  expect(sourceUrlOf('https://events.cornell.edu/event/x')).toBe('https://events.cornell.edu/event/x');
 });
});
