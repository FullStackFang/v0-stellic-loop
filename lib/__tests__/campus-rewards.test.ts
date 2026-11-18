// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {CampusError} from '@/lib/campus/errors';
import {LEVELS,levelOf,textFor} from '@/lib/campus/levels';
import {findCampus} from '@/lib/campus/listings';
import {addHandListing} from '@/lib/campus/manage';
import {checkIn,imIn,joinByToken} from '@/lib/campus/outings';
import {campusRewards,countedOutings,groupRewardFor,levelFor,progress,saveReward,setRewardHidden,useBuildingReward,useGroupReward,type Reward} from '@/lib/campus/rewards';
import {fit,meant,pick,type Findable} from '@/lib/campus/search';

// Specs: openspec/changes/loop-campus-rewards/specs/group-rewards, member-levels, campus-search and outings ("Outings that count").
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('delete from campus_place');});

const TZ='America/New_York',NOW=new Date('2026-11-17T17:00:00Z');   // noon on Tuesday in New York
const days=(n:number)=>new Date(NOW.getTime()+n*86400000);
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const person=async(name='P')=>(await makePerson(t.db,name)).id;
const event=async(over:{title?:string;at?:Date;host?:string;place?:string}={})=>(await addHandListing(t.db,{campusId:(await cornell()).id,title:over.title??'Study group',startsAt:(over.at??NOW).toISOString(),host:over.host,place:over.place})).id;
/** One outing on a new event: everyone in `people` is in, and those in `here` check in. */
async function outing(people:string[],here:string[],over:Parameters<typeof event>[0]={}) {
 const at=over.at??NOW,listing=await event({...over,at});
 const {token}=await imIn(t.db,people[0],listing,at);
 for(const id of people.slice(1))await joinByToken(t.db,id,token,at);
 for(const id of here)await checkIn(t.db,id,listing,at);
 return listing;
}
const group=async(over:Partial<Parameters<typeof saveReward>[1]>={})=>saveReward(t.db,{campusId:(await cornell()).id,giver:'Northside Coffee',kind:'group',texts:['A drink and a pastry, $4.50 each'],headCount:3,...over});
const building=async(over:Partial<Parameters<typeof saveReward>[1]>={})=>saveReward(t.db,{campusId:(await cornell()).id,giver:'Collegetown Bagels',kind:'building',texts:['$5 off any order'],rule:'outings',ruleCount:10,...over});
const rewards=async()=>campusRewards(t.db,(await cornell()).id);
const one=async(id:string)=>(await campusRewards(t.db,(await cornell()).id,true)).find(reward=>reward.id===id)!;
const refusal=(run:Promise<unknown>)=>expect(run).rejects.toBeInstanceOf(CampusError);

describe('rewards entered by the admin',()=>{
 it('a group reward names a giver, a head count of two or more, and rides on one event or on a host name',async()=>{
  const listing=await event();
  const onEvent=await group({listingId:listing,texts:['$4.50 each','$4.00 each','']});
  expect(await one(onEvent.id)).toMatchObject({giver:'Northside Coffee',kind:'group',texts:['$4.50 each','$4.00 each',null],listingId:listing,hostName:null,headCount:3,rule:null,hidden:false});
  const onHost=await group({hostName:'Chess Club',headCount:2});
  expect(await one(onHost.id)).toMatchObject({hostName:'Chess Club',listingId:null,headCount:2});
  await refusal(group({listingId:listing,headCount:1}));
  await refusal(group({listingId:listing,hostName:'Chess Club'}));
  await refusal(group({}));
  await refusal(group({listingId:listing,texts:['',' ']}));
  await refusal(group({listingId:listing,giver:' '}));
  await refusal(group({listingId:'00000000-0000-4000-8000-000000000000'}));
 });
 it('a building reward names a giver, a text and one of three rules',async()=>{
  expect(await one((await building()).id)).toMatchObject({kind:'building',rule:'outings',ruleCount:10,ruleWord:null,headCount:null});
  expect(await one((await building({rule:'word',ruleCount:5,ruleWord:'Run'})).id)).toMatchObject({rule:'word',ruleCount:5,ruleWord:'run'});
  expect(await one((await building({rule:'weeks',ruleCount:3})).id)).toMatchObject({rule:'weeks',ruleCount:3,ruleWord:null});
  await refusal(building({rule:'word',ruleCount:5}));
  await refusal(building({rule:'streak',ruleCount:5}));
  await refusal(building({rule:'outings',ruleCount:0}));
 });
 it('is changed and hidden, and a hidden reward stops showing',async()=>{
  const listing=await event(),reward=await group({listingId:listing});
  await group({id:reward.id,listingId:listing,headCount:4,texts:['Free refills']});
  expect(await one(reward.id)).toMatchObject({headCount:4,texts:['Free refills',null,null]});
  await setRewardHidden(t.db,reward.id,true);
  expect(await rewards()).toEqual([]);
  expect((await one(reward.id)).hidden).toBe(true);
  await setRewardHidden(t.db,reward.id,false);
  expect(await rewards()).toHaveLength(1);
 });
});

