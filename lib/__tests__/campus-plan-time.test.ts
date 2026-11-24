// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {CampusError} from '@/lib/campus/errors';
import {readLine} from '@/lib/campus/line';
import {findCampus,weekListings,type Campus} from '@/lib/campus/listings';
import {imIn} from '@/lib/campus/outings';
import {cancelPlan,changePlan,pickTime,postPlan,setTime,WHERE} from '@/lib/campus/plans';
import {campusScreen} from '@/lib/campus/screen';

// Spec: openspec/changes/campus-plan-place-and-time (member-plans, plan-time-settling, campus-listings).
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const MON=new Date('2026-11-23T20:00:00Z');   // Monday, 3pm in New York
const at=(local:string)=>new Date(`${local}-05:00`);
const campus=async(slug:string)=>(await findCampus(t.db,slug))!;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
/** Posts a line as the campus screen's "+" does (app/c/actions.ts, postLineAction). */
const post=(personId:string,where:Campus,text:string,now=MON)=>{
 const read=readLine(text,where.tz,now);
 return postPlan(t.db,personId,where,{title:read.title,starts:read.starts,day:read.starts?null:read.day,tags:read.tags},now);
};
const row=async(id:string)=>(await t.db.query<{timeOpen:boolean;startsAt:string;endsAt:string|null;place:string|null;placeText:string|null;timeSetAt:string|null}>(
 'select l.time_open as "timeOpen",l.starts_at as "startsAt",l.ends_at as "endsAt",p.name as place,l.place_text as "placeText",l.time_set_at as "timeSetAt" from campus_listing l left join campus_place p on p.id=l.place_id where l.id=$1',[id])).rows[0];
const picks=async(id:string)=>(await t.db.query<{at:string}>("select to_char(at,'HH24:MI') as at from campus_time_pick where listing_id=$1 order by at",[id])).rows.map(each=>each.at);
const refused=(run:Promise<unknown>,message?:string)=>message?expect(run).rejects.toThrow(message):expect(run).rejects.toBeInstanceOf(CampusError);

describe('posting with a day and no time',()=>{
 it('posts "run @southpoint tomorrow" for Tuesday with its time open, at Southpoint Park',async()=>{
  const tech=await campus('cornell-tech'),ana=await person('Ana');
  const {id}=await post(ana,tech,'run @southpoint tomorrow');
  expect(await row(id)).toMatchObject({timeOpen:true,place:'Southpoint Park',placeText:'Southpoint Park'});
  expect(new Date((await row(id)).startsAt).toISOString()).toBe('2026-11-24T05:00:00.000Z');
  expect(new Date((await row(id)).endsAt!).toISOString()).toBe('2026-11-25T04:59:00.000Z');
  const {rows:[tag]}=await t.db.query<{kind:string}>("select kind from campus_tag where slug='southpoint'");
  expect(tag.kind).toBe('place');
  const listed=(await weekListings(t.db,tech,MON)).find(each=>each.id===id)!;
  expect(listed).toMatchObject({timeOpen:true,tag:'southpoint',place:{name:'Southpoint Park'}});
 });
 it('is for today when the line names no day, and refused when no offered time is left today',async()=>{
  const tech=await campus('cornell-tech'),ana=await person('Ana');
  const {id}=await post(ana,tech,'run @southpoint');
  expect(new Date((await row(id)).startsAt).toISOString()).toBe('2026-11-23T05:00:00.000Z');
  await refused(post(ana,tech,'run @southpoint',at('2026-11-23T19:45')),'Say a time, like 8pm.');
 });
 it('takes a time typed in the line as today',async()=>{
  const tech=await campus('cornell-tech'),{id}=await post(await person('Ana'),tech,'run @southpoint tomorrow 7am');
  expect(await row(id)).toMatchObject({timeOpen:false,place:'Southpoint Park'});
  expect(new Date((await row(id)).startsAt).toISOString()).toBe('2026-11-24T12:00:00.000Z');
 });
 it('refuses a day more than 14 days ahead',async()=>{
  await refused(post(await person('Ana'),await campus('cornell-tech'),'run @southpoint on 12/20'),'up to 14 days ahead');
 });
 it('leaves the week list when its day ends without a time',async()=>{
  const tech=await campus('cornell-tech'),{id}=await post(await person('Ana'),tech,'run @southpoint tomorrow');
  expect((await weekListings(t.db,tech,at('2026-11-24T23:30'))).some(each=>each.id===id)).toBe(true);
  expect((await weekListings(t.db,tech,at('2026-11-25T00:01'))).some(each=>each.id===id)).toBe(false);
 });
});

describe('a place where places are required',()=>{
 it('refuses a plan with no place on Cornell Tech, and an @ that is not a place',async()=>{
  const tech=await campus('cornell-tech'),ana=await person('Ana');
  await refused(post(ana,tech,'run tomorrow 7am'),WHERE);
  await refused(post(ana,tech,'run tomorrow 7am @rooftop'),WHERE);
  expect((await weekListings(t.db,tech,MON)).length).toBe(0);
 });
 it('takes the first @ that is a place, after one that is not',async()=>{
  const {id}=await post(await person('Ana'),await campus('cornell-tech'),'run @jogging @lighthouse tomorrow 7am');
  expect((await row(id)).place).toBe('Lighthouse Park');
 });
 it('posts on Ithaca as before, without a place',async()=>{
  const {id}=await post(await person('Ana'),await campus('cornell'),'run tomorrow 7am');
  expect(await row(id)).toMatchObject({timeOpen:false,place:null});
 });
 it('keeps the rule when the plan is changed',async()=>{
  const tech=await campus('cornell-tech'),ana=await person('Ana'),{id}=await post(ana,tech,'run @southpoint tomorrow 7am');
  await refused(changePlan(t.db,{personId:ana,admin:false},id,{title:'Run',starts:'2026-11-24T08:00',place:'the roof'},MON),WHERE);
  await changePlan(t.db,{personId:ana,admin:false},id,{title:'Run',starts:'2026-11-24T08:00',place:'Lighthouse Park'},MON);
  expect((await row(id)).place).toBe('Lighthouse Park');
 });
});

