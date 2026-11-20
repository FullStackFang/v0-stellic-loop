// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {isAdmin} from '@/lib/campus/admin';
import {parseFeed,readFeeds} from '@/lib/campus/import';
import {findCampus,weekListings} from '@/lib/campus/listings';
import {addCampus,addFeed,addHandListing,setFeedOn,setHidden,setWords} from '@/lib/campus/manage';
import {matchPlace,savePlace} from '@/lib/campus/places';
import {localParts,zoned} from '@/lib/campus/time';
import {goodFor} from '@/lib/campus/words';

// Specs: openspec/changes/loop-campus-rewards/specs/campus-listings, campus-search (good-for words), admin-gate (one admin).
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query("delete from campus_feed");await t.db.query("delete from campus_place");await t.db.query("delete from campus where slug not in ('cornell','columbia','nyu','cuny')");});
afterEach(()=>{vi.unstubAllEnvs();});

const sample=(name:string)=>readFileSync(join(process.cwd(),'test','fixtures','campus',name),'utf8');
const NOW=new Date('2026-11-17T12:00:00Z');
const cornell=async()=>(await findCampus(t.db,'cornell'))!;
const hours=(n:number)=>new Date(NOW.getTime()+n*3600000).toISOString();
const hand=async(over:Partial<Parameters<typeof addHandListing>[1]>={})=>addHandListing(t.db,{campusId:(await cornell()).id,title:'Board games',startsAt:hours(3),...over});
const titles=async()=>(await weekListings(t.db,await cornell(),NOW)).map(row=>row.title);

describe('the four schools',()=>{
 it('exist after the migration, each with its domain',async()=>{
  const {rows}=await t.db.query<{slug:string;domains:string[]}>('select slug,domains from campus order by slug');
  expect(rows).toEqual([{slug:'columbia',domains:['columbia.edu']},{slug:'cornell',domains:['cornell.edu']},{slug:'cuny',domains:['cuny.edu']},{slug:'nyu',domains:['nyu.edu']}]);
 });
 it('an unknown campus is not found, and the admin page address cannot be a campus',async()=>{
  expect(await findCampus(t.db,'nowhere')).toBeNull();
  expect(await findCampus(t.db,'Cornell')).toBeNull();
  await expect(addCampus(t.db,{slug:'admin',name:'Admin',tz:'America/New_York',domains:['admin.edu']})).rejects.toThrow();
 });
 it('adding a school is adding a campus and its domains',async()=>{
  await addCampus(t.db,{slug:'ithaca-college',name:'Ithaca College',tz:'America/New_York',domains:['Ithaca.edu ']});
  expect(await findCampus(t.db,'ithaca-college')).toMatchObject({name:'Ithaca College',domains:['ithaca.edu'],listSource:'CampusGroups'});
  await expect(addCampus(t.db,{slug:'x',name:'X',tz:'Mars/Olympus',domains:['x.edu']})).rejects.toThrow('timezone');
 });
});

describe('one list for a campus',()=>{
 it('holds feed events, posted plans and hand-entered events together, in time order',async()=>{
  const campus=await cornell(),poster=await makePerson(t.db,'Maya Lin');
  const feed=await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url:'https://feeds.test/a.ics'});
  await t.db.query("insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,host_name,starts_at) values($1,'feed',$2,'x1','Blitz night','Chess Club',$3)",[campus.id,feed.id,hours(2)]);
  await t.db.query("insert into campus_listing(campus_id,origin,title,starts_at,posted_by) values($1,'member','Sunset run',$2,$3)",[campus.id,hours(26),poster.id]);
  await hand({title:'Resume drop-in',startsAt:hours(75)});
  const rows=await weekListings(t.db,campus,NOW);
  expect(rows.map(row=>[row.title,row.origin,row.source])).toEqual([['Blitz night','feed','CampusGroups'],['Sunset run','member',null],['Resume drop-in','hand',null]]);
  expect(rows[0]).toMatchObject({host:'Chess Club',going:0,postedBy:null});
  expect(rows[1].postedBy).toBe(poster.id);
 });
 it('counts the people who are in',async()=>{
  const listing=await hand(),a=await makePerson(t.db),b=await makePerson(t.db);
  const {rows:[outing]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'tokentokentoken01') returning id",[listing.id]);
  for(const person of [a,b])await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)',[outing.id,listing.id,person.id]);
  expect((await weekListings(t.db,await cornell(),NOW))[0].going).toBe(2);
 });
 it('leaves out hidden, cancelled and ended events, and events past the seventh day',async()=>{
  const hidden=await hand({title:'Hidden'});await setHidden(t.db,hidden.id,true);
  const cancelled=await hand({title:'Cancelled'});await t.db.query('update campus_listing set cancelled_at=now() where id=$1',[cancelled.id]);
  await hand({title:'Ended',startsAt:hours(-3),endsAt:hours(-1)});
  await hand({title:'Ended with no end time',startsAt:hours(-2.5)});
  await hand({title:'Under way',startsAt:hours(-1),endsAt:hours(1)});
  await hand({title:'Started an hour ago, no end',startsAt:hours(-1)});
  // NOW is 7am on Tuesday November 17 in New York: the seventh day is Monday the 23rd.
  await hand({title:'Last day',startsAt:zoned('America/New_York','2026-11-23T23:30').toISOString()});
  await hand({title:'Eighth day',startsAt:zoned('America/New_York','2026-11-24T00:30').toISOString()});
  expect(await titles()).toEqual(['Started an hour ago, no end','Under way','Last day']);
  await setHidden(t.db,hidden.id,false);
  expect(await titles()).toContain('Hidden');
 });
 it("shows only its own campus's events",async()=>{
  await hand({title:'At Cornell'});
  await addHandListing(t.db,{campusId:(await findCampus(t.db,'nyu'))!.id,title:'At NYU',startsAt:hours(3)});
  expect(await titles()).toEqual(['At Cornell']);
  expect((await weekListings(t.db,(await findCampus(t.db,'nyu'))!,NOW)).map(row=>row.title)).toEqual(['At NYU']);
 });
});

