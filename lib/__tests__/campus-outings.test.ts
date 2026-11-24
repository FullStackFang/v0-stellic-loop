// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {CampusError} from '@/lib/campus/errors';
import {knownTo} from '@/lib/campus/knows';
import {findCampus,weekListings} from '@/lib/campus/listings';
import {addFeed,addHandListing} from '@/lib/campus/manage';
import {savePlace} from '@/lib/campus/places';
import {checkIn,imIn,invite,inviteChoices,joinByToken,leave,outingByToken,outingsOn,uninvite} from '@/lib/campus/outings';
import {cancelPlan,changePlan,editablePlan,postPlan} from '@/lib/campus/plans';
import {zoned} from '@/lib/campus/time';

// Specs: openspec/changes/loop-campus-rewards/specs/outings and member-plans.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_feed');});

const NOW=new Date('2026-11-17T17:00:00Z');   // noon on Tuesday in New York
const hours=(n:number)=>new Date(NOW.getTime()+n*3600000);
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const event=async(over:{title?:string;startsAt?:Date;endsAt?:Date|null}={})=>(await addHandListing(t.db,{campusId:(await cornell()).id,title:over.title??'Blitz night',startsAt:(over.startsAt??hours(5)).toISOString(),endsAt:over.endsAt?.toISOString()??null})).id;
const person=async(name:string)=>(await makePerson(t.db,name)).id;
/** Puts people in one group of the groups site. */
async function group(name:string,...people:string[]) {
 const {rows:[org]}=await t.db.query<{id:string}>('insert into emba_organization(name) values($1) returning id',[name]);
 for(const id of people)await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,id]);
 return org.id;
}
const membersOf=async(listingId:string)=>(await outingsOn(t.db,[listingId])).map(outing=>outing.members.map(member=>member.personId).sort());
const refusal=(run:Promise<unknown>)=>expect(run).rejects.toBeInstanceOf(CampusError);

describe('who a person knows',()=>{
 it('is someone who shares a group with them',async()=>{
  const [a,b,c]=[await person('Ana'),await person('Ben'),await person('Cy')];
  await group('Team 4',a,b);
  expect([...await knownTo(t.db,a)]).toEqual([[b,'In Team 4']]);
  expect([...await knownTo(t.db,b)]).toEqual([[a,'In Team 4']]);
  expect((await knownTo(t.db,c)).size).toBe(0);
 });
 it('is not someone whose membership of the shared group was revoked',async()=>{
  const [a,b]=[await person('Ana'),await person('Ben')],org=await group('Team 4',a,b);
  await t.db.query('update emba_membership set revoked_at=now() where org_id=$1 and person_id=$2',[org,b]);
  expect((await knownTo(t.db,a)).size).toBe(0);expect((await knownTo(t.db,b)).size).toBe(0);
 });
 it('is someone who has checked in on an outing with them, and not someone who was only in it',async()=>{
  const [a,b,c]=[await person('Ana'),await person('Ben'),await person('Cy')],listing=await event({startsAt:hours(0.2)});
  const {token}=await imIn(t.db,a,listing,NOW);
  await joinByToken(t.db,b,token,NOW);await joinByToken(t.db,c,token,NOW);
  await checkIn(t.db,a,listing,NOW);await checkIn(t.db,b,listing,NOW);
  expect([...await knownTo(t.db,a)]).toEqual([[b,'Went out with you']]);
  expect((await knownTo(t.db,c)).size).toBe(0);
 });
});