describe('levels',()=>{
 it('are Member from 0, Regular from 5 and Insider from 15',()=>{
  expect(LEVELS.map(level=>[level.name,level.from])).toEqual([['Member',0],['Regular',5],['Insider',15]]);
  expect([0,4,5,14,15,40].map(levelOf)).toEqual([0,0,1,1,2,2]);
 });
 it("a reward's text is the level's own, else the nearest lower one, else none",()=>{
  expect(textFor(['$4.50','$4.00',null],0)).toBe('$4.50');
  expect(textFor(['$4.50','$4.00',null],1)).toBe('$4.00');
  expect(textFor(['$4.50','$4.00',null],2)).toBe('$4.00');
  expect(textFor([null,'Regulars only',null],0)).toBeNull();
  expect(textFor([null,null,'Insiders only'],1)).toBeNull();
 });
 it('a reward with no text at or below a level is passed over for that level',async()=>{
  const listing=await event({host:'Chess Club'});
  await group({hostName:'Chess Club',texts:['Skip the door']});
  await group({listingId:listing,texts:[null,'A board held for you']});
  const all=await rewards(),here={id:listing,host:'Chess Club'};
  // A Member cannot have the event's own reward, so they are shown the host's; a Regular gets the event's own.
  expect(groupRewardFor(all,here,0)?.text).toBe('Skip the door');
  expect(groupRewardFor(all,here,1)?.text).toBe('A board held for you');
  expect(groupRewardFor(all.filter(reward=>reward.listingId),here,0)).toBeNull();
  expect(groupRewardFor(all,{id:'other',host:'chess club '},0)?.text).toBe('Skip the door');
  expect(groupRewardFor(all,{id:'other',host:null},2)).toBeNull();
 });
 it('count only outings where someone else of the same outing checked in too',async()=>{
  const [a,b,c]=[await person(),await person(),await person()];
  await outing([a,b],[a,b]);                    // counts for both
  await outing([a,b],[a]);                      // alone: does not count
  await outing([a],[a]);                        // alone
  await outing([a,b,c],[b,c]);                  // a did not check in
  expect(await levelFor(t.db,a)).toEqual({level:0,outings:1});
  expect(await levelFor(t.db,b)).toEqual({level:0,outings:2});
  expect((await countedOutings(t.db,a))[0].others).toEqual([b]);
 });
 it('the fifth counted outing makes a Regular, and an outing alone does not',async()=>{
  const [a,b]=[await person(),await person()];
  for(let n=0;n<4;n++)await outing([a,b],[a,b]);
  await outing([a,b],[a]);
  expect(await levelFor(t.db,a)).toEqual({level:0,outings:4});
  await outing([a,b],[a,b]);
  expect(await levelFor(t.db,a)).toEqual({level:1,outings:5});
 });
 it('two outings on the same event never add up',async()=>{
  const [a,b,c,d]=[await person(),await person(),await person(),await person()],listing=await event();
  const first=await imIn(t.db,a,listing,NOW);await joinByToken(t.db,b,first.token,NOW);
  const second=await imIn(t.db,c,listing,NOW);await joinByToken(t.db,d,second.token,NOW);
  for(const id of [a,b,c,d])await checkIn(t.db,id,listing,NOW);
  await group({listingId:listing,headCount:3});
  await refusal(useGroupReward(t.db,a,listing));await refusal(useGroupReward(t.db,c,listing));
 });
});