describe('times in the campus timezone',()=>{
 it('turns a local time into the right instant on both sides of a clock change',()=>{
  expect(zoned('America/New_York','2026-11-17T17:00').toISOString()).toBe('2026-11-17T22:00:00.000Z');
  expect(zoned('America/New_York','2026-07-04T09:30').toISOString()).toBe('2026-07-04T13:30:00.000Z');
  expect(localParts('America/New_York',new Date('2026-11-18T03:30:00Z'))).toMatchObject({date:'2026-11-17',hour:22,minute:30,weekday:'Tue'});
 });
});

describe('who the admin is',()=>{
 const who=(subject:string,verifiedEmail:string|null)=>({subject,verifiedEmail});
 it('is whoever LOOP_ADMIN lists, by account id or email',()=>{
  vi.stubEnv('LOOP_ADMIN','user_abc123, Founder@Example.com');
  expect(isAdmin(who('user_abc123',null))).toBe(true);
  expect(isAdmin(who('user_other','founder@example.com'))).toBe(true);
  expect(isAdmin(who('user_other','someone@example.com'))).toBe(false);
  expect(isAdmin(who('founder@example.com',null))).toBe(false);
  expect(isAdmin(null)).toBe(false);
 });
 it('is nobody when the variable is empty or unset',()=>{
  vi.stubEnv('LOOP_ADMIN','');
  expect(isAdmin(who('','' as never))).toBe(false);
  expect(isAdmin(who('user_abc123','founder@example.com'))).toBe(false);
  vi.stubEnv('LOOP_ADMIN',' , ');
  expect(isAdmin(who('user_abc123','founder@example.com'))).toBe(false);
 });
});

describe('good-for words',()=>{
 it('come from the title, the about text and the host name',()=>{
  expect(goodFor('Sunset run, easy 5K','Conversation pace. Loopd around Beebe Lake.',null)).toEqual(expect.arrayContaining(['exercise','fitness','outside']));
  expect(goodFor('Dumpling night','Order for the table and split it.','Supper Club')).toEqual(expect.arrayContaining(['food','eat','social']));
  expect(goodFor('Weekly meeting',null,'Outing Club')).toEqual(expect.arrayContaining(['outside']));
  expect(goodFor('Pickup basketball',null,null)).toEqual(expect.arrayContaining(['exercise','sport','game']));
  expect(goodFor('Sunrise hike',null,null)).toEqual(expect.arrayContaining(['exercise','outside']));
  expect(goodFor('Resume drop-in','Fifteen minutes with an advisor.','Career Services')).not.toContain('exercise');
  expect(goodFor('Resume drop-in','Fifteen minutes with an advisor.','Career Services')).toContain('career');
 });
 it('are at most twelve plain words, the title first',()=>{
  const words=goodFor('Run hike yoga basketball dance dinner coffee study startup film music board games','volunteer art career',null);
  expect(words).toHaveLength(12);
  expect(words[0]).toBe('run');
  for(const word of words)expect(word).toMatch(/^[a-z]+$/);
 });
 it('does not read a word inside another word',()=>{
  expect(goodFor('Brunch planning',null,null)).not.toContain('exercise');
  expect(goodFor('Prune the orchard',null,null)).not.toContain('exercise');
 });
});

