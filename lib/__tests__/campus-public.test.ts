// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {findCampus,type Campus} from '@/lib/campus/listings';
import {setRecordPublic} from '@/lib/campus/record';
import {askWindow,publicEvent,publicEvents,publicPlace,publicPlaces} from '@/lib/campus/public';

// Spec: openspec/changes/campus-public-places/specs/public-places.
let t:TestDb,campus:Campus,nisi:string,ana:{id:string},feed:string;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{
 await t.reset();
 for(const table of ['campus_listing','campus_deal','campus_place','campus_feed'])await t.db.query(`delete from ${table}`);
 campus=(await findCampus(t.db,'cornell'))!;
 nisi=(await t.db.query<{id:string}>("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Nisi Bistro','{Nisi}',40.7614,-73.9505) returning id",[campus.id])).rows[0].id;
 feed=(await t.db.query<{id:string}>("insert into campus_feed(campus_id,source,url) values($1,'Luma','https://lu.ma/x.ics') returning id",[campus.id])).rows[0].id;
 ana=await makePerson(t.db,'Ana Lopez');
 seq=0;
});

const NOW=new Date('2026-11-24T17:00:00Z');   // noon on Tuesday 24 November in New York
const hours=(n:number)=>new Date(NOW.getTime()+n*3600000).toISOString();
let seq=0;
type Extra={origin?:'feed'|'hand'|'member';starts?:string;ends?:string|null;hidden?:boolean;cancelled?:boolean;left?:boolean;waiting?:boolean;deal?:string;place?:string|null;title?:string};
async function event(extra:Extra={}){
 const origin=extra.origin??'feed';
 const {rows:[row]}=await t.db.query<{id:string}>(`insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,about,host_name,place_id,starts_at,ends_at,posted_by,hidden_at,cancelled_at,left_feed_at,waiting,deal_id)
  values($1,$2,$3,$4,$5,'Live music all night','Nisi',$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
  [campus.id,origin,origin==='feed'?feed:null,origin==='feed'?`item-${seq++}`:null,extra.title??'Greek night',extra.place===undefined?nisi:extra.place,extra.starts??hours(30),extra.ends??null,
   origin==='member'?ana.id:null,extra.hidden?NOW.toISOString():null,extra.cancelled?NOW.toISOString():null,extra.left?NOW.toISOString():null,!!extra.waiting,extra.deal??null]);
 return row.id;
}
async function deal(){
 return (await t.db.query<{id:string}>("insert into campus_deal(campus_id,place_id,title,line,head_count,days,starts_local,ends_local,note) values($1,$2,'Drinks','$2 off',2,'{2}','17:00','19:00','Owner said yes on the phone, private') returning id",[campus.id,nisi])).rows[0].id;
}
const week=()=>publicEvents(t.db,campus,{from:NOW,to:new Date(NOW.getTime()+7*86400000)});

describe('which events are public',()=>{
 it('a feed event and a hand-entered event are public',async()=>{
  const a=await event(),b=await event({origin:'hand',title:'Quiz',starts:hours(50)});
  expect((await week()).map(e=>e.id)).toEqual([a,b]);
  expect(await publicEvent(t.db,a,NOW)).toMatchObject({id:a,title:'Greek night',source:'Luma',place:{name:'Nisi Bistro',tag:'nisi'},campus:{slug:'cornell'}});
  expect((await publicEvent(t.db,b,NOW))?.source).toBeNull();
 });
 it('a plan a person posted is never public',async()=>{
  const id=await event({origin:'member'});
  expect(await week()).toEqual([]);
  expect(await publicEvent(t.db,id,NOW)).toBeNull();
 });
 it('waiting, hidden, cancelled and gone from the feed are not public',async()=>{
  const ids=[await event({waiting:true,hidden:true}),await event({waiting:true}),await event({hidden:true}),await event({cancelled:true}),await event({left:true})];
  expect(await week()).toEqual([]);
  for(const id of ids)expect(await publicEvent(t.db,id,NOW)).toBeNull();
 });
 it('an event that has ended is not public; one still on is',async()=>{
  const ended=await event({starts:hours(-5)}),on=await event({starts:hours(-1)});
  expect((await week()).map(e=>e.id)).toEqual([on]);
  expect(await publicEvent(t.db,ended,NOW)).toBeNull();
 });
 it("a deal's day is not public, even while it runs",async()=>{
  const id=await event({origin:'hand',deal:await deal(),starts:hours(-0.5),ends:hours(1.5)});
  expect(await week()).toEqual([]);
  expect(await publicEvent(t.db,id,NOW)).toBeNull();
 });
 it('counts who is going, and filters by place and window',async()=>{
  const id=await event(),other=await event({place:null,starts:hours(40)});
  await event({starts:hours(24*8)});
  const {rows:[o]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'pub0000000000000001') returning id",[id]);
  const dev=await makePerson(t.db,'Dev Shah');
  for(const p of [ana,dev])await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)',[o.id,id,p.id]);
  expect((await week()).map(e=>[e.id,e.going])).toEqual([[id,2],[other,0]]);
  expect((await publicEvents(t.db,campus,{from:NOW,to:new Date(NOW.getTime()+7*86400000),placeId:nisi})).map(e=>e.id)).toEqual([id]);
 });
});

describe('which places are public',()=>{
 it('a place with a public event in 14 days, or a public record; nothing else',async()=>{
  expect(await publicPlace(t.db,'cornell','nisi',NOW)).toBeNull();
  await event({origin:'member'});
  expect(await publicPlace(t.db,'cornell','nisi',NOW)).toBeNull();
  await event({starts:hours(24*15)});
  expect(await publicPlace(t.db,'cornell','nisi',NOW)).toBeNull();
  await event({starts:hours(24*13)});
  expect(await publicPlace(t.db,'cornell','nisi',NOW)).toMatchObject({id:nisi,name:'Nisi Bistro',tag:'nisi',recordPublic:false,campus:{slug:'cornell',name:'Cornell'}});
  expect((await publicPlaces(t.db,campus,NOW)).map(p=>p.tag)).toEqual(['nisi']);
  expect(await publicPlace(t.db,'columbia','nisi',NOW)).toBeNull();
  expect(await publicPlace(t.db,'cornell','nowhere',NOW)).toBeNull();
 });
 it('a public record makes a place public with nothing on',async()=>{
  await setRecordPublic(t.db,nisi,true);
  expect(await publicPlace(t.db,'cornell','nisi',NOW)).toMatchObject({recordPublic:true});
  expect((await publicPlaces(t.db,campus,NOW)).map(p=>p.tag)).toEqual(['nisi']);
 });
});

describe('the ask window',()=>{
 it('tonight runs from 5pm (or now) to 4am; today to midnight; tomorrow is the whole next day; week is seven days',()=>{
  const tz='America/New_York';
  expect(askWindow('tonight',tz,NOW)).toEqual({from:new Date('2026-11-24T22:00:00Z'),to:new Date('2026-11-25T09:00:00Z')});
  expect(askWindow('tonight',tz,new Date('2026-11-25T01:00:00Z')).from).toEqual(new Date('2026-11-25T01:00:00Z'));
  expect(askWindow('today',tz,NOW)).toEqual({from:NOW,to:new Date('2026-11-25T05:00:00Z')});
  expect(askWindow('tomorrow',tz,NOW)).toEqual({from:new Date('2026-11-25T05:00:00Z'),to:new Date('2026-11-26T05:00:00Z')});
  expect(askWindow('week',tz,NOW)).toEqual({from:NOW,to:new Date('2026-12-01T05:00:00Z')});
 });
});

it('nothing returned names, or leads to, a person, and no private note',async()=>{
 const dev=await makePerson(t.db,'Dev Shah');
 const id=await event(),plan=await event({origin:'member',title:'Ana and Dev dinner'});
 await event({origin:'hand',deal:await deal(),starts:hours(-0.5),ends:hours(1.5)});
 const {rows:[o]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'pubtoken00000000099') returning id",[id]);
 for(const p of [ana,dev])await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)',[o.id,id,p.id]);
 await setRecordPublic(t.db,nisi,true);
 const all=JSON.stringify([await week(),await publicEvent(t.db,id,NOW),await publicEvent(t.db,plan,NOW),await publicPlace(t.db,'cornell','nisi',NOW),await publicPlaces(t.db,campus,NOW)]);
 for(const needle of [ana.id,dev.id,'Ana','Lopez','Dev','Shah','pubtoken00000000099','Owner said yes','private',plan,'postedBy','posted_by'])expect(all).not.toContain(needle);
});