describe("saying I'm in",()=>{
 it('starts a new outing when nobody they know is going',async()=>{
  const [a,stranger]=[await person('Ana'),await person('Sam')],listing=await event();
  await imIn(t.db,stranger,listing,NOW);
  expect(await imIn(t.db,a,listing,NOW)).toMatchObject({joined:true});
  expect(await membersOf(listing)).toEqual([[stranger],[a]]);
 });
 it('joins the outing of someone who shares a group with them',async()=>{
  const [a,b]=[await person('Ana'),await person('Ben')],listing=await event();
  await group('Team 4',a,b);
  const first=await imIn(t.db,b,listing,NOW),second=await imIn(t.db,a,listing,NOW);
  expect(second.token).toBe(first.token);
  expect(await membersOf(listing)).toEqual([[a,b].sort()]);
 });
 it('with several, joins the one holding the most people they know',async()=>{
  const [a,b,c,d,e]=[await person('Ana'),await person('Ben'),await person('Cy'),await person('Di'),await person('Eve')],listing=await event();
  await group('Team 4',a,b);await group('Supper Club',a,c,d);
  const small=await imIn(t.db,b,listing,NOW);
  // Cy and Di know each other and not Ben, so they form a second outing.
  const big=await imIn(t.db,c,listing,NOW);await imIn(t.db,d,listing,NOW);
  expect(big.token).not.toBe(small.token);
  expect((await imIn(t.db,a,listing,NOW)).token).toBe(big.token);
  expect(await imIn(t.db,e,listing,NOW)).toMatchObject({joined:true});
  expect((await membersOf(listing)).map(members=>members.length)).toEqual([1,3,1]);
 });
 it('pressing twice changes nothing',async()=>{
  const a=await person('Ana'),listing=await event();
  const first=await imIn(t.db,a,listing,NOW);
  expect(await imIn(t.db,a,listing,NOW)).toEqual({token:first.token,joined:false});
  expect(await membersOf(listing)).toEqual([[a]]);
 });
 it('two people who join at once are both in',async()=>{
  const [a,b]=[await person('Ana'),await person('Ben')],listing=await event();
  await group('Team 4',a,b);
  await Promise.all([imIn(t.db,a,listing,NOW),imIn(t.db,b,listing,NOW)]);
  expect((await membersOf(listing)).flat().sort()).toEqual([a,b].sort());
  expect((await weekListings(t.db,await cornell(),NOW))[0].going).toBe(2);
 });
 it('is refused for an event that has ended, was hidden, or does not exist',async()=>{
  const a=await person('Ana'),ended=await event({startsAt:hours(-5),endsAt:hours(-4)}),hidden=await event();
  await t.db.query('update campus_listing set hidden_at=now() where id=$1',[hidden]);
  await refusal(imIn(t.db,a,ended,NOW));await refusal(imIn(t.db,a,hidden,NOW));
  await refusal(imIn(t.db,a,'00000000-0000-4000-8000-000000000000',NOW));
 });
 it('on a feed event is a registration kept in Loopd',async()=>{
  const a=await person('Ana'),campus=await cornell(),feed=await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url:'https://feeds.test/a.ics'});
  const {rows:[row]}=await t.db.query<{id:string}>("insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,starts_at) values($1,'feed',$2,'x1','Blitz night',$3) returning id",[campus.id,feed.id,hours(3).toISOString()]);
  await imIn(t.db,a,row.id,NOW);
  expect((await outingsOn(t.db,[row.id]))[0].members).toEqual([{personId:a,here:false,registered:true}]);
  const plain=await event();await imIn(t.db,a,plain,NOW);
  expect((await outingsOn(t.db,[plain]))[0].members[0].registered).toBe(false);
 });
});

describe('the share link',()=>{
 it('adds a person to that outing, and an unknown link leads nowhere',async()=>{
  const [a,b]=[await person('Ana'),await person('Sam')],listing=await event();
  const {token}=await imIn(t.db,a,listing,NOW);
  expect(await outingByToken(t.db,token)).toMatchObject({listingId:listing});
  expect(await joinByToken(t.db,b,token,NOW)).toEqual({listingId:listing,joined:true});
  expect(await joinByToken(t.db,b,token,NOW)).toEqual({listingId:listing,joined:false});
  expect(await membersOf(listing)).toEqual([[a,b].sort()]);
  expect(await outingByToken(t.db,'nosuchtokennosuch')).toBeNull();expect(await outingByToken(t.db,"x' or 1=1 --")).toBeNull();
  await refusal(joinByToken(t.db,b,'nosuchtokennosuch',NOW));
 });
 it('moves a person who was in another outing of the same event',async()=>{
  const [a,b]=[await person('Ana'),await person('Sam')],listing=await event();
  const first=await imIn(t.db,a,listing,NOW),second=await imIn(t.db,b,listing,NOW);
  expect(second.token).not.toBe(first.token);
  await joinByToken(t.db,b,first.token,NOW);
  // Sam's own outing is empty now and is gone; nobody is in two.
  expect(await membersOf(listing)).toEqual([[a,b].sort()]);
  expect(await outingByToken(t.db,second.token)).toBeNull();
 });
 it('does not move a person who has checked in with their first group',async()=>{
  const [a,b]=[await person('Ana'),await person('Sam')],listing=await event({startsAt:hours(0.1)});
  const first=await imIn(t.db,a,listing,NOW);await imIn(t.db,b,listing,NOW);await checkIn(t.db,b,listing,NOW);
  await refusal(joinByToken(t.db,b,first.token,NOW));
 });
});