describe('places',()=>{
 it('are added and changed, with coordinates and other names',async()=>{
  const campus=await cornell();
  const quad=await savePlace(t.db,{campusId:campus.id,name:'Arts Quad',otherNames:['Arts Quadrangle','the quad'],lat:42.4488,lon:-76.4845});
  await savePlace(t.db,{campusId:campus.id,id:quad.id,name:'Arts Quad',otherNames:['Quad'],lat:42.449,lon:-76.484});
  const {rows}=await t.db.query('select name,other_names,lat,lon from campus_place');
  expect(rows).toEqual([{name:'Arts Quad',other_names:['Quad'],lat:42.449,lon:-76.484}]);
  await expect(savePlace(t.db,{campusId:campus.id,name:'Nowhere',otherNames:[],lat:120,lon:0})).rejects.toThrow();
  await expect(savePlace(t.db,{campusId:campus.id,name:'arts quad',otherNames:[],lat:1,lon:1})).rejects.toThrow();
 });
 it("match an event's place text by name or by another name, the longest name winning",()=>{
  const places=[{id:'1',name:'Willard Straight Hall',otherNames:['WSH','The Straight']},{id:'2',name:'Willard Straight Theatre',otherNames:[]},{id:'3',name:'Arts Quad',otherNames:['Arts Quadrangle']},{id:'4',name:'Hall',otherNames:[]}];
  expect(matchPlace(places,'Arts Quad')?.id).toBe('3');
  expect(matchPlace(places,'Meet at the ARTS QUADRANGLE statue')?.id).toBe('3');
  expect(matchPlace(places,'Willard Straight Hall, Room 414')?.id).toBe('1');
  expect(matchPlace(places,'WSH 414')?.id).toBe('1');
  expect(matchPlace(places,'Willard Straight Theatre')?.id).toBe('2');
  expect(matchPlace(places,'Bao House')).toBeNull();
  expect(matchPlace(places,'Marshall Auditorium')).toBeNull();
  expect(matchPlace(places,null)).toBeNull();
 });
 it('adding a place matches the events already in the list',async()=>{
  const campus=await cornell();
  await hand({title:'Run',place:'Arts Quad, by the statue'});
  expect((await weekListings(t.db,campus,NOW))[0].place).toBeNull();
  await savePlace(t.db,{campusId:campus.id,name:'Arts Quad',otherNames:[],lat:42.4488,lon:-76.4845});
  expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({placeText:'Arts Quad, by the statue',place:{name:'Arts Quad',lat:42.4488,lon:-76.4845}});
 });
});