describe('a group reward',()=>{
 it('unlocks when the head count of one outing has checked in, for those who checked in',async()=>{
  const [a,b,c,d]=[await person(),await person(),await person(),await person()];
  const listing=await outing([a,b,c,d],[a,b]);
  await group({listingId:listing,headCount:3});
  await refusal(useGroupReward(t.db,a,listing));           // two of three
  await checkIn(t.db,c,listing,NOW);
  await refusal(useGroupReward(t.db,d,listing));           // in, but has not checked in
  await refusal(useGroupReward(t.db,await person(),listing)); // not in the outing
  const used=await useGroupReward(t.db,a,listing);
  expect(Date.parse(used.usedAt)).toBeGreaterThan(0);
 });
 it('is marked used once: a second mark, or two at once, keep the first time',async()=>{
  const [a,b,c]=[await person(),await person(),await person()];
  const listing=await outing([a,b,c],[a,b,c]);
  const reward=await group({listingId:listing});
  const [first,second]=await Promise.all([useGroupReward(t.db,a,listing),useGroupReward(t.db,b,listing)]);
  expect(second).toEqual(first);
  expect(await useGroupReward(t.db,c,listing)).toEqual(first);
  expect((await t.db.query('select 1 from campus_reward_use where reward_id=$1',[reward.id])).rows).toHaveLength(1);
 });
 it('that was used keeps what was used after the admin hides it',async()=>{
  const [a,b]=[await person(),await person()],listing=await outing([a,b],[a,b]);
  const reward=await group({listingId:listing,headCount:2});
  const used=await useGroupReward(t.db,a,listing);
  await setRewardHidden(t.db,reward.id,true);
  const {rows}=await t.db.query<{usedAt:string;giver:string}>('select u.used_at as "usedAt",r.giver from campus_reward_use u join campus_reward r on r.id=u.reward_id');
  expect(rows).toEqual([{usedAt:used.usedAt,giver:'Northside Coffee'}]);
  await refusal(useGroupReward(t.db,b,await outing([a,b],[a,b])));   // no reward on that other event
 });
});

