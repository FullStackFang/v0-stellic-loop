// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import type {PageRead} from '@/lib/emba/event-link';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {linkEvent,LINKS,unlinkEvent,type LinkWrite} from '@/lib/emba/team-event-links';
import {changeEvent,EVENTS} from '@/lib/emba/team-events';
import {eventShare,upcomingEvents} from '@/lib/emba/team-interest';
import {addFeed,nearby,NEARBY,readFeedNow,readTeamFeeds,removeFeed,setFeedOn,teamFeeds,type FeedWrite} from '@/lib/emba/team-nearby';
import {saveBrief,whatsNew} from '@/lib/emba/team-read';
import {waiting} from '@/lib/emba/team-waiting';

// Specs: openspec/changes/loop-group-event-links/specs/nearby-events.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,who:Principal) {
 await grantLease(t.db,who,{...f.root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const rows=async<T>(text:string,params:unknown[]=[])=>(await t.db.query<T>(text,params)).rows;
const fed=(result:FeedWrite)=>{if(!result.saved||!result.feed)throw new Error(`not saved: ${JSON.stringify(result)}`);return result.feed;};
const ok=(result:LinkWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};

/** A whole hour some days from now, as an instant and as the feed writes it. */
const inDays=(days:number,hours=0)=>{const at=new Date(Math.floor(Date.now()/3600000)*3600000+days*86400000+hours*3600000);return {iso:at.toISOString(),ics:at.toISOString().replace(/[-:]|\.\d{3}/g,'')};};
type Item={uid:string;title:string;days:number;hours?:number;place?:string;cancelled?:boolean};
const calendar=(items:Item[],name='Entrepreneurship Club')=>['BEGIN:VCALENDAR','VERSION:2.0',`X-WR-CALNAME:${name}`,...items.flatMap(item=>['BEGIN:VEVENT',`UID:${item.uid}`,`SUMMARY:${item.title}`,
 `DTSTART:${inDays(item.days).ics}`,`DTEND:${inDays(item.days,item.hours??2).ics}`,...(item.place?[`LOCATION:${item.place}`]:[]),...(item.cancelled?['STATUS:CANCELLED']:[]),'END:VEVENT']),'END:VCALENDAR'].join('\r\n');
const club='https://club.example.org/feed.ics',school='https://school.example.org/all.ics';
/** The network: each address answers with what the table holds now. Hosts resolve to a public address unless named otherwise. */
function net(table:Record<string,string|number>,addresses:Record<string,string[]>={}) {
 const fetch=vi.fn(async(url:string|URL|Request)=>{const body=table[String(url)];return typeof body==='string'?new Response(body,{headers:{'content-type':'text/calendar'}}):new Response('',{status:body??404});});
 return {fetch:fetch as unknown as typeof globalThis.fetch,lookup:async(host:string)=>addresses[host]??['93.184.216.34'],asked:()=>fetch.mock.calls.map(call=>String(call[0]))};
}
const three=[{uid:'a',title:'Pitch night',days:2,place:'Sage Hall'},{uid:'b',title:'Founder coffee',days:5},{uid:'c',title:'Demo day',days:13},{uid:'far',title:'Spring gala',days:42}];
const titles=async(f:F,who:Principal=f.memberA)=>(await nearby(t.db,who,f.root)).items.map(item=>item.title);
const codeOf=async(f:F,title:string)=>(await nearby(t.db,f.memberA,f.root)).items.find(item=>item.title===title)!.code;

it('lets an owner or organizer add a feed, reads it at once, and lists what starts in the next 14 days',async()=>{
 const f=await fixture(),web=net({[club]:calendar(three)});
 const feed=fed(await addFeed(t.db,f.organizer,{...f.root,name:'Entrepreneurship Club',url:club.replace('https:','webcal:')},web));
 // webcal: is the same https address.
 expect(feed).toMatchObject({name:'Entrepreneurship Club',url:club,on:true,lastOk:true,lastResult:'Read 4 events, 3 in the next 14 days'});
 expect(web.asked()).toEqual([club]);
 const list=await nearby(t.db,f.memberA,f.root);
 expect(list.items.map(item=>item.title)).toEqual(['Pitch night','Founder coffee','Demo day']);
 expect(list.items[0]).toMatchObject({title:'Pitch night',startsAt:inDays(2).iso,endsAt:inDays(2,2).iso,place:'Sage Hall',host:'Entrepreneurship Club',feed:'Entrepreneurship Club'});
 expect(list.items[0].code).toMatch(/^[0-9a-f]{8}$/);expect(list.untrusted).toBe(true);
 expect(JSON.stringify(list)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
 // The upcoming list is still empty: a nearby item is not a group event.
 expect((await upcomingEvents(t.db,f.memberA,f.root)).events.items).toEqual([]);
 expect(await teamFeeds(t.db,f.organizer,f.root)).toHaveLength(1);
});
it('keeps feeds with owners and organizers on the site: never a member, never an assistant',async()=>{
 const f=await fixture(),web=net({[club]:calendar(three)});
 expect(await addFeed(t.db,f.memberA,{...f.root,name:'Club',url:club},web)).toEqual({saved:false,reason:'organizers_only'});
 await expect(addFeed(t.db,await assistant(f,f.organizer),{...f.root,name:'Club',url:club},web)).rejects.toThrow();
 expect(web.asked()).toEqual([]);
 const feed=fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 const target={...f.root,feedId:feed.id};
 expect(await setFeedOn(t.db,f.memberA,{...target,on:false})).toEqual({saved:false,reason:'organizers_only'});
 expect(await readFeedNow(t.db,f.memberA,target,web)).toEqual({saved:false,reason:'organizers_only'});
 expect(await removeFeed(t.db,f.memberA,target)).toEqual({saved:false,reason:'organizers_only'});
 expect(await teamFeeds(t.db,f.memberA,f.root)).toEqual([]);
 const claude=await assistant(f,f.organizer);
 await expect(setFeedOn(t.db,claude,{...target,on:false})).rejects.toThrow();
 await expect(readFeedNow(t.db,claude,target,web)).rejects.toThrow();
 await expect(teamFeeds(t.db,claude,f.root)).rejects.toThrow();
 expect(web.asked()).toEqual([club]);
 // A person outside the group cannot read the list.
 await expect(nearby(t.db,f.nonmember,f.root)).rejects.toThrow();
 expect(await addFeed(t.db,f.organizer,{...f.root,name:'Again',url:club},web)).toEqual({saved:false,reason:'feed_exists'});
 expect(await addFeed(t.db,f.organizer,{...f.root,name:'Plain',url:'http://club.example.org/feed.ics'},web)).toEqual({saved:false,reason:'link_refused',problem:'not_https'});
});
it('holds at most 10 feeds in a group',async()=>{
 const f=await fixture(),web=net({});
 for(let n=1;n<=NEARBY.feeds;n++)fed(await addFeed(t.db,f.organizer,{...f.root,name:`Feed ${n}`,url:`https://feeds.example.org/${n}.ics`},web));
 expect(await addFeed(t.db,f.organizer,{...f.root,name:'One more',url:'https://feeds.example.org/11.ics'},web)).toEqual({saved:false,reason:'cap',cap:'feeds'});
 // The table holds the rule too, and a removed feed frees its place.
 await expect(t.db.query("insert into emba_team_feed(org_id,loop_id,slot,name,url) values($1,$2,11,'X','https://feeds.example.org/x.ics')",[f.orgId,f.rootId])).rejects.toThrow(/slot/);
 const [first]=await teamFeeds(t.db,f.organizer,f.root);
 expect(await removeFeed(t.db,f.organizer,{...f.root,feedId:first.id})).toEqual({saved:true,feed:null});
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'One more',url:'https://feeds.example.org/11.ics'},web));
});
it('updates a changed item, drops a removed or cancelled one, and adds nothing from a page that is not a calendar',async()=>{
 const f=await fixture(),table:Record<string,string|number>={[club]:calendar(three)},web=net(table);
 const feed=fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 table[club]=calendar([{uid:'a',title:'Pitch night (moved)',days:3,place:'Statler Hall'},{uid:'b',title:'Founder coffee',days:5,cancelled:true},{uid:'new',title:'Office hours',days:1}]);
 expect(await readTeamFeeds(t.db,web)).toEqual({feeds:1,failed:0});
 expect((await nearby(t.db,f.memberA,f.root)).items.map(item=>[item.title,item.startsAt,item.place])).toEqual([['Office hours',inDays(1).iso,null],['Pitch night (moved)',inDays(3).iso,'Statler Hall']]);
 // A sign-in page instead of a calendar: the list is as it was, and none of the page's text is kept.
 table[club]='<!doctype html><title>Sign in to continue</title>';
 expect(fed(await readFeedNow(t.db,f.organizer,{...f.root,feedId:feed.id},web))).toMatchObject({lastOk:false,lastResult:'This is not a calendar feed'});
 expect(await titles(f)).toEqual(['Office hours','Pitch night (moved)']);
 // An item that comes back is listed again.
 table[club]=calendar(three);await readTeamFeeds(t.db,web);
 expect(await titles(f)).toEqual(['Pitch night','Founder coffee','Demo day']);
});
it('does not let one failing feed stop another, and never requests an internal address',async()=>{
 const f=await fixture(),table:Record<string,string|number>={[club]:calendar(three),[school]:calendar([{uid:'s',title:'Career fair',days:4}],'School')},web=net(table,{'intranet.example.org':['10.0.0.8']});
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));fed(await addFeed(t.db,f.organizer,{...f.root,name:'School',url:school},web));
 table[club]=500;table[school]=calendar([{uid:'s',title:'Career fair',days:4},{uid:'s2',title:'Alumni panel',days:6}],'School');
 expect(await readTeamFeeds(t.db,web)).toEqual({feeds:2,failed:1});
 expect(await titles(f)).toEqual(['Pitch night','Career fair','Founder coffee','Alumni panel','Demo day']);
 expect((await teamFeeds(t.db,f.organizer,f.root)).map(feed=>[feed.name,feed.lastOk,feed.lastResult])).toEqual([['Club',false,'The feed could not be read'],['School',true,'Read 2 events, 2 in the next 14 days']]);
 const before=web.asked().length;
 expect(fed(await addFeed(t.db,f.organizer,{...f.root,name:'Inside',url:'https://intranet.example.org/cal.ics'},web))).toMatchObject({lastOk:false,lastResult:'The feed could not be read'});
 expect(web.asked()).toHaveLength(before);
});
it('makes a nearby item the group\'s event on first interest, once, with the limits on linked events',async()=>{
 const f=await fixture(),web=net({[club]:calendar(three)});
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 const code=await codeOf(f,'Pitch night'),start=await whatsNew(t.db,f.memberB,f.root);
 const [first,second]=await Promise.all([linkEvent(t.db,f.memberA,{...f.root,nearby:code}),linkEvent(t.db,f.members[2],{...f.root,nearby:code})]);
 // Two members at once: one event, both interested.
 expect([ok(first).existing,ok(second).existing].sort()).toEqual([false,true]);
 expect(await rows("select slug,source,source_follow as follow,(select count(*)::int from emba_event_interest i where i.event_id=e.id) as marks from emba_team_event e")).toEqual([{slug:'pitch-night',source:'feed',follow:true,marks:2}]);
 expect(ok(first).event).toMatchObject({name:'Pitch night',startsAt:inDays(2).iso,place:'Sage Hall',note:'Hosted by Entrepreneurship Club',url:null});
 expect(await titles(f)).toEqual(['Founder coffee','Demo day']);
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor})).changes.map(change=>[change.action,change.event?.slug])).toEqual([['event_added','pitch-night']]);
 // A follower reads the list and cannot make an item an event.
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.memberB.personId]);
 expect(await titles(f,f.memberB)).toEqual(['Founder coffee','Demo day']);
 expect(await linkEvent(t.db,f.memberB,{...f.root,nearby:await codeOf(f,'Demo day')})).toEqual({saved:false,reason:'members_only'});
 expect(await linkEvent(t.db,f.memberA,{...f.root,nearby:'00000000'})).toEqual({saved:false,reason:'unknown_nearby',value:'00000000'});
 // Taken back, the item returns to the list.
 await t.db.query('delete from emba_event_interest where person_id=$1',[f.members[2].personId]);
 expect(await unlinkEvent(t.db,f.memberA,{...f.root,event:'pitch-night'})).toMatchObject({saved:true});
 expect(await titles(f)).toEqual(['Pitch night','Founder coffee','Demo day']);
 // The member's ten count events from nearby as well.
 await t.db.query(`insert into emba_team_event(org_id,loop_id,slug,name,starts_at,created_by,url,source) select $1,$2,'mine-'||n,'Mine','2099-01-01T00:00:00Z',$3,'https://lu.ma/mine-'||n,'link' from generate_series(1,$4::int) n`,[f.orgId,f.rootId,f.memberA.personId,LINKS.perMember]);
 expect(await linkEvent(t.db,f.memberA,{...f.root,nearby:code})).toEqual({saved:false,reason:'cap',cap:'linked_events'});
});
it('carries a feed\'s changes to the event made from it, labels it when the item goes, and stops when it is changed by hand',async()=>{
 const f=await fixture(),table:Record<string,string|number>={[club]:calendar(three)},web=net(table);
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 ok(await linkEvent(t.db,f.memberA,{...f.root,nearby:await codeOf(f,'Pitch night')}));ok(await linkEvent(t.db,f.memberA,{...f.root,nearby:await codeOf(f,'Founder coffee')}));
 const start=await whatsNew(t.db,f.memberB,f.root);
 // The same feed read again changes nothing and reports nothing.
 await readTeamFeeds(t.db,web);
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor})).changes).toEqual([]);
 table[club]=calendar([{uid:'a',title:'Pitch night',days:2,place:'Room 2'},three[2]]);
 await readTeamFeeds(t.db,web);
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor})).changes.map(change=>[change.action,change.event?.slug,change.event?.place])).toEqual([['event_changed','pitch-night','Room 2']]);
 const events=(await upcomingEvents(t.db,f.memberB,f.root)).events.items;
 // The coffee left the feed: the event stays, with its interested member, and says so.
 expect(events.map(event=>[event.slug,event.interested,event.sourceGone??false])).toEqual([['pitch-night',1,false],['founder-coffee',1,true]]);
 await changeEvent(t.db,f.organizer,{...f.root,event:'pitch-night',place:'Sage Hall'});
 table[club]=calendar([{uid:'a',title:'Pitch night',days:3,place:'Elsewhere'}]);await readTeamFeeds(t.db,web);
 expect((await upcomingEvents(t.db,f.memberB,f.root)).events.items[0]).toMatchObject({slug:'pitch-night',startsAt:inDays(2).iso,place:'Sage Hall'});
});
it('drops a feed\'s items from the list when it is turned off and keeps the events made from it',async()=>{
 const f=await fixture(),web=net({[club]:calendar(three)});
 const feed=fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 ok(await linkEvent(t.db,f.memberA,{...f.root,nearby:await codeOf(f,'Pitch night')}));
 const code=await codeOf(f,'Demo day');
 expect(fed(await setFeedOn(t.db,f.organizer,{...f.root,feedId:feed.id,on:false})).on).toBe(false);
 expect(await titles(f)).toEqual([]);
 expect(await linkEvent(t.db,f.memberA,{...f.root,nearby:code})).toEqual({saved:false,reason:'unknown_nearby',value:code});
 // A feed that is off is not read.
 const asked=web.asked().length;await readTeamFeeds(t.db,web);expect(web.asked()).toHaveLength(asked);
 expect((await upcomingEvents(t.db,f.memberA,f.root)).events.items.map(event=>event.slug)).toEqual(['pitch-night']);
 await setFeedOn(t.db,f.organizer,{...f.root,feedId:feed.id,on:true});
 expect(await titles(f)).toEqual(['Founder coffee','Demo day']);
 expect(await removeFeed(t.db,f.organizer,{...f.root,feedId:feed.id})).toEqual({saved:true,feed:null});
 expect(await titles(f)).toEqual([]);
 expect(await rows('select slug,source_follow as follow,archived_at is null as live from emba_team_event')).toEqual([{slug:'pitch-night',follow:false,live:true}]);
});
it('lists the same event from two sources once',async()=>{
 const f=await fixture(),table:Record<string,string|number>={[club]:calendar([{uid:'hy',title:'Harvard vs. Yale Day Party!',days:3},three[1]])},web=net(table);
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 const posh='https://posh.vip/e/day-party';
 const page=(name:string,days:number):PageRead=>({ok:true,facts:{name,startsAt:inDays(days).iso,endsAt:null,place:'The Grand',host:'Elevate'}});
 // A link whose name and start match a nearby item: one event, with the link, and the item is no longer listed.
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:posh},async()=>page('harvard vs yale day party',3)))).toMatchObject({existing:false,event:{url:posh,place:'The Grand'}});
 expect(await titles(f)).toEqual(['Founder coffee']);
 expect(await rows('select source from emba_team_event')).toEqual([{source:'link'}]);
 // The event follows its link, not the feed: a feed read leaves it alone.
 table[club]=calendar([{uid:'hy',title:'Harvard vs. Yale Day Party!',days:3,place:'Feed place'},three[1],{uid:'ph',title:'Pasta & Hack',days:6}]);
 // A feed item that matches an event a member already linked is not listed.
 ok(await linkEvent(t.db,f.memberB,{...f.root,url:'https://lu.ma/pasta'},async()=>page('Pasta and hack',6)));
 ok(await linkEvent(t.db,f.memberB,{...f.root,url:'https://lu.ma/hack'},async()=>page('Pasta & HACK',6)));
 await readTeamFeeds(t.db,web);
 expect(await titles(f)).toEqual(['Founder coffee']);
 expect((await upcomingEvents(t.db,f.memberA,f.root)).events.items.map(event=>[event.name,event.place])).toEqual([['harvard vs yale day party','The Grand'],['Pasta and hack','The Grand'],['Pasta & HACK','The Grand']]);
});
it('keeps nearby items out of what is new, out of what waits, and out of the 50 upcoming events',async()=>{
 const f=await fixture(),web=net({[club]:calendar(Array.from({length:20},(_,n)=>({uid:`u${n}`,title:`Session ${n}`,days:1+n%13})))});
 const start=await whatsNew(t.db,f.memberA,f.root),before=await waiting(t.db,f.memberA,{});
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 expect(await titles(f)).toHaveLength(20);
 expect((await whatsNew(t.db,f.memberA,{...f.root,cursor:start.cursor})).changes).toEqual([]);
 expect((await waiting(t.db,f.memberA,{})).count).toBe(before.count);
 expect(await rows('select count(*)::int as n from emba_team_change')).toEqual([{n:0}]);
 // 49 events and 20 nearby items: there is still room for one more event.
 for(let n=1;n<EVENTS.upcoming;n++)await t.db.query("insert into emba_team_event(org_id,loop_id,slug,name) values($1,$2,$3,'Filler')",[f.orgId,f.rootId,`filler-${n}`]);
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,nearby:await codeOf(f,'Session 0')})).existing).toBe(false);
 // The list shows the soonest 30.
 await t.db.query(`insert into emba_team_nearby(org_id,loop_id,feed_id,item_id,title,starts_at) select $1,$2,(select id from emba_team_feed),'x'||n,'Extra '||n,clock_timestamp()+interval '10 days' from generate_series(1,20) n`,[f.orgId,f.rootId]);
 expect(await titles(f)).toHaveLength(NEARBY.list);
 await expect(t.db.query("insert into emba_team_nearby(org_id,loop_id,feed_id,item_id,title,starts_at) select $1,$2,id,'x1','Twice',clock_timestamp() from emba_team_feed",[f.orgId,f.rootId])).rejects.toThrow(/feed_id_item_id/);
});
it('reads feeds from the hourly job only with the job\'s secret, and tells someone outside the team when an event left its source',async()=>{
 const f=await fixture(),table:Record<string,string|number>={[club]:calendar(three)},web=net(table);
 fed(await addFeed(t.db,f.organizer,{...f.root,name:'Club',url:club},web));
 const {GET}=await import('@/app/api/cron/team-feeds/route');
 expect((await GET(new Request('https://loop.test/api/cron/team-feeds'))).status).toBe(401);
 await t.db.query('update emba_team_feed set is_on=false');
 const answer=await GET(new Request('https://loop.test/api/cron/team-feeds',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
 expect(await answer.json()).toEqual({feeds:0,failed:0});
 await t.db.query('update emba_team_feed set is_on=true');
 const added=ok(await linkEvent(t.db,f.memberA,{...f.root,nearby:await codeOf(f,'Pitch night')}));
 const token=added.event.shareUrl!.split('/').pop()!;
 expect((await eventShare(t.db,null,token)).outside).not.toHaveProperty('sourceGone');
 table[club]=calendar([three[1]]);await readTeamFeeds(t.db,web);
 expect((await eventShare(t.db,null,token)).outside).toMatchObject({name:'Pitch night',sourceGone:true});
});