describe('reading a feed',()=>{
 it('reads what a CampusGroups feed gives: title, host, about with no link, and no place when the feed withholds it',()=>{
  const items=parseFeed(sample('campusgroups-cornell.ics'),'America/New_York');
  expect(items).toHaveLength(6);
  const trivia=items.find(item=>item.title==='Trivia and Treats')!;
  expect(trivia).toMatchObject({startsAt:'2026-11-18T00:30:00.000Z',place:'Cascadilla Third Floor Lounge, 115 Cascadilla Place, Ithaca, NY 14853, United States',cancelled:false});
  expect(trivia.id.length).toBeGreaterThan(10);expect(trivia.host).toBeTruthy();expect(trivia.endsAt).toBeTruthy();
  const board=items.find(item=>item.title==='CEMS Board Meeting')!;
  expect(board.place).toBeNull();
  for(const item of items){expect(item.about??'').not.toMatch(/https?:|Event Details|---/);expect(item.host).not.toMatch(/mailto|"/);}
  expect(items.some(item=>item.title.includes('Renée Anne Louprette'))).toBe(true);
 });
 it('reads a Luma feed and an Engage feed the same way',()=>{
  const luma=parseFeed(sample('luma.ics'),'America/New_York');
  expect(luma[0]).toMatchObject({title:'Karma Police: Radiohead Vinyasa (Park Slope)',host:'NY Yoga Club',place:'ShapeShifter Lab, 837 Union St, Brooklyn, NY 11215, USA',startsAt:'2026-11-18T23:30:00.000Z'});
  for(const item of luma)expect(item.about??'').not.toMatch(/https?:|luma\.com/);
  const engage=parseFeed(sample('engage-nyu.ics'),'America/New_York');
  expect(engage[0]).toMatchObject({title:'NYDM Directors Meetings',host:'New York Dance Marathon',place:'GCASL'});
  expect(engage.find(item=>item.title.startsWith('Giving Thanks'))!.title).toBe('Giving Thanks, Giving Back');
 });
 it('reads a time with no zone, and a whole-day event, in the campus timezone',()=>{
  const text=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:a','SUMMARY:Floating','DTSTART:20261120T170000','DTEND:20261120T180000','END:VEVENT','BEGIN:VEVENT','UID:b','SUMMARY:All day','DTSTART;VALUE=DATE:20261121','END:VEVENT','BEGIN:VEVENT','UID:c','SUMMARY:Called off','STATUS:CANCELLED','DTSTART:20261121T170000Z','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const items=parseFeed(text,'America/New_York');
  expect(items.map(item=>[item.title,item.startsAt,item.endsAt,item.cancelled])).toEqual([['Floating','2026-11-20T22:00:00.000Z','2026-11-20T23:00:00.000Z',false],['All day','2026-11-21T05:00:00.000Z',null,false],['Called off','2026-11-21T17:00:00.000Z',null,true]]);
  expect(()=>parseFeed('<!doctype html><title>Sign in</title>','America/New_York')).toThrow('calendar');
 });

 const feeds=(map:Record<string,string|Error>)=>async(url:string)=>{const body=map[url];if(body===undefined||body instanceof Error)throw body??new Error('404');return body;};
 const event=(uid:string,title:string,start:string,extra:string[]=[])=>['BEGIN:VEVENT',`UID:${uid}`,`SUMMARY:${title}`,`DTSTART:${start}`,...extra,'END:VEVENT'];
 const calendar=(...events:string[][])=>['BEGIN:VCALENDAR','VERSION:2.0',...events.flat(),'END:VCALENDAR'].join('\r\n');
 const listed=async()=>(await t.db.query<{title:string;gone:boolean;words:string[]}>("select title,left_feed_at is not null as gone,words from campus_listing order by starts_at,title")).rows;

 it('creates an event for each item in the next 30 days and none beyond, with words and a matched place',async()=>{
  const campus=await cornell();
  await savePlace(t.db,{campusId:campus.id,name:'Cascadilla',otherNames:['Cascadilla Third Floor Lounge'],lat:42.4429,lon:-76.4897});
  await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url:'https://feeds.test/cornell.ics'});
  const result=await readFeeds(t.db,{now:NOW,fetch:feeds({'https://feeds.test/cornell.ics':sample('campusgroups-cornell.ics')})});
  expect(result).toEqual({feeds:1,failed:0});
  const rows=await listed();
  // Four start tomorrow; the one in January is 45 days out and the one in August has passed.
  expect(rows.map(row=>row.title).sort()).toEqual(['Bandstaph Meeting','CEMS Board Meeting','Distinguished Guest Artist Series: Renée Anne Louprette (CU Music)','Trivia and Treats']);
  const trivia=(await weekListings(t.db,campus,NOW)).find(row=>row.title==='Trivia and Treats')!;
  expect(trivia).toMatchObject({origin:'feed',source:'CampusGroups',place:{name:'Cascadilla'}});
  expect(trivia.words).toEqual(expect.arrayContaining(['game','food']));
  const {rows:[feed]}=await t.db.query<{last_ok:boolean;last_result:string;last_read_at:string}>('select last_ok,last_result,last_read_at from campus_feed');
  expect(feed).toMatchObject({last_ok:true,last_result:'Read 6 events, 4 in the next 30 days'});expect(feed.last_read_at).toBeTruthy();
 });
 it('updates the same event when its item changes, and keeps its outings',async()=>{
  const campus=await cornell(),url='https://feeds.test/a.ics',person=await makePerson(t.db);
  await addFeed(t.db,{campusId:campus.id,source:'Luma',url});
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Demo night','20261120T230000Z',['LOCATION:Collegetown']))})});
  const {rows:[first]}=await t.db.query<{id:string}>('select id from campus_listing');
  const {rows:[outing]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'tokentokentoken02') returning id",[first.id]);
  await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)',[outing.id,first.id,person.id]);
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Demo night, moved','20261121T000000Z',['LOCATION:Sage Hall']))})});
  const {rows}=await t.db.query('select id,title,starts_at,place_text from campus_listing');
  expect(rows).toEqual([{id:first.id,title:'Demo night, moved',starts_at:'2026-11-21T00:00:00.000Z',place_text:'Sage Hall'}]);
  expect((await weekListings(t.db,campus,NOW))[0].going).toBe(1);
 });
 it('hides an event that left its feed or was called off, keeps its outing, and brings it back if it returns',async()=>{
  const campus=await cornell(),url='https://feeds.test/a.ics',person=await makePerson(t.db);
  await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url});
  const both=calendar(event('e1','Stays','20261120T230000Z'),event('e2','Leaves','20261120T233000Z'));
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:both})});
  const {rows:[leaving]}=await t.db.query<{id:string}>("select id from campus_listing where title='Leaves'");
  const {rows:[outing]}=await t.db.query<{id:string}>("insert into campus_outing(listing_id,token) values($1,'tokentokentoken03') returning id",[leaving.id]);
  await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)',[outing.id,leaving.id,person.id]);
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Stays','20261120T230000Z'))})});
  expect(await listed()).toMatchObject([{title:'Stays',gone:false},{title:'Leaves',gone:true}]);
  expect(await titles()).toEqual(['Stays']);
  expect((await t.db.query('select 1 from campus_outing_member where outing_id=$1',[outing.id])).rows).toHaveLength(1);
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:both})});
  expect(await titles()).toEqual(['Stays','Leaves']);
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Stays','20261120T230000Z',['STATUS:CANCELLED']),event('e2','Leaves','20261120T233000Z'))})});
  expect(await titles()).toEqual(['Leaves']);
 });
 it('records a feed that fails, leaves its events as they were, and still reads the others',async()=>{
  const campus=await cornell(),good='https://feeds.test/good.ics',bad='https://feeds.test/bad.ics',page='https://feeds.test/page.ics';
  for(const url of [bad,good,page])await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url});
  await readFeeds(t.db,{now:NOW,fetch:feeds({[bad]:calendar(event('b1','From the bad feed','20261120T230000Z')),[good]:calendar(),[page]:calendar()})});
  const result=await readFeeds(t.db,{now:NOW,fetch:feeds({[bad]:new Error('503 from the school'),[good]:calendar(event('g1','From the good feed','20261120T233000Z')),[page]:'<html>Sign in</html>'})});
  expect(result).toEqual({feeds:3,failed:2});
  expect(await titles()).toEqual(['From the bad feed','From the good feed']);
  const {rows}=await t.db.query<{url:string;last_ok:boolean;last_result:string}>('select url,last_ok,last_result from campus_feed order by url');
  expect(rows).toMatchObject([{url:bad,last_ok:false,last_result:'503 from the school'},{url:good,last_ok:true},{url:page,last_ok:false,last_result:'Not a calendar feed'}]);
 });
 it('skips a feed that is off',async()=>{
  const campus=await cornell(),url='https://feeds.test/a.ics';
  const feed=await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url});
  await setFeedOn(t.db,feed.id,false);
  expect(await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Unread','20261120T230000Z'))})})).toEqual({feeds:0,failed:0});
  expect(await listed()).toEqual([]);
 });
 it('keeps words edited by hand when the feed is read again',async()=>{
  const campus=await cornell(),url='https://feeds.test/a.ics';
  await addFeed(t.db,{campusId:campus.id,source:'CampusGroups',url});
  const feed=feeds({[url]:calendar(event('e1','Sunset run','20261120T230000Z'))});
  await readFeeds(t.db,{now:NOW,fetch:feed});
  const {rows:[row]}=await t.db.query<{id:string;words:string[]}>('select id,words from campus_listing');
  expect(row.words).toContain('exercise');
  expect(await setWords(t.db,row.id,'Chill, Slow  pace; chill')).toEqual(['chill','slow','pace']);
  await readFeeds(t.db,{now:NOW,fetch:feeds({[url]:calendar(event('e1','Sunset run, new route','20261120T230000Z'))})});
  expect(await listed()).toMatchObject([{title:'Sunset run, new route',words:['chill','slow','pace']}]);
  await expect(setWords(t.db,row.id,Array.from({length:13},(_,i)=>`w${i}`).join(' '))).rejects.toThrow('twelve');
 });
});

describe('an event entered by hand',()=>{
 it('gets its words and its place, and refuses a missing title or an end before the start',async()=>{
  const campus=await cornell();
  await savePlace(t.db,{campusId:campus.id,name:'Bao House',otherNames:[],lat:42.442,lon:-76.4853});
  await hand({title:'Dumpling night',host:'Supper Club',place:'Bao House',about:'Order for the table.',endsAt:hours(5)});
  expect((await weekListings(t.db,campus,NOW))[0]).toMatchObject({origin:'hand',host:'Supper Club',place:{name:'Bao House'},words:expect.arrayContaining(['food'])});
  await expect(hand({title:'  '})).rejects.toThrow();
  await expect(hand({startsAt:hours(5),endsAt:hours(4)})).rejects.toThrow();
 });
});