describe('a building reward',()=>{
 const reward=async(id:string)=>one(id);
 it('by any outings: counts every counted outing',async()=>{
  const [a,b]=[await person(),await person()],made=await building({ruleCount:3});
  for(let n=0;n<2;n++)await outing([a,b],[a,b]);
  await outing([a,b],[a]);
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:2,need:3,earned:false});
  await outing([a,b],[a,b]);await outing([a,b],[a,b]);
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:3,need:3,earned:true});
 });
 it('by a word: counts outings on events carrying it, so three runs are 3 of 5',async()=>{
  const [a,b]=[await person(),await person()],made=await building({giver:'Finger Lakes Running Co.',texts:['20% off Brooks running shoes'],rule:'word',ruleCount:5,ruleWord:'run'});
  for(let n=0;n<3;n++)await outing([a,b],[a,b],{title:'Sunset run'});
  await outing([a,b],[a,b],{title:'Dumpling night'});
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:3,need:5,earned:false});
  await outing([a,b],[a,b],{title:'Saturday long run'});await outing([a,b],[a,b],{title:'5K run'});
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:5,need:5,earned:true});
 });
 it('by weeks: the same group at the giver\'s events in each of three weeks running',async()=>{
  const [a,b,c]=[await person(),await person(),await person()],made=await building({giver:'Northside Coffee',texts:['A free drink each'],rule:'weeks',ruleCount:3});
  const at=(week:number)=>({at:days(-7*week),place:'Northside Coffee'});
  await outing([a,b],[a,b],at(2));await outing([a,b],[a,b],at(1));
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:2,need:3,earned:false});
  // A third week with someone else is not the same group.
  await outing([a,c],[a,c],at(0));
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toMatchObject({done:2,earned:false});
  await outing([a,b],[a,b],at(0));
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:3,need:3,earned:true});
  expect(progress(await reward(made.id),await countedOutings(t.db,b),TZ,NOW).earned).toBe(true);
  expect(progress(await reward(made.id),await countedOutings(t.db,c),TZ,NOW)).toEqual({done:1,need:3,earned:false});
  // Outings somewhere else do not count toward the giver's weeks.
  const [d,e]=[await person(),await person()];
  for(const week of [2,1,0])await outing([d,e],[d,e],{at:days(-7*week),place:'Another cafe'});
  expect(progress(await reward(made.id),await countedOutings(t.db,d),TZ,NOW)).toEqual({done:0,need:3,earned:false});
 });
 it('by weeks: a missed week starts the count again',async()=>{
  const [a,b]=[await person(),await person()],made=await building({giver:'Northside Coffee',rule:'weeks',ruleCount:3});
  await outing([a,b],[a,b],{at:days(-14),host:'Northside Coffee'});await outing([a,b],[a,b],{at:days(0),host:'Northside Coffee'});
  expect(progress(await reward(made.id),await countedOutings(t.db,a),TZ,NOW)).toEqual({done:1,need:3,earned:false});
  // Last week and the week before, nothing yet this week: the run is still alive.
  const [c,d]=[await person(),await person()];
  await outing([c,d],[c,d],{at:days(-14),host:'Northside Coffee'});await outing([c,d],[c,d],{at:days(-7),host:'Northside Coffee'});
  expect(progress(await reward(made.id),await countedOutings(t.db,c),TZ,NOW)).toMatchObject({done:2});
  // Two weeks with nothing: the run is over.
  expect(progress(await reward(made.id),await countedOutings(t.db,c),TZ,days(14))).toMatchObject({done:0});
 });
 it('once earned is marked used once, and not before it is earned',async()=>{
  const [a,b]=[await person(),await person()],made=await building({ruleCount:2});
  await outing([a,b],[a,b]);
  await refusal(useBuildingReward(t.db,a,made.id,{id:(await cornell()).id,tz:TZ},NOW));
  await outing([a,b],[a,b]);
  const [first,second]=await Promise.all([useBuildingReward(t.db,a,made.id,{id:(await cornell()).id,tz:TZ},NOW),useBuildingReward(t.db,a,made.id,{id:(await cornell()).id,tz:TZ},NOW)]);
  expect(second).toEqual(first);
  expect((await t.db.query('select 1 from campus_reward_use')).rows).toHaveLength(1);
  // The other person earned it too, and uses their own.
  expect((await useBuildingReward(t.db,b,made.id,{id:(await cornell()).id,tz:TZ},NOW)).usedAt).toBeTruthy();
  expect((await t.db.query('select 1 from campus_reward_use')).rows).toHaveLength(2);
  await refusal(useBuildingReward(t.db,a,(await group({hostName:'X'})).id,{id:(await cornell()).id,tz:TZ},NOW));
 });
 it('that exists only for a higher level cannot be used by a lower one',async()=>{
  const [a,b]=[await person(),await person()],made=await building({ruleCount:1,texts:[null,null,'Insiders: a free bagel']});
  await outing([a,b],[a,b]);
  await refusal(useBuildingReward(t.db,a,made.id,{id:(await cornell()).id,tz:TZ},NOW));
 });
});

