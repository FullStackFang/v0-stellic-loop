// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {assistantReady,matchedInterest,myInterests,setInterest} from '@/lib/campus/interest';
import {knownTo} from '@/lib/campus/knows';
import {findCampus} from '@/lib/campus/listings';
import {addHandListing} from '@/lib/campus/manage';
import {checkIn,imIn,outingsOn} from '@/lib/campus/outings';
import {makeTap,readTap,pressTap} from '@/lib/campus/tap';

// Spec: openspec/changes/campus-assistant-tools/specs/campus-assistant-tools ("Interested is private until it matches",
// "Joining needs the person's tap", "Closing the loop needs the person's tap").
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T17:00:00Z');
const hours=(n:number)=>new Date(NOW.getTime()+n*3600000),minutes=(n:number)=>new Date(NOW.getTime()+n*60000);
const event=async(startsAt=hours(5),endsAt:Date|null=null)=>(await addHandListing(t.db,{campusId:(await findCampus(t.db,'cornell'))!.id,title:'Blitz night',startsAt:startsAt.toISOString(),endsAt:endsAt?.toISOString()??null})).id;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
async function group(...people:string[]) {
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Team 4') returning id");
 for(const id of people)await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
}
const inIt=async(listing:string,id:string)=>(await outingsOn(t.db,[listing])).some(outing=>outing.members.some(member=>member.personId===id));

it('the migration is there in the test database',async()=>{expect(await assistantReady(t.db)).toBe(true);});

describe('interested',()=>{
 it('marks, marks twice as once, and unmarks',async()=>{
  const [a,listing]=[await person('Ana'),await event()];
  await setInterest(t.db,a,listing,true);await setInterest(t.db,a,listing,true);
  expect([...await myInterests(t.db,a,[listing])]).toEqual([listing]);
  expect((await t.db.query('select 1 from campus_interest')).rows).toHaveLength(1);
  await setInterest(t.db,a,listing,false);
  expect((await myInterests(t.db,a,[listing])).size).toBe(0);
 });
 it('tells two people who know each other about each other, and nobody else',async()=>{
  const [a,d,s,listing]=[await person('Ana'),await person('Dev'),await person('Sam'),await event()];
  await group(a,d);
  for(const id of [a,d,s])await setInterest(t.db,id,listing,true);
  expect((await matchedInterest(t.db,a,[listing],await knownTo(t.db,a))).get(listing)).toEqual([d]);
  expect((await matchedInterest(t.db,d,[listing],await knownTo(t.db,d))).get(listing)).toEqual([a]);
  // Sam knows nobody here: a stranger's mark is never told.
  expect((await matchedInterest(t.db,s,[listing],await knownTo(t.db,s))).size).toBe(0);
 });
 it('needs both marks: someone who did not mark is told nothing',async()=>{
  const [a,d,listing]=[await person('Ana'),await person('Dev'),await event()];
  await group(a,d);await setInterest(t.db,d,listing,true);
  expect((await matchedInterest(t.db,a,[listing],await knownTo(t.db,a))).size).toBe(0);
 });
 it('is removed by joining the event',async()=>{
  const [a,listing]=[await person('Ana'),await event()];
  await setInterest(t.db,a,listing,true);await imIn(t.db,a,listing,NOW);
  expect((await myInterests(t.db,a,[listing])).size).toBe(0);
 });
});