describe('leaving',()=>{
 it('empties the seat, until the person has checked in',async()=>{
  const [a,b]=[await person('Ana'),await person('Sam')],listing=await event({startsAt:hours(0.1)});
  const {token}=await imIn(t.db,a,listing,NOW);await joinByToken(t.db,b,token,NOW);
  await leave(t.db,b,listing);
  expect(await membersOf(listing)).toEqual([[a]]);
  await checkIn(t.db,a,listing,NOW);
  await refusal(leave(t.db,a,listing));
  expect(await membersOf(listing)).toEqual([[a]]);
  await leave(t.db,b,listing);   // not in it: nothing to do
 });
});

describe('checking in',()=>{
 const setUp=async(startsAt:Date,endsAt:Date|null=null)=>{const a=await person('Ana'),listing=await event({startsAt,endsAt});await imIn(t.db,a,listing,new Date(startsAt.getTime()-86400000));return {a,listing};};
 it('works from 30 minutes before the start until the end',async()=>{
  const {a,listing}=await setUp(hours(1),hours(3));
  await refusal(checkIn(t.db,a,listing,new Date(hours(1).getTime()-31*60000)));
  expect(await checkIn(t.db,a,listing,new Date(hours(1).getTime()-30*60000))).toEqual({at:new Date(hours(1).getTime()-30*60000).toISOString()});
  const late=await setUp(hours(1),hours(3));
  await checkIn(t.db,late.a,late.listing,hours(3));
  const tooLate=await setUp(hours(1),hours(3));
  await refusal(checkIn(t.db,tooLate.a,tooLate.listing,new Date(hours(3).getTime()+60000)));
 });
 it('with no end time, works until two hours after the start',async()=>{
  // A plan at 5pm with no end: 6:30pm is inside, 7:01pm is not.
  const five=zoned('America/New_York','2026-11-18T17:00'),{a,listing}=await setUp(five);
  await refusal(checkIn(t.db,a,listing,zoned('America/New_York','2026-11-18T19:01')));
  expect(await checkIn(t.db,a,listing,zoned('America/New_York','2026-11-18T18:30'))).toEqual({at:zoned('America/New_York','2026-11-18T18:30').toISOString()});
 });
 it('is refused two hours early, and for someone who is not in the outing',async()=>{
  const {a,listing}=await setUp(hours(2)),outsider=await person('Sam');
  await refusal(checkIn(t.db,a,listing,NOW));
  await refusal(checkIn(t.db,outsider,listing,hours(2)));
 });
 it('a second press keeps the first time',async()=>{
  const {a,listing}=await setUp(hours(1));
  const first=await checkIn(t.db,a,listing,hours(1));
  expect(await checkIn(t.db,a,listing,hours(1.5))).toEqual(first);
 });
 describe('at an event with a known place',()=>{
  // Granny Annie's, Roosevelt Island. 0.001 of a degree of latitude is about 111 m.
  const BAR={lat:40.7617,lon:-73.9497},off=(metres:number,accuracy=10)=>({lat:BAR.lat+metres/110540,lon:BAR.lon,accuracy});
  let bar:string|null=null;beforeEach(async()=>{bar=null;await t.db.query('delete from campus_place');});
  const placed=async()=>{const s=await setUp(hours(1));const id=bar??=(await savePlace(t.db,{campusId:(await cornell()).id,name:"Granny Annie's",otherNames:[],...BAR})).id;
   await t.db.query('update campus_listing set place_id=$2 where id=$1',[s.listing,id]);return s;};
  it('needs where the person is, and says why',async()=>{
   const {a,listing}=await placed();
   await expect(checkIn(t.db,a,listing,hours(1))).rejects.toThrow(/location/i);
  });
  it('works within 150 metres of the place, and not further',async()=>{
   const near=await placed();
   expect(await checkIn(t.db,near.a,near.listing,hours(1),off(120))).toEqual({at:hours(1).toISOString()});
   const far=await placed();
   await expect(checkIn(t.db,far.a,far.listing,hours(1),off(600))).rejects.toThrow(/600 m from Granny Annie's/);
  });
  it('allows for a rough reading, up to 100 metres of it',async()=>{
   const rough=await placed();
   expect(await checkIn(t.db,rough.a,rough.listing,hours(1),off(220,80))).toEqual({at:hours(1).toISOString()});
   const tooRough=await placed();
   await refusal(checkIn(t.db,tooRough.a,tooRough.listing,hours(1),off(300,2000)));
  });
 });
 it('at an event with no known place, needs no location',async()=>{
  const {a,listing}=await setUp(hours(1));
  expect(await checkIn(t.db,a,listing,hours(1))).toEqual({at:hours(1).toISOString()});
 });
});

describe('inviting',()=>{
 const setUp=async()=>{
  const me=await person('Ana'),friends=[await person('Ben'),await person('Cy'),await person('Di'),await person('Eve'),await person('Fay')],stranger=await person('Sam'),listing=await event();
  await group('Team 4',me,...friends);
  const {token}=await imIn(t.db,me,listing,NOW);
  const choices=async()=>{const [outing]=(await outingsOn(t.db,[listing])).filter(o=>o.token===token);return inviteChoices(t.db,me,outing,await knownTo(t.db,me));};
  return {me,friends,stranger,listing,token,choices};
 };
 it('suggests up to four people they know who are not in, with how they are known',async()=>{
  const {friends,stranger,token,choices}=await setUp();
  await joinByToken(t.db,friends[0],token,NOW);await joinByToken(t.db,stranger,token,NOW);
  const shown=await choices();
  expect(shown).toHaveLength(4);
  expect(shown.map(choice=>choice.personId).sort()).toEqual(friends.slice(1).sort());
  for(const choice of shown)expect(choice).toMatchObject({why:'In Team 4',invited:false});
 });
 it('records an invite, shows it first, and takes it back',async()=>{
  const {me,friends,listing,choices}=await setUp();
  await invite(t.db,me,listing,friends[4]);await invite(t.db,me,listing,friends[4]);
  expect((await choices())[0]).toMatchObject({personId:friends[4],invited:true});
  expect((await t.db.query('select 1 from campus_invite')).rows).toHaveLength(1);
  await uninvite(t.db,me,listing,friends[4]);
  expect((await choices()).some(choice=>choice.invited)).toBe(false);
 });
 it('the invited person joins the outing they were invited to',async()=>{
  const {me,friends,listing,token}=await setUp(),other=await person('Gus');
  // Ben also knows Gus, who has an outing of his own with more of Ben's people in it.
  await group('Supper Club',friends[0],other,friends[1]);
  const elsewhere=await imIn(t.db,other,listing,NOW);await joinByToken(t.db,friends[1],elsewhere.token,NOW);
  await invite(t.db,me,listing,friends[0]);
  expect((await imIn(t.db,friends[0],listing,NOW)).token).toBe(token);
 });
 it('is refused for a stranger, and for someone who is not in the outing',async()=>{
  const {me,friends,stranger,listing}=await setUp();
  await refusal(invite(t.db,me,listing,stranger));
  await refusal(invite(t.db,friends[0],listing,me));
 });
 it('leaving takes back the invites the person sent',async()=>{
  const {me,friends,listing}=await setUp();
  await invite(t.db,me,listing,friends[0]);await leave(t.db,me,listing);
  expect((await t.db.query('select 1 from campus_invite')).rows).toHaveLength(0);
 });
});

describe('posting a plan',()=>{
 const local=(day:string,time:string)=>`2026-11-${day}T${time}`;
 it('puts it in the list at once, with the poster in and words that let "exercise" find it',async()=>{
  const campus=await cornell(),a=await person('Ana Lopez');
  await t.db.query("insert into campus_place(campus_id,name,lat,lon) values($1,'Arts Quad',42.4488,-76.4845)",[campus.id]);
  const plan=await postPlan(t.db,a,campus,{title:' Running ',starts:local('17','17:00'),place:'Arts Quad',about:'Easy pace.'},NOW);
  const [row]=await weekListings(t.db,campus,NOW);
  expect(row).toMatchObject({id:plan.id,origin:'member',title:'Running',startsAt:'2026-11-17T22:00:00.000Z',endsAt:null,postedBy:a,going:1,place:{name:'Arts Quad'},source:null});
  expect(row.words).toContain('exercise');
  const [outing]=await outingsOn(t.db,[plan.id]);
  expect(outing).toMatchObject({open:true,token:plan.token,members:[{personId:a,here:false,registered:false}]});
 });
 it('lets a stranger join its one outing from the screen',async()=>{
  const campus=await cornell(),[a,stranger]=[await person('Ana'),await person('Sam')];
  const plan=await postPlan(t.db,a,campus,{title:'Study group',starts:local('18','15:00')},NOW);
  expect((await imIn(t.db,stranger,plan.id,NOW)).token).toBe(plan.token);
  expect(await membersOf(plan.id)).toEqual([[a,stranger].sort()]);
 });
 it('refuses a missing title, a start that has passed, and a start more than 14 days ahead',async()=>{
  const campus=await cornell(),a=await person('Ana');
  await expect(postPlan(t.db,a,campus,{title:'  ',starts:local('18','15:00')},NOW)).rejects.toThrow('title');
  await expect(postPlan(t.db,a,campus,{title:'Run',starts:local('17','11:00')},NOW)).rejects.toThrow('not passed');
  await expect(postPlan(t.db,a,campus,{title:'Run',starts:'2026-12-07T17:00'},NOW)).rejects.toThrow('Plans can be up to 14 days ahead.');
  await expect(postPlan(t.db,a,campus,{title:'Run',starts:local('18','15:00'),ends:local('18','14:00')},NOW)).rejects.toThrow('end');
  await expect(postPlan(t.db,a,campus,{title:'Run',starts:'soon'},NOW)).rejects.toBeInstanceOf(CampusError);
  expect(await weekListings(t.db,campus,NOW)).toEqual([]);
  // Exactly 14 days ahead is allowed.
  await postPlan(t.db,a,campus,{title:'Run',starts:'2026-12-01T12:00'},NOW);
 });
 it('allows three upcoming plans and refuses a fourth, until one is cancelled or has passed',async()=>{
  const campus=await cornell(),a=await person('Ana'),who={personId:a,admin:false};
  const plans=[];for(const day of ['18','19','20'])plans.push(await postPlan(t.db,a,campus,{title:'Run',starts:local(day,'17:00')},NOW));
  await expect(postPlan(t.db,a,campus,{title:'Run',starts:local('21','17:00')},NOW)).rejects.toThrow('You have three plans coming up. Cancel one, or wait until one has passed.');
  await cancelPlan(t.db,who,plans[0].id,NOW);
  await postPlan(t.db,a,campus,{title:'Run',starts:local('21','17:00')},NOW);
  // On the 20th the plan of the 19th has passed, so there is room again.
  await postPlan(t.db,a,campus,{title:'Run',starts:local('22','17:00')},new Date('2026-11-20T12:00:00Z'));
 });
 it('lets the poster move the time, and the people in it stay in',async()=>{
  const campus=await cornell(),[a,b]=[await person('Ana'),await person('Sam')],who={personId:a,admin:false};
  const plan=await postPlan(t.db,a,campus,{title:'Running',starts:local('18','17:00')},NOW);
  await imIn(t.db,b,plan.id,NOW);
  expect(await editablePlan(t.db,who,plan.id,NOW)).toMatchObject({title:'Running',startsAt:'2026-11-18T22:00:00.000Z'});
  await changePlan(t.db,who,plan.id,{title:'Running',starts:local('18','18:00')},NOW);
  expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({startsAt:'2026-11-18T23:00:00.000Z',going:2});
 });
 it('cancelling takes it off the list',async()=>{
  const campus=await cornell(),a=await person('Ana');
  const plan=await postPlan(t.db,a,campus,{title:'Running',starts:local('18','17:00')},NOW);
  await cancelPlan(t.db,{personId:a,admin:false},plan.id,NOW);
  expect(await weekListings(t.db,campus,NOW)).toEqual([]);
 });
 it('refuses anyone else; the poster can no longer change it once it has started, nor cancel it once it is over; the admin still can',async()=>{
  const campus=await cornell(),[a,b]=[await person('Ana'),await person('Sam')];
  const plan=await postPlan(t.db,a,campus,{title:'Running',starts:local('18','17:00')},NOW),change={title:'Mine now',starts:local('18','18:00')};
  await refusal(changePlan(t.db,{personId:b,admin:false},plan.id,change,NOW));
  await refusal(cancelPlan(t.db,{personId:b,admin:false},plan.id,NOW));
  expect(await editablePlan(t.db,{personId:b,admin:false},plan.id,NOW)).toBeNull();
  const started=new Date('2026-11-18T22:30:00Z');
  await refusal(changePlan(t.db,{personId:a,admin:false},plan.id,{title:'Late',starts:local('19','18:00')},started));
  await refusal(cancelPlan(t.db,{personId:a,admin:false},plan.id,new Date('2026-11-19T00:30:00Z')));
  await cancelPlan(t.db,{personId:b,admin:true},plan.id,started);
  // An event the admin entered by hand is not a plan, and nobody changes it this way.
  const byHand=await event();
  await refusal(cancelPlan(t.db,{personId:b,admin:true},byHand,NOW));
 });
});