describe('search',()=>{
 const item=(id:string,title:string,words:string,over:Partial<Findable>={}):Findable=>({id,title,host:null,place:null,source:null,words:words.split(' '),pull:0,...over});
 const week=[
  item('run','Sunset run, easy 5K','run exercise workout active fitness cardio outside today tonight',{pull:5}),
  item('hoops','Pickup basketball','exercise workout active sport game play team today tonight',{pull:7}),
  item('chess','Blitz night','game games play indoor chill today tonight',{source:'CampusGroups',host:'Chess Club',pull:3}),
  item('bao','Dumpling night','food eat hungry social people today tonight',{place:'Bao House',pull:6}),
  item('resume','Resume drop-in','career job jobs internship network',{source:'CampusGroups',host:'Career Services'}),
  item('dance','Ballroom open floor','dance exercise active music social',{source:'CampusGroups',host:'Ballroom Dance Club'}),
  item('demo','Demo night','startup startups founders build network career',{source:'Luma',host:'Ithaca builders',pull:1}),
  item('hike','Sunrise hike','exercise active outside outdoors nature walk morning',{source:'CampusGroups',host:'Outing Club',pull:4}),
 ];
 it('drops filler words',()=>{
  expect(meant('something to eat with people')).toEqual(['eat','people']);
  expect(meant('  I want to GO for a run!! ')).toEqual(['run']);
  expect(meant('the')).toEqual([]);
 });
 it('scores a word in the title, host or place above a good-for word',()=>{
  expect(fit(week[0],'run')).toBe(3);expect(fit(week[0],'exercise')).toBe(2);expect(fit(week[0],'running outside')).toBe(4);
  expect(fit(week[3],'bao')).toBe(3);expect(fit(week[2],'chess')).toBe(3);
  expect(fit(week[4],'exercise')).toBe(0);expect(fit(week[0],'ex')).toBe(0);
 });
 it('meaning finds different activities: a run, a hike and a pickup game, and not a resume drop-in',()=>{
  const found=pick(week,'exercise','best','CampusGroups');
  expect([...found.best,...found.rest].sort()).toEqual(['dance','hike','hoops','run']);
 });
 it('with nothing typed, shows the five with the most pull in time order, then the rest after a marker',()=>{
  const found=pick(week,'','best','CampusGroups');
  expect(found).toEqual({best:['run','hoops','chess','bao','hike'],rest:['resume','dance','demo'],line:'Your best 5 of 8 this week',marker:'3 more this week',nothing:false});
  const fourteen=Array.from({length:14},(_,n)=>item(`e${n}`,`Event ${n}`,'social',{pull:n}));
  expect(pick(fourteen,'  ','best','CampusGroups')).toMatchObject({line:'Your best 5 of 14 this week',marker:'9 more this week'});
 });
 it('with five or fewer events shows them all and no marker',()=>{
  expect(pick(week.slice(0,4),'','best','CampusGroups')).toEqual({best:['run','hoops','chess','bao'],rest:[],line:'4 events this week',marker:null,nothing:false});
  expect(pick([],'','best','CampusGroups')).toMatchObject({best:[],nothing:true,line:'Nothing on this week yet'});
 });
 it('with something typed, shows at most four best matches within 60% of the top, then the looser ones',()=>{
  // Ranks: hoops 2*2+7=11, run 9, hike 8, dance 4. 60% of 11 is 6.6, so dance is a looser match.
  expect(pick(week,'exercise','best','CampusGroups')).toEqual({best:['hoops','run','hike'],rest:['dance'],line:'3 best matches for “exercise”',marker:'1 looser match',nothing:false});
  const many=Array.from({length:7},(_,n)=>item(`e${n}`,`Run ${n}`,'run',{pull:n<5?3:0}));
  const found=pick(many,'run','best','CampusGroups');
  expect(found.best).toHaveLength(4);expect(found.rest).toHaveLength(3);
  expect(found).toMatchObject({line:'4 best matches for “run”',marker:'3 looser matches'});
  expect(pick(week,'bao','best','CampusGroups')).toMatchObject({best:['bao'],rest:[],line:'1 best match for “bao”',marker:null});
 });
 it('says when nothing matches',()=>{
  expect(pick(week,'quidditch','best','CampusGroups')).toEqual({best:[],rest:[],line:'Nothing for “quidditch”',marker:null,nothing:true});
 });
 it('the complete view is every event of the source in time order, or every one that matches, with no best and no marker',()=>{
  expect(pick(week,'','all','CampusGroups')).toEqual({best:['chess','resume','dance','hike'],rest:[],line:'All 4 CampusGroups events this week',marker:null,nothing:false});
  expect(pick(week,'exercise','all','CampusGroups')).toEqual({best:['dance','hike'],rest:[],line:'2 on CampusGroups for “exercise”',marker:null,nothing:false});
  expect(pick(week,'','all','NYU Engage')).toMatchObject({best:[],nothing:true});
 });
});
