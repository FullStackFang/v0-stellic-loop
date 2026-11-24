// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {findCampus} from '@/lib/campus/listings';
import {findRecord,placeRecord,recordLink,recordReady,renewRecordLink,setRecordPublic} from '@/lib/campus/record';

// Spec: openspec/changes/campus-venue-record/specs/venue-record.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_place');await t.db.query('delete from campus_listing');});

const TZ='America/New_York';
const NOW=new Date('2026-11-17T17:00:00Z');   // noon on Tuesday 17 November in New York; the week began Monday the 16th
const daysAgo=(n:number)=>new Date(NOW.getTime()-n*86400000);
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const place=async(name='Nisi Bistro',others:string[]=[])=>(await t.db.query<{id:string}>('insert into campus_place(campus_id,name,other_names,lat,lon) values($1,$2,$3,42.44,-76.48) returning id',[(await cornell()).id,name,others])).rows[0].id;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
let seq=0;
/** One group on one event at `placeId` (or on an event with no matched place), starting at `at`. Those in `here` checked in. */
async function group(placeId:string|null,at:Date,people:string[],here:string[]=people) {
 const {rows:[listing]}=await t.db.query<{id:string}>("insert into campus_listing(campus_id,origin,title,place_id,starts_at) values($1,'hand','Night out',$2,$3) returning id",[(await cornell()).id,placeId,at.toISOString()]);
 const {rows:[outing]}=await t.db.query<{id:string}>('insert into campus_outing(listing_id,token) values($1,$2) returning id',[listing.id,`rec${String(seq++).padStart(16,'0')}`]);
 for(const id of people)await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id,checked_in_at) values($1,$2,$3,$4)',[outing.id,listing.id,id,here.includes(id)?at.toISOString():null]);
}
const record=(placeId:string,span:4|8|'all'=8)=>placeRecord(t.db,placeId,span,TZ,NOW);

describe('three numbers for a place',()=>{
 it('counts a group that only said it was coming once, and nowhere else',async()=>{
  const nisi=await place(),[a,b,c]=await Promise.all(['Ana','Dev','Noor'].map(person));
  await group(nisi,daysAgo(2),[a,b,c],[]);
  expect(await record(nisi)).toMatchObject({said:1,people:3,showed:0,back:0});
 });
 it('counts a group that showed up when two of its members checked in',async()=>{
  const nisi=await place(),[a,b,c]=await Promise.all(['Ana','Dev','Noor'].map(person));
  await group(nisi,daysAgo(2),[a,b,c],[a,b]);
  expect(await record(nisi)).toMatchObject({said:1,people:3,showed:1,back:0});
 });
 it('does not count one person alone, or a group where only one checked in',async()=>{
  const nisi=await place(),[a,b,c]=await Promise.all(['Ana','Dev','Noor'].map(person));
  await group(nisi,daysAgo(3),[a]);
  await group(nisi,daysAgo(2),[b,c],[b]);
  expect(await record(nisi)).toMatchObject({said:1,people:2,showed:0,back:0});
 });
 it('counts a group as coming back when two of it checked in together there on an earlier day',async()=>{
  const nisi=await place(),[ana,dev,noor,sam]=await Promise.all(['Ana','Dev','Noor','Sam'].map(person));
  await group(nisi,daysAgo(8),[ana,dev]);
  await group(nisi,daysAgo(1),[ana,dev,noor,sam]);
  expect(await record(nisi)).toMatchObject({said:2,showed:2,back:1});
 });
 it('does not count coming back with only one person in common, or twice on the same day',async()=>{
  const nisi=await place(),[ana,dev,noor,sam]=await Promise.all(['Ana','Dev','Noor','Sam'].map(person));
  await group(nisi,daysAgo(8),[ana,dev]);
  await group(nisi,daysAgo(1),[ana,noor]);
  await group(nisi,new Date(daysAgo(1).getTime()+3600000),[noor,sam]);
  await group(nisi,new Date(daysAgo(1).getTime()+7200000),[noor,sam]);
  expect((await record(nisi)).back).toBe(0);
 });
 it('leaves out groups at another place and on events with no matched place',async()=>{
  const nisi=await place(),other=await place('Northside Coffee'),[a,b]=await Promise.all(['Ana','Dev'].map(person));
  await group(other,daysAgo(2),[a,b]);
  await group(null,daysAgo(3),[a,b]);
  expect(await record(nisi)).toMatchObject({said:0,people:0,showed:0,back:0});
  expect((await record(other)).showed).toBe(1);
 });
 it('counts coming back against a visit before the span',async()=>{
  const nisi=await place(),[ana,dev]=await Promise.all(['Ana','Dev'].map(person));
  await group(nisi,daysAgo(80),[ana,dev]);
  await group(nisi,daysAgo(1),[ana,dev]);
  expect(await record(nisi,4)).toMatchObject({showed:1,back:1});
 });
});

