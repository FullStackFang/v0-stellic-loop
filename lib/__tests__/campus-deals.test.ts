// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {CampusError} from '@/lib/campus/errors';
import {campusDeals,dealRewardIds,ensureDealDays,hideDeal,saveDeal,setDealHidden,type DealInput} from '@/lib/campus/deals';
import {findCampus,weekListings,type Campus} from '@/lib/campus/listings';
import {checkIn,imIn,joinByToken} from '@/lib/campus/outings';
import {campusRewards,useGroupReward} from '@/lib/campus/rewards';
import {campusScreen} from '@/lib/campus/screen';

// Spec: openspec/changes/campus-deals/specs/campus-deals.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_deal');await t.db.query('delete from campus_feed');});

const NISI={lat:40.76168,lon:-73.94994};   // on Main Street, Roosevelt Island
/** New York wall-clock time on a day: at('2026-11-23','17:02'). November is EST. */
const at=(day:string,time:string,offset='-05:00')=>new Date(`${day}T${time}:00${offset}`);
const MON='2026-11-23',TUE='2026-11-24',FRI='2026-11-27';
const tech=async()=>(await findCampus(t.db,'cornell-tech'))!;
async function nisi(where?:Campus){
 const campus=where??await tech();
 return (await t.db.query<{id:string}>(`insert into campus_place(campus_id,name,lat,lon,kind) values($1,'Nisi Bistro',$2,$3,'food')
  on conflict(campus_id,lower(name)) do update set lat=excluded.lat returning id`,[campus.id,NISI.lat,NISI.lon])).rows[0].id;
}
async function deal(over:Partial<DealInput>={},now=at(MON,'12:00')){
 const campus=await tech();
 return saveDeal(t.db,{campusId:campus.id,placeId:await nisi(campus),title:'Drinks at Nisi Bistro',line:'$2 off every drink',headCount:2,days:[0,1,2,3,4,5,6],from:'17:00',until:'19:00',
  note:'their daily happy hour, Roosevelt Islander Aug 2026',...over},now);
}
const days=async(dealId:string)=>(await t.db.query<{id:string;title:string;startsAt:string;endsAt:string;host:string;place:string;hidden:boolean}>(`select l.id,l.title,l.starts_at as "startsAt",l.ends_at as "endsAt",l.host_name as host,p.name as place,l.hidden_at is not null as hidden
 from campus_listing l join campus_place p on p.id=l.place_id where l.deal_id=$1 order by l.starts_at`,[dealId])).rows;
const rewardsOn=async(listingId:string)=>(await campusRewards(t.db,(await tech()).id,true)).filter(reward=>reward.listingId===listingId);
const refused=(run:Promise<unknown>,message:string)=>expect(run).rejects.toThrow(message);

describe('the admin enters a deal once',()=>{
 it('saves a deal and lists it with its place, line, size, days, hours and note',async()=>{
  const {id}=await deal();
  expect(await campusDeals(t.db,(await tech()).id)).toEqual([{id,placeId:expect.any(String),place:'Nisi Bistro',title:'Drinks at Nisi Bistro',line:'$2 off every drink',headCount:2,
   days:[0,1,2,3,4,5,6],from:'17:00',until:'19:00',note:'their daily happy hour, Roosevelt Islander Aug 2026',hidden:false}]);
 });
 it('refuses a deal with no days, until not after from, a size outside 2 to 4, no name or line, or a place elsewhere',async()=>{
  await refused(deal({days:[]}),'Pick at least one day.');
  await refused(deal({from:'19:00',until:'17:00'}),'The until time must be after the from time.');
  await refused(deal({from:'17:00',until:'17:00'}),'The until time must be after the from time.');
  await refused(deal({headCount:1}),'2, 3 or 4');
  await refused(deal({headCount:5}),'2, 3 or 4');
  await refused(deal({title:' '}),'Give the activity a name.');
  await refused(deal({line:''}),'Say what the deal is');
  await refused(deal({placeId:await nisi((await findCampus(t.db,'cornell'))!)}),'Pick a place on this campus.');
  await expect(deal({days:[]})).rejects.toBeInstanceOf(CampusError);
  expect(await campusDeals(t.db,(await tech()).id)).toEqual([]);
 });
});