it('counts a plan with no time against the three-plan limit until its day ends',async()=>{
 const tech=await campus('cornell-tech'),ana=await person('Ana');
 await post(ana,tech,'run @southpoint tomorrow 7am');await post(ana,tech,'lunch @fuji wed noon');await post(ana,tech,'walk @lighthouse');
 await refused(post(ana,tech,'coffee @starbucks thu 9am'),'three plans');
 await post(ana,tech,'coffee @starbucks thu 9am',at('2026-11-24T00:01'));
});

describe('when works',()=>{
 async function plan(){
  const tech=await campus('cornell-tech'),[ana,ben,cy,dee]=[await person('Ana'),await person('Ben'),await person('Cy'),await person('Dee')];
  const {id}=await post(ana,tech,'run @southpoint tomorrow');
  await imIn(t.db,ben,id,MON);await imIn(t.db,cy,id,MON);
  return {tech,ana,ben,cy,dee,id};
 }
 it('marks a time on a second press unmarks it, and several may be marked',async()=>{
  const {ben,id}=await plan();
  expect(await pickTime(t.db,ben,id,'07:00',MON)).toEqual({marked:true});
  await pickTime(t.db,ben,id,'17:00',MON);
  expect(await picks(id)).toEqual(['07:00','17:00']);
  expect(await pickTime(t.db,ben,id,'17:00',MON)).toEqual({marked:false});
  expect(await picks(id)).toEqual(['07:00']);
 });
 it('is only for people in the plan other than its poster, and only the times on offer',async()=>{
  const {ana,ben,dee,id}=await plan();
  await refused(pickTime(t.db,dee,id,'07:00',MON));
  await refused(pickTime(t.db,ana,id,'07:00',MON));
  await refused(pickTime(t.db,ben,id,'08:00',MON));
 });
 it('lets the poster send a time: the plan is at that time, the marks go, and someone else may not',async()=>{
  const {ana,ben,cy,id}=await plan();
  await pickTime(t.db,ben,id,'07:00',MON);await pickTime(t.db,cy,id,'07:00',MON);
  await refused(setTime(t.db,{personId:ben,admin:false},id,'07:00',MON));
  await setTime(t.db,{personId:ana,admin:false},id,'17:00',MON);
  expect(await row(id)).toMatchObject({timeOpen:false,endsAt:null});
  expect(new Date((await row(id)).startsAt).toISOString()).toBe('2026-11-24T22:00:00.000Z');
  expect((await row(id)).timeSetAt).not.toBeNull();
  expect(await picks(id)).toEqual([]);
  await refused(pickTime(t.db,ben,id,'07:00',MON));
  await refused(setTime(t.db,{personId:ana,admin:false},id,'07:00',MON));
 });
 it('refuses a time that has passed',async()=>{
  const tech=await campus('cornell-tech'),ana=await person('Ana'),{id}=await post(ana,tech,'run @southpoint');
  await refused(setTime(t.db,{personId:ana,admin:false},id,'12:00',MON),'passed');
 });
 it('shows the poster the counts and the people in their times, and who set it afterwards',async()=>{
  const {tech,ana,ben,cy,id}=await plan();
  await pickTime(t.db,ben,id,'07:00',MON);await pickTime(t.db,cy,id,'07:00',MON);await pickTime(t.db,cy,id,'17:00',MON);
  const show=async(personId:string,now=MON)=>(await campusScreen(t.db,tech,{personId,admin:false},{now,photos:async()=>({})})).tickets.find(each=>each.id===id)!;
  const forAna=await show(ana);
  expect(forAna).toMatchObject({time:'?',member:true,timeOpen:{poster:true,answered:2,of:2}});
  expect(forAna.byFace?.first).toBe('Ana');
  expect(forAna.timeOpen!.times.map(each=>[each.label,each.count])).toEqual([['7am',2],['9am',0],['12pm',0],['5pm',1],['7pm',0]]);
  expect(forAna.timeOpen!.times[0].faces.map(face=>face.first).sort()).toEqual(['Ben','Cy']);
  const forBen=await show(ben);
  expect(forBen.timeOpen).toMatchObject({poster:false});
  expect(forBen.timeOpen!.times.filter(each=>each.mine).map(each=>each.at)).toEqual(['07:00']);
  await setTime(t.db,{personId:ana,admin:false},id,'07:00',MON);
  expect(await show(ben)).toMatchObject({timeOpen:null,setBy:'Ana set it: Tue at 7am.'});
  expect((await show(ana)).setBy).toBeNull();
 });
});

it('lets the poster cancel a plan that has started, until it ends, and nobody else',async()=>{
 const tech=await campus('cornell-tech'),[ana,ben]=[await person('Ana'),await person('Ben')],{id}=await post(ana,tech,'run @southpoint tonight 7pm');
 await imIn(t.db,ben,id,MON);
 await refused(cancelPlan(t.db,{personId:ben,admin:false},id,at('2026-11-23T19:10')));
 await refused(cancelPlan(t.db,{personId:ana,admin:false},id,at('2026-11-23T21:30')),'over');
 await cancelPlan(t.db,{personId:ana,admin:false},id,at('2026-11-23T19:10'));
 expect((await weekListings(t.db,tech,at('2026-11-23T19:11'))).some(each=>each.id===id)).toBe(false);
});