describe('the span and the breakdowns',()=>{
 it('counts 4 weeks, 8 weeks and all time from Monday in the campus timezone',async()=>{
  const nisi=await place(),[a,b]=await Promise.all(['Ana','Dev'].map(person));
  // 03:30 UTC on Monday 26 October is still Sunday evening in New York: the week before the 4-week span.
  await group(nisi,new Date('2026-10-26T03:30:00Z'),[a,b]);
  await group(nisi,new Date('2026-10-26T04:30:00Z'),[a,b]);
  await group(nisi,new Date('2026-09-28T05:00:00Z'),[a,b]);
  await group(nisi,new Date('2026-09-01T20:00:00Z'),[a,b]);
  expect((await record(nisi,4)).showed).toBe(1);
  expect((await record(nisi,8)).showed).toBe(3);
  expect((await record(nisi,'all')).showed).toBe(4);
 });
 it('leaves events that have not started yet out',async()=>{
  const nisi=await place(),[a,b]=await Promise.all(['Ana','Dev'].map(person));
  await group(nisi,new Date(NOW.getTime()+3600000),[a,b],[]);
  expect((await record(nisi)).said).toBe(0);
 });
 it('hides the breakdowns below five groups that showed up',async()=>{
  const nisi=await place(),people=await Promise.all(['A','B','C','D'].map(person));
  for(let i=0;i<4;i++)await group(nisi,daysAgo(i+1),people.slice(0,2));
  expect(await record(nisi)).toMatchObject({showed:4,weeks:null,sizes:null,days:null});
 });
 it('breaks five or more down by week, size and day, each adding up to the groups that showed up',async()=>{
  const nisi=await place(),p=await Promise.all(['A','B','C','D','E','F'].map(person));
  // Monday 16 Nov, Friday 13 Nov, Saturday 7 Nov, Sunday 15 Nov at 23:30 New York (04:30 UTC Monday), Thursday 12 Nov.
  await group(nisi,new Date('2026-11-16T23:00:00Z'),p.slice(0,2));
  await group(nisi,new Date('2026-11-13T23:00:00Z'),p.slice(0,3));
  await group(nisi,new Date('2026-11-07T23:00:00Z'),p.slice(0,4));
  await group(nisi,new Date('2026-11-16T04:30:00Z'),p.slice(0,5));
  await group(nisi,new Date('2026-11-12T23:00:00Z'),p,p.slice(0,2));
  const r=await record(nisi);
  expect(r.showed).toBe(5);
  expect(r.weeks).toHaveLength(8);
  expect(r.weeks![0].week).toBe('2026-09-28');
  expect(r.weeks!.slice(-3)).toEqual([{week:'2026-11-02',showed:1},{week:'2026-11-09',showed:3},{week:'2026-11-16',showed:1}]);
  // Sized by who checked in: 2, 3, 4, 5, and 2 of the six.
  expect(r.sizes).toEqual({two:2,threeFour:2,fivePlus:1});
  expect(r.days).toEqual({monThu:2,friday:1,weekend:2});
  for(const sum of [r.weeks!.reduce((n,w)=>n+w.showed,0),Object.values(r.sizes!).reduce((n,v)=>n+v,0),Object.values(r.days!).reduce((n,v)=>n+v,0)])expect(sum).toBe(5);
 });
 it('runs all time from the first week a group showed up',async()=>{
  const nisi=await place(),p=await Promise.all(['A','B'].map(person));
  await group(nisi,new Date('2026-08-05T20:00:00Z'),p);
  for(let i=0;i<4;i++)await group(nisi,daysAgo(i+1),p);
  const r=await record(nisi,'all');
  expect(r.weeks![0].week).toBe('2026-08-03');
  expect(r.weeks!.at(-1)!.week).toBe('2026-11-16');
  expect(r.weeks!.reduce((n,w)=>n+w.showed,0)).toBe(5);
 });
});

describe('the link',()=>{
 it('is ready once the columns exist',async()=>{expect(await recordReady(t.db)).toBe(true);});
 it('makes a key once, opens with it, and stops the old key when renewed',async()=>{
  const nisi=await place('Nisi Bistro',['Nisi']);
  const key=await recordLink(t.db,nisi);
  expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  expect(await recordLink(t.db,nisi)).toBe(key);
  expect(await findRecord(t.db,'cornell','nisi',key)).toMatchObject({id:nisi,name:'Nisi Bistro',public:false});
  expect(await findRecord(t.db,'cornell','nisi',null)).toBeNull();
  expect(await findRecord(t.db,'cornell','nisi','x'.repeat(24))).toBeNull();
  expect(await findRecord(t.db,'cornell','nisi-bistro',key)).toBeNull();
  expect(await findRecord(t.db,'columbia','nisi',key)).toBeNull();
  const fresh=await renewRecordLink(t.db,nisi);
  expect(fresh).not.toBe(key);
  expect(await findRecord(t.db,'cornell','nisi',key)).toBeNull();
  expect(await findRecord(t.db,'cornell','nisi',fresh)).not.toBeNull();
 });
 it('opens with no key once public, and a place with no key yet stays closed',async()=>{
  const nisi=await place();
  expect(await findRecord(t.db,'cornell','nisi-bistro',null)).toBeNull();
  await setRecordPublic(t.db,nisi,true);
  expect(await findRecord(t.db,'cornell','nisi-bistro',null)).toMatchObject({public:true});
  await setRecordPublic(t.db,nisi,false);
  expect(await findRecord(t.db,'cornell','nisi-bistro',null)).toBeNull();
 });
});