describe('each running day becomes one activity with a group reward',()=>{
 it('makes Monday once, however often the page is read',async()=>{
  const {id}=await deal(),campus=await tech();
  expect(await ensureDealDays(t.db,campus,at(MON,'12:00'))).toBe(true);
  await ensureDealDays(t.db,campus,at(MON,'17:30'));
  const made=await days(id);
  expect(made).toEqual([{id:expect.any(String),title:'Drinks at Nisi Bistro',startsAt:'2026-11-23T22:00:00.000Z',endsAt:'2026-11-24T00:00:00.000Z',host:'Nisi Bistro',place:'Nisi Bistro',hidden:false}]);
  expect(await rewardsOn(made[0].id)).toEqual([expect.objectContaining({kind:'group',giver:'Nisi Bistro',headCount:2,texts:['$2 off every drink',null,null],hostName:null})]);
 });
 it('makes nothing on a day the deal does not run, nor for a hidden deal',async()=>{
  const friday=await deal({days:[5]}),campus=await tech();
  await ensureDealDays(t.db,campus,at(TUE,'17:30'));
  expect(await days(friday.id)).toEqual([]);
  await hideDeal(t.db,campus.id,friday.id,at(FRI,'09:00'));
  await ensureDealDays(t.db,campus,at(FRI,'17:30'));
  expect(await days(friday.id)).toEqual([]);
 });
 it('keeps the wall-clock hours across the change from summer time',async()=>{
  const {id}=await deal({days:[5]}),campus=await tech();
  await ensureDealDays(t.db,campus,at('2026-10-30','12:00','-04:00'));
  await ensureDealDays(t.db,campus,at('2026-11-06','12:00'));
  expect((await days(id)).map(day=>[day.startsAt,day.endsAt])).toEqual([['2026-10-30T21:00:00.000Z','2026-10-30T23:00:00.000Z'],['2026-11-06T22:00:00.000Z','2026-11-07T00:00:00.000Z']]);
 });
 it('makes the day on the campus clock: late Monday night in New York is still Monday',async()=>{
  const {id}=await deal({days:[1]});
  await ensureDealDays(t.db,await tech(),new Date('2026-11-24T04:30:00Z'));   // 11:30pm Monday in New York, Tuesday in UTC
  expect((await days(id)).map(day=>day.startsAt)).toEqual(['2026-11-23T22:00:00.000Z']);
 });
});

describe('a deal shows only while it runs',()=>{
 it('is out of the list at 4:59pm, in at 5:02pm, and out again at 7:00pm',async()=>{
  const {id}=await deal(),campus=await tech(),listed=async(now:Date)=>{await ensureDealDays(t.db,campus,now);return (await weekListings(t.db,campus,now)).filter(each=>each.dealId===id).map(each=>each.title);};
  expect(await listed(at(MON,'16:59'))).toEqual([]);
  expect(await listed(at(MON,'17:02'))).toEqual(['Drinks at Nisi Bistro']);
  expect(await listed(at(MON,'19:00'))).toEqual([]);
 });
});

