// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {knownTo} from '@/lib/campus/knows';
import {findCampus,weekListings} from '@/lib/campus/listings';
import {setHidden} from '@/lib/campus/manage';
import {imIn} from '@/lib/campus/outings';
import {cancelPlan,postPlan} from '@/lib/campus/plans';
import {nearTags} from '@/lib/campus/tags';

// Spec: openspec/changes/loop-group-event-links/specs/campus-one-line ("@places").
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');await t.db.query('delete from campus_tag');});

const NOW=new Date('2026-11-17T17:00:00Z');   // noon on Tuesday in New York
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
const tags=async(viewer:string)=>nearTags(t.db,(await cornell()).id,await knownTo(t.db,viewer),NOW);

it('a plan posted with an @place makes the place, and the list carries it',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 const plan=await postPlan(t.db,a,campus,{title:'Dumplings',starts:'2026-11-17T19:00',tag:'Collegetown'},NOW);
 expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({id:plan.id,tag:'collegetown'});
 expect((await t.db.query('select slug,created_by from campus_tag')).rows).toEqual([{slug:'collegetown',created_by:a}]);
 // Using it again makes nothing new, and the first person stays its maker.
 const b=await person('Ben Ito');
 await postPlan(t.db,b,campus,{title:'Hot pot',starts:'2026-11-17T18:30',tag:'collegetown'},NOW);
 expect((await t.db.query('select slug,created_by from campus_tag')).rows).toEqual([{slug:'collegetown',created_by:a}]);
});
it('refuses an @place that is not letters, numbers and dashes',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 for(const tag of ['a','two words','-dash','x'.repeat(31),'café'])await expect(postPlan(t.db,a,campus,{title:'Dinner',starts:'2026-11-17T19:00',tag},NOW)).rejects.toThrow('An @place is letters, numbers and dashes');
 expect((await weekListings(t.db,campus,NOW))).toHaveLength(0);
});
it('lists the places by how many people are in plans there, and names only people the viewer knows',async()=>{
 const campus=await cornell(),[a,b,c,d]=[await person('Ana Lopez'),await person('Ben Ito'),await person('Cy Park'),await person('Dee Wu')];
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of [a,b])await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
 const dumplings=await postPlan(t.db,b,campus,{title:'Dumplings',starts:'2026-11-17T19:00',tag:'collegetown'},NOW);
 await imIn(t.db,c,dumplings.id,NOW);
 await postPlan(t.db,c,campus,{title:'Hot pot',starts:'2026-11-18T18:30',tag:'collegetown'},NOW);
 await postPlan(t.db,d,campus,{title:'Run',starts:'2026-11-18T07:00',tag:'arts-quad'},NOW);
 await postPlan(t.db,d,campus,{title:'No place',starts:'2026-11-19T07:00'},NOW);
 // Ana knows Ben (same group). Cy is counted and not named.
 expect(await tags(a)).toEqual([{slug:'collegetown',people:2,known:['Ben']},{slug:'arts-quad',people:1,known:[]}]);
 expect(await tags(d)).toEqual([{slug:'collegetown',people:2,known:[]},{slug:'arts-quad',people:1,known:[]}]);
 // Another campus has its own places.
 expect(await nearTags(t.db,(await findCampus(t.db,'columbia'))!.id,new Map(),NOW)).toEqual([]);
});
it('a place nobody is using any more is not suggested: cancelled, hidden or more than a week old',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 const gone=await postPlan(t.db,a,campus,{title:'Dinner',starts:'2026-11-17T19:00',tag:'cancelled-spot'},NOW);
 await cancelPlan(t.db,{personId:a,admin:false},gone.id,NOW);
 const hidden=await postPlan(t.db,a,campus,{title:'Dinner',starts:'2026-11-17T19:00',tag:'rude-name'},NOW);
 await setHidden(t.db,hidden.id,true);
 await postPlan(t.db,a,campus,{title:'Dinner',starts:'2026-11-17T19:00',tag:'old-spot'},NOW);
 expect((await tags(a)).map(tag=>tag.slug)).toEqual(['old-spot']);
 expect(await nearTags(t.db,campus.id,new Map(),new Date(NOW.getTime()+9*86400000))).toEqual([]);
});