describe('the tap',()=>{
 it('has two codes: the card takes only its own, the link page only the link one, and either press uses both',async()=>{
  const [a,listing]=[await person('Ana'),await event()];
  const {card,link}=await makeTap(t.db,a,'join',listing,null,NOW);
  expect(card).not.toBe(link);
  expect(await pressTap(t.db,a,link,'card',minutes(1))).toEqual({done:false,reason:'unknown'});
  expect(await pressTap(t.db,a,card,'link',minutes(1))).toEqual({done:false,reason:'unknown'});
  expect(await inIt(listing,a)).toBe(false);
  expect(await pressTap(t.db,a,link,'link',minutes(2))).toMatchObject({done:true,action:'join'});
  expect(await pressTap(t.db,a,card,'card',minutes(3))).toEqual({done:false,reason:'used'});
 });
 it('is made for one person, opening it uses nothing, and the press joins once',async()=>{
  const [a,listing]=[await person('Ana'),await event()];
  const code=(await makeTap(t.db,a,'join',listing,null,NOW)).card;
  expect(await inIt(listing,a)).toBe(false);
  expect(await readTap(t.db,a,code,'card',minutes(1))).toEqual({action:'join',listingId:listing,outingId:null});
  expect(await inIt(listing,a)).toBe(false);
  expect(await pressTap(t.db,a,code,'card',minutes(2))).toMatchObject({done:true,action:'join',joined:true});
  expect(await inIt(listing,a)).toBe(true);
  expect(await pressTap(t.db,a,code,'card',minutes(3))).toEqual({done:false,reason:'used'});
 });
 it('runs out after ten minutes',async()=>{
  const [a,listing]=[await person('Ana'),await event()];
  const code=(await makeTap(t.db,a,'join',listing,null,NOW)).card;
  expect(await pressTap(t.db,a,code,'card',minutes(10))).toEqual({done:false,reason:'expired'});
  expect(await readTap(t.db,a,code,'card',minutes(11))).toEqual({done:false,reason:'expired'});
  expect(await inIt(listing,a)).toBe(false);
 });
 it('is refused for another person, and for a code that does not exist',async()=>{
  const [a,b,listing]=[await person('Ana'),await person('Ben'),await event()];
  const code=(await makeTap(t.db,a,'join',listing,null,NOW)).card;
  expect(await pressTap(t.db,b,code,'card',minutes(1))).toEqual({done:false,reason:'not_yours'});
  expect(await readTap(t.db,b,code,'card',minutes(1))).toEqual({done:false,reason:'not_yours'});
  expect(await inIt(listing,b)).toBe(false);expect(await inIt(listing,a)).toBe(false);
  expect(await pressTap(t.db,a,'x'.repeat(24),'card',minutes(1))).toEqual({done:false,reason:'unknown'});
  // The code is still good for its own person.
  expect(await pressTap(t.db,a,code,'card',minutes(2))).toMatchObject({done:true});
 });
 it('gives the app\'s own refusal for an event that ended, and leaves the code unused',async()=>{
  const [a,listing]=[await person('Ana'),await event(hours(-3),hours(-1))];
  const code=(await makeTap(t.db,a,'join',listing,null,NOW)).card;
  expect(await pressTap(t.db,a,code,'card',minutes(1))).toEqual({done:false,reason:'refused',message:'This event has ended.'});
  expect((await t.db.query('select used_at from campus_tap where code=$1',[code])).rows[0]).toEqual({used_at:null});
 });
 it('closes the loop for a person who checked in, once the event started, and says how many checked in',async()=>{
  const [a,b,listing]=[await person('Ana'),await person('Ben'),await event(minutes(-30),hours(2))];
  await imIn(t.db,a,listing,NOW);await group(a,b);await imIn(t.db,b,listing,NOW);
  await checkIn(t.db,a,listing,NOW);
  const code=(await makeTap(t.db,a,'close',listing,null,NOW)).card;
  expect(await pressTap(t.db,a,code,'card',minutes(1))).toMatchObject({done:true,action:'close',checkedIn:1,of:2});
  expect((await t.db.query<{closed:boolean}>('select closed_at is not null as closed from campus_outing_member where person_id=$1',[a])).rows[0].closed).toBe(true);
  // Ben has not checked in: his press is refused in the app's words.
  const his=(await makeTap(t.db,b,'close',listing,null,NOW)).card;
  expect(await pressTap(t.db,b,his,'card',minutes(1))).toEqual({done:false,reason:'refused',message:'Check in on your phone first.'});
 });
});