describe('edits and hiding',()=>{
 it("an edit reaches today's title and line while nobody has used it; its hours wait for the next day",async()=>{
  const {id}=await deal(),campus=await tech();
  await ensureDealDays(t.db,campus,at(MON,'17:10'));
  await deal({id,title:'Date night at Nisi',line:'Two glasses, one price',from:'18:00'},at(MON,'17:20'));
  const [today]=await days(id);
  expect(today).toMatchObject({title:'Date night at Nisi',startsAt:'2026-11-23T22:00:00.000Z'});
  expect((await rewardsOn(today.id))[0].texts[0]).toBe('Two glasses, one price');
  await ensureDealDays(t.db,campus,at(TUE,'12:00'));
  expect((await days(id))[1]).toMatchObject({title:'Date night at Nisi',startsAt:'2026-11-24T23:00:00.000Z'});
 });
 it('leaves a day whose reward was used as it was',async()=>{
  const {id}=await deal(),campus=await tech(),now=at(MON,'17:30');
  await ensureDealDays(t.db,campus,now);
  const [today]=await days(id),ana=(await makePerson(t.db,'Ana')).id,maya=(await makePerson(t.db,'Maya')).id,here={...NISI,accuracy:10};
  const {token}=await imIn(t.db,ana,today.id,now);await joinByToken(t.db,maya,token,now);
  await checkIn(t.db,ana,today.id,now,here);await checkIn(t.db,maya,today.id,now,here);
  await useGroupReward(t.db,ana,today.id);
  await deal({id,line:'Something else'},at(MON,'17:40'));
  expect((await rewardsOn(today.id))[0].texts[0]).toBe('$2 off every drink');
 });
 it("hiding takes today's activity off at once, and nothing is made the next day",async()=>{
  const {id}=await deal(),campus=await tech();
  await ensureDealDays(t.db,campus,at(MON,'17:10'));
  await hideDeal(t.db,campus.id,id,at(MON,'17:30'));
  expect((await weekListings(t.db,campus,at(MON,'17:31'))).filter(each=>each.dealId===id)).toEqual([]);
  await ensureDealDays(t.db,campus,at(TUE,'17:10'));
  expect(await days(id)).toHaveLength(1);
  expect((await campusDeals(t.db,campus.id))[0].hidden).toBe(true);
  await setDealHidden(t.db,campus.id,id,false,at(MON,'17:40'));
  expect((await weekListings(t.db,campus,at(MON,'17:41'))).filter(each=>each.dealId===id)).toHaveLength(1);
 });
 it("the rewards made for deals' days are the ones the Rewards list leaves out",async()=>{
  const {id}=await deal(),campus=await tech();
  await ensureDealDays(t.db,campus,at(MON,'17:10'));
  const [today]=await days(id);
  expect([...await dealRewardIds(t.db,campus.id)]).toEqual((await rewardsOn(today.id)).map(reward=>reward.id));
 });
});

describe('on the campus page',()=>{
 const show=async(personId:string|null,now:Date)=>campusScreen(t.db,await tech(),personId?{personId,admin:false}:null,{now,photos:async()=>({})});
 it("makes today's day on the first read, and its ticket carries the deal, never the note",async()=>{
  await deal();
  const ana=(await makePerson(t.db,'Ana')).id,page=await show(ana,at(MON,'17:02')),ticket=page.tickets.find(each=>each.title==='Drinks at Nisi Bistro')!;
  expect(ticket.deal).toEqual({line:'$2 off every drink',need:2,until:'until 7pm'});
  expect(ticket.map).toMatchObject({name:'Nisi Bistro',...NISI});
  const json=JSON.stringify(page);
  expect(json).not.toContain('Roosevelt Islander');
  expect(json.toLowerCase()).not.toContain('happy hour');
  expect((await show(ana,at(MON,'16:59'))).tickets.some(each=>each.deal)).toBe(false);
 });
 it('unlocks through the existing group reward: in is not unlocked, two check-ins at the place are',async()=>{
  await deal();
  const now=at(MON,'17:44'),page=await show(null,now),id=page.tickets.find(each=>each.deal)!.id;
  const ana=(await makePerson(t.db,'Ana')).id,maya=(await makePerson(t.db,'Maya')).id;
  const {token}=await imIn(t.db,ana,id,now);await joinByToken(t.db,maya,token,now);
  expect((await show(ana,now)).tickets.find(each=>each.id===id)!.stub).toMatchObject({kind:'group',say:'0 of 2 checked in'});
  await expect(checkIn(t.db,ana,id,now,{lat:40.7553,lon:-73.9565,accuracy:10})).rejects.toThrow('Nisi Bistro');
  await checkIn(t.db,ana,id,now,{...NISI,accuracy:10});await checkIn(t.db,maya,id,now,{...NISI,accuracy:10});
  const mine=await show(ana,now);
  expect(mine.tickets.find(each=>each.id===id)!.stub).toMatchObject({say:'Unlocked for your group',state:'met'});
  expect(mine.live).toMatchObject({listingId:id,text:'$2 off every drink',usedAt:null});
 });
});

describe('before the migration',()=>{
 it('makes nothing and reads nothing more when the deals table is missing',async()=>{
  vi.resetModules();
  const {ensureDealDays:fresh}=await import('@/lib/campus/deals');
  const asked:string[]=[],q={query:async(text:string)=>{asked.push(text);return {rows:[{ok:false}]} as never;}};
  expect(await fresh(q,{id:'x',tz:'America/New_York'},at(MON,'17:02'))).toBe(false);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain("to_regclass('campus_deal')");
 });
});
