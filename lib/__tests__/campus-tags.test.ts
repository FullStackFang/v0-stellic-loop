// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {knownTo} from '@/lib/campus/knows';
import {findCampus,weekListings} from '@/lib/campus/listings';
import {setHidden} from '@/lib/campus/manage';
import {imIn} from '@/lib/campus/outings';
import {cancelPlan,postPlan} from '@/lib/campus/plans';
import {campusTags,joinTag,nearTags,setTagKind,splitTag} from '@/lib/campus/tags';
import {tagRow} from '@/lib/campus/words';

it('knows common words that mean the same, and keeps different ones apart', () => {
  const same = (...words: string[]) => new Set(words.map(word => tagRow(word).key)).size === 1;
  expect(same('running', 'jogging', 'jog', 'runs')).toBe(true);
  expect(same('eating', 'dining', 'dinner', 'food')).toBe(true);
  expect(same('basketball', 'hoops')).toBe(true);
  expect(same('board-games', 'boardgame')).toBe(true);
  expect(same('dinner', 'lunch')).toBe(false);
  expect(same('soccer', 'football')).toBe(false);
  expect(tagRow('collegetown').activity).toBe(false);
});

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
 expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({id:plan.id,tags:['collegetown']});
 expect((await t.db.query('select slug,created_by from campus_tag')).rows).toEqual([{slug:'collegetown',created_by:a}]);
 // Using it again makes nothing new, and the first person stays its maker.
 const b=await person('Ben Ito');
 await postPlan(t.db,b,campus,{title:'Hot pot',starts:'2026-11-17T18:30',tag:'collegetown'},NOW);
 expect((await t.db.query('select slug,created_by from campus_tag')).rows).toEqual([{slug:'collegetown',created_by:a}]);
});
it('refuses an @place that is not letters, numbers and dashes',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 for(const tag of ['a','two words','-dash','x'.repeat(31),'café'])await expect(postPlan(t.db,a,campus,{title:'Dinner',starts:'2026-11-17T19:00',tag},NOW)).rejects.toThrow('A tag is letters, numbers and dashes');
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
 expect(await tags(a)).toEqual([{slug:'collegetown',people:2,known:['Ben'],also:[]},{slug:'arts-quad',people:1,known:[],also:[]}]);
 expect(await tags(d)).toEqual([{slug:'collegetown',people:2,known:[],also:[]},{slug:'arts-quad',people:1,known:[],also:[]}]);
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

// Spec: openspec/changes/loop-campus-tags/specs/campus-tags.
const at=(day:number)=>`2026-11-${day}T07:00`;
const post=async(who:string,title:string,tags:string[],day=18)=>postPlan(t.db,who,await cornell(),{title,starts:at(day),tags},NOW);
/** Every tag of the campus: its kind, the lead it points at, and whether the admin set it. */
const sorted=async()=>Object.fromEntries((await t.db.query<{slug:string;kind:string|null;lead:string|null;hand:boolean}>('select t.slug,t.kind,l.slug as lead,t.by_hand as hand from campus_tag t left join campus_tag l on l.id=t.same_as')).rows.map(row=>[row.slug,`${row.kind}${row.lead?` > ${row.lead}`:''}${row.hand?' by hand':''}`]));
const made=async(slug:string,kind:string|null,byHand=false)=>(await t.db.query<{id:string}>('insert into campus_tag(campus_id,slug,kind,sorted_at,by_hand) values($1,$2,$3,now(),$4) returning id',[(await cornell()).id,slug,kind,byHand])).rows[0].id;
const idOf=async(slug:string)=>(await t.db.query<{id:string}>('select id from campus_tag where slug=$1',[slug])).rows[0].id;

it('a plan posted with two tags has both in order, and its place is its first tag of kind place',async()=>{
 const campus=await cornell(),a=await person('Ana Lopez');
 await made('collegetown','place');
 const both=await post(a,'Morning loop',['Jogging','@collegetown']),one=await post(a,'Evening loop',['jogging'],19);
 const list=await weekListings(t.db,campus,NOW);
 expect(list.find(plan=>plan.id===both.id)).toMatchObject({tags:['jogging','collegetown'],tag:'collegetown'});
 // A plan whose only tag is something to do has no place.
 expect(list.find(plan=>plan.id===one.id)).toMatchObject({tags:['jogging'],tag:null});
 await expect(post(a,'Too many',['a1','b2','c3','d4','e5'],20)).rejects.toThrow('A plan carries up to four tags');
 // Said twice, a tag is one tag.
 const twice=await post(a,'Loop',['jogging','jogging'],20);
 expect((await weekListings(t.db,campus,NOW)).find(plan=>plan.id===twice.id)).toMatchObject({tags:['jogging']});
});
it('tags the word table knows to mean the same are one group, and what was typed is kept',async()=>{
 const [a,b]=[await person('Ana Lopez'),await person('Ben Ito')];
 await post(a,'Easy 5K',['running']);
 const plan=await post(b,'Morning loop',['jogging']);
 expect(await sorted()).toEqual({running:'activity',jogging:'activity > running'});
 expect((await weekListings(t.db,await cornell(),NOW)).find(each=>each.id===plan.id)).toMatchObject({tags:['jogging']});
 // The group is counted as one, under its lead.
 expect(await tags(a)).toEqual([{slug:'running',people:2,known:[],also:['jogging']}]);
});
it('a dash and a plural are the same tag, and take the kind of the tag they join',async()=>{
 const a=await person('Ana Lopez');
 await made('collegetown','place');
 const plan=await post(a,'Hot pot',['college-town','dumplings']);
 await post(a,'More',['dumpling'],19);
 // Nobody is in a plan with @collegetown yet, so the spelling in use leads.
 expect(await sorted()).toEqual({collegetown:'place > college-town','college-town':'place',dumplings:'null',dumpling:'null > dumplings'});
 // Joined to a place, the plan has a place.
 expect((await weekListings(t.db,await cornell(),NOW)).find(each=>each.id===plan.id)).toMatchObject({tags:['college-town','dumplings'],tag:'college-town'});
});
it('a place and an activity are never joined',async()=>{
 const a=await person('Ana Lopez');
 await made('run','place');
 await post(a,'Morning loop',['jogging']);
 expect(await sorted()).toEqual({run:'place',jogging:'activity'});
});
it('the lead of a group is the tag the most people are in plans with',async()=>{
 const [a,b,c]=[await person('Ana Lopez'),await person('Ben Ito'),await person('Cy Park')];
 await post(a,'Easy 5K',['running']);await post(b,'Morning loop',['jogging']);
 expect(await sorted()).toEqual({running:'activity',jogging:'activity > running'});
 await post(c,'Evening loop',['jogging']);
 expect(await sorted()).toEqual({running:'activity > jogging',jogging:'activity'});
 expect(await tags(a)).toEqual([{slug:'jogging',people:3,known:[],also:['running']}]);
});
it('a tag the admin set by hand is left alone by the automatic pass',async()=>{
 const [a,b]=[await person('Ana Lopez'),await person('Ben Ito')];
 await made('jogging','other',true);
 await post(a,'Easy 5K',['running']);await post(b,'Morning loop',['jogging']);
 expect(await sorted()).toEqual({running:'activity',jogging:'other by hand'});
});
it('the admin changes a kind, joins a tag to a group and splits one out, and each sticks',async()=>{
 const campus=await cornell(),[a,b,c]=[await person('Ana Lopez'),await person('Ben Ito'),await person('Cy Park')];
 await post(a,'Easy 5K',['running']);await post(b,'Morning loop',['jogging']);
 const plan=await post(c,'Laps',['track']);
 // Joined by hand, @track takes the group's kind.
 await joinTag(t.db,campus.id,await idOf('track'),await idOf('jogging'));
 expect(await sorted()).toEqual({running:'activity',jogging:'activity > running',track:'activity > running by hand'});
 expect((await campusTags(t.db,campus.id)).map(tag=>[tag.slug,tag.lead,tag.people])).toEqual([['running',null,3],['jogging','running',1],['track','running',1]]);
 // Split out, it is on its own, and a later post leaves it there.
 await splitTag(t.db,campus.id,await idOf('track'));
 await post(a,'More laps',['track'],19);
 expect((await sorted()).track).toBe('activity by hand');
 // A kind is the whole group's. As a place, @track becomes the place of the plans that carry it.
 await setTagKind(t.db,campus.id,await idOf('track'),'place');
 expect((await weekListings(t.db,campus,NOW)).find(each=>each.id===plan.id)).toMatchObject({tag:'track'});
 await setTagKind(t.db,campus.id,await idOf('jogging'),'event');
 expect(await sorted()).toEqual({running:'event by hand',jogging:'event > running by hand',track:'place by hand'});
 // Joined again, @track leads: two people are in plans with it. Splitting the lead out leaves the rest together.
 await joinTag(t.db,campus.id,await idOf('track'),await idOf('running'));
 expect(await sorted()).toEqual({running:'event > track by hand',jogging:'event > track by hand',track:'event by hand'});
 await splitTag(t.db,campus.id,await idOf('track'));
 expect(await sorted()).toEqual({running:'event by hand',jogging:'event > running by hand',track:'event by hand'});
 await expect(setTagKind(t.db,campus.id,await idOf('track'),'person')).rejects.toThrow();
 await expect(joinTag(t.db,campus.id,await idOf('jogging'),await idOf('running'))).rejects.toThrow('already');
 await expect(splitTag(t.db,(await findCampus(t.db,'columbia'))!.id,await idOf('track'))).rejects.toThrow('No such tag');
});
