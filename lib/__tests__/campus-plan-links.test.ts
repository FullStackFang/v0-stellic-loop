// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {CampusError} from '@/lib/campus/errors';
import {findCampus,weekListings} from '@/lib/campus/listings';
import {setHidden} from '@/lib/campus/manage';
import {outingsOn} from '@/lib/campus/outings';
import {cancelPlan,changePlan,postPlan,readPlanLink} from '@/lib/campus/plans';
import type {PageRead} from '@/lib/emba/event-link';

// Spec: openspec/changes/loop-group-event-links/specs/campus-event-links.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T17:00:00Z');   // noon on Tuesday in New York
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
const LUMA='https://lu.ma/4mkwpko0';
const page=(over:Partial<Extract<PageRead,{ok:true}>['facts']>={}):PageRead=>({ok:true,facts:{name:'Special Special 10 Year Celebration',startsAt:'2026-11-19T23:00:00.000Z',endsAt:'2026-11-20T01:00:00.000Z',place:'40 E 1st St',host:'Special Special',...over}});
const reads=(answer:PageRead)=>vi.fn(async()=>answer);

it('fills the form from an event page, in the campus\'s own time, and keeps the link without its tracking',async()=>{
 const read=reads(page());
 expect(await readPlanLink(await cornell(),' lu.ma/4mkwpko0?utm_source=whatsapp ',NOW,read)).toEqual({ok:true,link:LUMA,
  filled:{title:'Special Special 10 Year Celebration',starts:'2026-11-19T18:00',ends:'2026-11-19T20:00',place:'40 E 1st St',about:'Hosted by Special Special'},
  note:'Read from lu.ma. Check it, then post it.'});
 expect(read).toHaveBeenCalledWith(LUMA);
});
it('takes a page time with no offset as the campus\'s time, and leaves out what the page did not say',async()=>{
 expect(await readPlanLink(await cornell(),LUMA,NOW,reads(page({startsAt:'2026-11-19T18:00',endsAt:null,place:null,host:null})))).toMatchObject({ok:true,
  filled:{title:'Special Special 10 Year Celebration',starts:'2026-11-19T18:00',ends:'',place:'',about:''}});
});
it('keeps the link and asks for the rest when the site is not one Loop reads, or the page could not be read',async()=>{
 const campus=await cornell(),never=reads(page());
 expect(await readPlanLink(campus,'https://partiful.com/e/abc123?x=1',NOW,never)).toEqual({ok:true,link:'https://partiful.com/e/abc123?x=1',filled:null,note:'Loop does not read partiful.com. The link is kept: fill in the rest.'});
 expect(never).not.toHaveBeenCalled();
 expect(await readPlanLink(campus,LUMA,NOW,reads({ok:false,reason:'unreadable'}))).toEqual({ok:true,link:LUMA,filled:null,note:'Loop could not read that page. The link is kept: fill in the rest.'});
});
it('says why when the link cannot be used: not a link, gone, already started, or too far ahead',async()=>{
 const campus=await cornell(),said=async(raw:string,answer:PageRead)=>{const got=await readPlanLink(campus,raw,NOW,reads(answer));return got.ok?null:got.message;};
 expect(await said('',page())).toBe('Paste the link of an event page.');
 expect(await said('http://lu.ma/4mkwpko0',page())).toBe('Use a link that starts with https.');
 expect(await said(LUMA,{ok:false,reason:'gone'})).toBe('That page is gone, or says the event is off.');
 expect(await said(LUMA,page({startsAt:'2026-11-17T16:00:00.000Z',endsAt:null}))).toBe('That event has already started.');
 expect(await said(LUMA,page({startsAt:'2026-12-05T23:00:00.000Z',endsAt:null}))).toBe('That event is more than 14 days away. Post it closer to the day.');
});
it('drops an end the form would refuse, such as a festival that runs for days',async()=>{
 expect(await readPlanLink(await cornell(),LUMA,NOW,reads(page({endsAt:'2026-11-22T23:00:00.000Z'})))).toMatchObject({ok:true,filled:{starts:'2026-11-19T18:00',ends:''}});
});

it('posts a plan with its link, and the list carries the link',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 const plan=await postPlan(t.db,a,campus,{title:'Special Special 10 Year Celebration',starts:'2026-11-19T18:00',link:'lu.ma/4mkwpko0?utm_source=x'},NOW);
 expect(plan.existing).toBeUndefined();
 expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({id:plan.id,origin:'member',link:LUMA,postedBy:a,going:1,host:null});
});
it('the same link a second time adds nothing: that person is counted in on the plan that is there',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez'),b=await person('Ben Ito');
 const first=await postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW);
 const again=await postPlan(t.db,b,campus,{title:'Typed differently',starts:'2026-11-19T19:00',link:`${LUMA}/?ref=b`},NOW);
 expect(again).toMatchObject({id:first.id,existing:true});
 const list=await weekListings(t.db,campus,NOW);
 expect(list).toHaveLength(1);
 expect(list[0]).toMatchObject({title:'Celebration',going:2});
 expect((await outingsOn(t.db,[first.id])).flatMap(outing=>outing.members.map(member=>member.personId)).sort()).toEqual([a,b].sort());
 // The poster pasting it again changes nothing.
 expect(await postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW)).toMatchObject({id:first.id,existing:true});
 expect((await weekListings(t.db,campus,NOW))[0].going).toBe(2);
});
it('joining a plan that is already there does not count against the three plans a person may have coming up',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez'),b=await person('Ben Ito');
 const first=await postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW);
 for(const day of ['18','19','20'])await postPlan(t.db,b,campus,{title:'Run',starts:`2026-11-${day}T17:00`},NOW);
 expect(await postPlan(t.db,b,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW)).toMatchObject({id:first.id,existing:true});
 await expect(postPlan(t.db,b,campus,{title:'Other',starts:'2026-11-21T17:00',link:'https://posh.vip/e/other'},NOW)).rejects.toThrow('three plans');
});
it('a cancelled plan frees its link, a plan the admin hid does not, and another campus is its own list',async()=>{
 const campus=await cornell(),columbia=(await findCampus(t.db,'columbia'))!,a=await person('Ana Lopez'),b=await person('Ben Ito');
 const first=await postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW);
 expect((await postPlan(t.db,b,columbia,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW)).existing).toBeUndefined();
 await setHidden(t.db,first.id,true);
 await expect(postPlan(t.db,b,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW)).rejects.toThrow('This event was taken off the list.');
 await setHidden(t.db,first.id,false);
 await cancelPlan(t.db,{personId:a,admin:false},first.id,NOW);
 const second=await postPlan(t.db,b,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW);
 expect(second.id).not.toBe(first.id);expect(second.existing).toBeUndefined();
});
it('refuses a link that is not https, and changing a plan keeps its link',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 await expect(postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:'ftp://lu.ma/x'},NOW)).rejects.toBeInstanceOf(CampusError);
 const plan=await postPlan(t.db,a,campus,{title:'Celebration',starts:'2026-11-19T18:00',link:LUMA},NOW);
 await changePlan(t.db,{personId:a,admin:false},plan.id,{title:'Celebration, upstairs',starts:'2026-11-19T18:30'},NOW);
 expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({title:'Celebration, upstairs',link:LUMA});
});
