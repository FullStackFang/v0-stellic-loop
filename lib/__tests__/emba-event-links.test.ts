// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import type {PageRead} from '@/lib/emba/event-link';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setMemberHandle} from '@/lib/emba/tags';
import {linkEvent,LINKS,rereadLinkedEvents,REREAD,unlinkEvent,type LinkWrite} from '@/lib/emba/team-event-links';
import {addEvent,archiveEvent,changeEvent,EVENTS} from '@/lib/emba/team-events';
import {setInterest,upcomingEvents} from '@/lib/emba/team-interest';
import {saveBrief,whatsNew} from '@/lib/emba/team-read';

// Specs: openspec/changes/loop-group-event-links/specs/event-links and group-events.
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
async function assistant(f:F,who:Principal,actions:string[]=['plan:read','group-memory:write']) {
 await grantLease(t.db,who,{...f.root,clientId:'claude',actions,expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const ok=(result:LinkWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const luma='https://lu.ma/dinner',posh='https://posh.vip/e/day-party';
const dinner:PageRead={ok:true,facts:{name:'Founders dinner',startsAt:'2099-01-15T23:00:00.000Z',endsAt:'2099-01-16T01:00:00.000Z',place:'40 E 1st St',host:'Special Special'}};
/** A reader that answers from a table and records what it was asked for. */
const pages=(table:Record<string,PageRead>)=>vi.fn(async(url:string):Promise<PageRead>=>table[url]??{ok:false,reason:'unreadable'});
const follower=(who:Principal)=>t.db.query("update emba_role set role='follower' where person_id=$1",[who.personId]);
const rows=async<T>(text:string,params:unknown[]=[])=>(await t.db.query<T>(text,params)).rows;

it('lets a member add an event by link, marks them interested and reports it as new',async()=>{
 const f=await fixture(),read=pages({[luma]:dinner});
 const start=await whatsNew(t.db,f.memberB,f.root);
 const added=ok(await linkEvent(t.db,f.memberA,{...f.root,url:`${luma}?utm_source=whatsapp#x`},read));
 expect(added).toMatchObject({existing:false,changed:true,event:{slug:'founders-dinner',name:'Founders dinner',startsAt:'2099-01-15T23:00:00.000Z',endsAt:'2099-01-16T01:00:00.000Z',place:'40 E 1st St',url:luma,note:'Hosted by Special Special',interested:1,youAreInterested:true,youLinked:true}});
 expect(read).toHaveBeenCalledWith(luma);
 expect(await rows('select source,source_follow as follow,created_by=$1 as mine from emba_team_event',[f.memberA.personId])).toEqual([{source:'link',follow:true,mine:true}]);
 const news=await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor});
 expect(news.changes.map(change=>[change.action,change.event?.slug])).toEqual([['event_added','founders-dinner']]);
 // Another member does not see it as theirs to take back.
 expect((await upcomingEvents(t.db,f.memberB,f.root)).events.items[0]).not.toHaveProperty('youLinked');
 // The member cannot change what they linked: that stays with owners and organizers.
 expect(await changeEvent(t.db,f.memberA,{...f.root,event:'founders-dinner',startsAt:'2099-01-16T18:00'})).toEqual({saved:false,reason:'organizers_only'});
});
it('refuses a follower before any page is requested, and names an assistant in the change log',async()=>{
 const f=await fixture(),read=pages({[luma]:dinner,[posh]:{ok:true,facts:{name:'Day party',startsAt:'2099-01-17T19:00:00.000Z',endsAt:null,place:null,host:null}}});
 await follower(f.memberB);
 expect(await linkEvent(t.db,f.memberB,{...f.root,url:luma},read)).toEqual({saved:false,reason:'members_only'});
 expect(read).not.toHaveBeenCalled();
 await expect(linkEvent(t.db,f.nonmember,{...f.root,url:luma},read)).rejects.toThrow();
 expect(read).not.toHaveBeenCalled();
 // Read consent alone is not enough for an assistant.
 await expect(linkEvent(t.db,await assistant(f,f.members[2],['plan:read']),{...f.root,url:luma},read)).rejects.toThrow();
 expect(read).not.toHaveBeenCalled();
 const claude=await assistant(f,f.memberA);
 expect(ok(await linkEvent(t.db,claude,{...f.root,url:posh},read)).event).toMatchObject({slug:'day-party',url:posh,youAreInterested:true});
 expect(await rows('select action,client_id,actor_id=$1 as ana from emba_team_change order by seq',[f.memberA.personId])).toEqual([{action:'event_added',client_id:'claude',ana:true}]);
 expect(await rows('select route,client_id from emba_event_interest')).toEqual([{route:'assistant',client_id:'claude'}]);
});
it('saves nothing for a link it cannot read until the member gives a name and a start',async()=>{
 const f=await fixture(),read=pages({}),partiful='https://partiful.com/e/abc?x=1';
 expect(await linkEvent(t.db,f.memberA,{...f.root,url:partiful},read)).toEqual({saved:false,reason:'needs_facts',listed:false});
 // A site Loop does not read is never requested.
 expect(read).not.toHaveBeenCalled();
 expect(await linkEvent(t.db,f.memberA,{...f.root,url:luma},read)).toEqual({saved:false,reason:'needs_facts',listed:true});
 expect(await rows('select 1 from emba_team_event')).toEqual([]);
 const added=ok(await linkEvent(t.db,f.memberA,{...f.root,url:partiful,name:'Rooftop  birthday',startsAt:'2099-01-20T19:00',place:'The roof'},read));
 // The link is kept whole; the start is read in the team's timezone.
 expect(added.event).toMatchObject({slug:'rooftop-birthday',name:'Rooftop birthday',startsAt:'2099-01-21T00:00:00.000Z',place:'The roof',url:partiful,note:null,youAreInterested:true});
 // Nothing to follow: Loop does not read that page again.
 expect(await rows('select source,source_follow as follow from emba_team_event')).toEqual([{source:'link',follow:false}]);
 expect(await linkEvent(t.db,f.memberA,{...f.root,url:'http://lu.ma/x'},read)).toEqual({saved:false,reason:'link_refused',problem:'not_https'});
 expect(await linkEvent(t.db,f.memberA,{...f.root,url:'https://partiful.com/e/late',name:'Late',startsAt:'2099-02-01T10:00',endsAt:'2099-02-01T09:00'},read)).toEqual({saved:false,reason:'end_before_start'});
});
it('keeps one event per link: a second paste marks interest and adds nothing',async()=>{
 const f=await fixture(),read=pages({[luma]:dinner,'https://luma.com/dinner':dinner});
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},read));
 const second=ok(await linkEvent(t.db,f.memberB,{...f.root,url:`${luma}?utm_source=whatsapp`},read));
 expect(second).toMatchObject({existing:true,changed:true,event:{slug:'founders-dinner',interested:2,youAreInterested:true}});
 // The page was read once: the second paste was answered from what the group holds.
 expect(read).toHaveBeenCalledTimes(1);
 expect(ok(await linkEvent(t.db,f.memberB,{...f.root,url:luma},read))).toMatchObject({existing:true,changed:false});
 // The same event under the site's other address has the same name and start: still one event.
 expect(ok(await linkEvent(t.db,f.members[2],{...f.root,url:'https://luma.com/dinner'},read))).toMatchObject({existing:true,event:{slug:'founders-dinner',interested:3}});
 expect(await rows('select count(*)::int as n from emba_team_event')).toEqual([{n:1}]);
 // The database holds the rule too.
 await expect(t.db.query("insert into emba_team_event(org_id,loop_id,slug,name,url,source) values($1,$2,'other','Other',$3,'link')",[f.orgId,f.rootId,luma])).rejects.toThrow(/emba_team_event_link/);
});
it('gives a second event with the same name its own tag',async()=>{
 const f=await fixture();
 const page=(day:string):PageRead=>({ok:true,facts:{name:'Team',startsAt:`2099-01-${day}T23:00:00.000Z`,endsAt:null,place:null,host:null}});
 const read=pages({'https://lu.ma/a':dinner,'https://lu.ma/b':{...dinner,facts:{...dinner.facts,startsAt:'2099-02-15T23:00:00.000Z',endsAt:null}},'https://lu.ma/c':page('10'),'https://lu.ma/d':page('11')});
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/a'},read)).event.slug).toBe('founders-dinner');
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/b'},read)).event.slug).toBe('founders-dinner-2');
 // A name that cannot be a tag ("team" is a reserved word) still gets one.
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/c'},read)).event.slug).toBe('event');
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/d'},read)).event.slug).toBe('event-2');
});
it('stops a member at 10 upcoming linked events and a team at 50 upcoming events',async()=>{
 const f=await fixture();
 const read=vi.fn(async(url:string):Promise<PageRead>=>({ok:true,facts:{name:`Night ${url.split('/').pop()}`,startsAt:'2099-03-01T23:00:00.000Z',endsAt:null,place:null,host:null}}));
 for(let n=0;n<LINKS.perMember;n++)ok(await linkEvent(t.db,f.memberA,{...f.root,url:`https://lu.ma/a${n}`},read));
 expect(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/one-more'},read)).toEqual({saved:false,reason:'cap',cap:'linked_events'});
 // Marking interest in a link the group holds is not adding one.
 expect(ok(await linkEvent(t.db,f.memberA,{...f.root,url:'https://lu.ma/a0'},read)).existing).toBe(true);
 // Another member has their own ten.
 ok(await linkEvent(t.db,f.memberB,{...f.root,url:'https://lu.ma/b0'},read));
 for(let n=11;n<EVENTS.upcoming;n++)await t.db.query("insert into emba_team_event(org_id,loop_id,slug,name) values($1,$2,$3,'Filler')",[f.orgId,f.rootId,`filler-${n}`]);
 expect(await linkEvent(t.db,f.memberB,{...f.root,url:'https://lu.ma/b1'},read)).toEqual({saved:false,reason:'cap',cap:'upcoming_events'});
});
it('lets the member who added a link take it back while nobody else is interested',async()=>{
 const f=await fixture(),read=pages({[luma]:dinner});
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},read));
 expect(await unlinkEvent(t.db,f.memberB,{...f.root,event:'founders-dinner'})).toEqual({saved:false,reason:'not_yours'});
 await setInterest(t.db,f.memberB,{...f.root,event:'founders-dinner'});
 expect(await unlinkEvent(t.db,f.memberA,{...f.root,event:'founders-dinner'})).toEqual({saved:false,reason:'others_interested'});
 expect(await rows('select archived_at is null as live from emba_team_event')).toEqual([{live:true}]);
 await setInterest(t.db,f.memberB,{...f.root,event:'founders-dinner',interested:false});
 expect(await unlinkEvent(t.db,f.memberA,{...f.root,event:'founders-dinner'})).toMatchObject({saved:true,event:{archived:true}});
 expect((await upcomingEvents(t.db,f.memberA,f.root)).events.items).toEqual([]);
 expect(await unlinkEvent(t.db,f.memberA,{...f.root,event:'founders-dinner'})).toEqual({saved:false,reason:'unknown_event',value:'founders-dinner'});
 // A removed link can be added again.
 expect(ok(await linkEvent(t.db,f.memberB,{...f.root,url:luma},read))).toMatchObject({existing:false,event:{slug:'founders-dinner',interested:1}});
 // An event an organizer added is nobody's to take back, and an organizer still archives a linked one.
 await addEvent(t.db,f.organizer,{...f.root,slug:'mixer',name:'Mixer'});
 expect(await unlinkEvent(t.db,f.organizer,{...f.root,event:'mixer'})).toEqual({saved:false,reason:'not_yours'});
 expect(await archiveEvent(t.db,f.organizer,{...f.root,event:'founders-dinner'})).toMatchObject({saved:true});
});

const moved=(over:Partial<Extract<PageRead,{ok:true}>['facts']>):PageRead=>({ok:true,facts:{...(dinner as Extract<PageRead,{ok:true}>).facts,...over}});
it('follows the source once a day: a moved start changes the event, is reported, and moves sent invites',async()=>{
 const f=await fixture();
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},pages({[luma]:dinner})));
 await t.db.query('update emba_team_event set invites_at=clock_timestamp()');
 const start=await whatsNew(t.db,f.memberB,f.root);
 // Nothing changed at the source: nothing is reported.
 expect(await rereadLinkedEvents(t.db,pages({[luma]:dinner}))).toEqual({read:1,changed:0,gone:0});
 expect((await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor})).changes).toEqual([]);
 expect(await rereadLinkedEvents(t.db,pages({[luma]:moved({startsAt:'2099-01-16T00:00:00.000Z',place:'Room 2'})}))).toEqual({read:1,changed:1,gone:0});
 const news=await whatsNew(t.db,f.memberB,{...f.root,cursor:start.cursor});
 expect(news.changes.map(change=>[change.action,change.event?.startsAt,change.event?.place])).toEqual([['event_changed','2099-01-16T00:00:00.000Z','Room 2']]);
 // Loop made the change, not a member; the calendar entry has a new version.
 expect(await rows("select actor_id,client_id from emba_team_change where action='event_changed'")).toEqual([{actor_id:null,client_id:null}]);
 expect(await rows('select sequence from emba_team_event')).toEqual([{sequence:1}]);
});
it('labels an event whose page is gone or cancelled and never archives it; an unreadable page changes nothing',async()=>{
 const f=await fixture();
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},pages({[luma]:dinner})));
 expect(await rereadLinkedEvents(t.db,pages({}))).toEqual({read:1,changed:0,gone:0});
 let [event]=(await upcomingEvents(t.db,f.memberB,f.root)).events.items;
 expect(event).toMatchObject({startsAt:'2099-01-15T23:00:00.000Z',place:'40 E 1st St'});expect(event).not.toHaveProperty('sourceGone');
 expect(await rereadLinkedEvents(t.db,pages({[luma]:{ok:false,reason:'gone'}}))).toEqual({read:1,changed:0,gone:1});
 [event]=(await upcomingEvents(t.db,f.memberB,f.root)).events.items;
 expect(event).toMatchObject({slug:'founders-dinner',archived:false,interested:1,sourceGone:true});
 // The page is back: the label goes.
 await rereadLinkedEvents(t.db,pages({[luma]:dinner}));
 expect((await upcomingEvents(t.db,f.memberB,f.root)).events.items[0]).not.toHaveProperty('sourceGone');
});
it('leaves an event an organizer changed by hand as they set it',async()=>{
 const f=await fixture(),read=pages({[luma]:moved({place:'Somewhere else'})});
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},pages({[luma]:dinner})));
 // A note is not one of the followed facts.
 await changeEvent(t.db,f.organizer,{...f.root,event:'founders-dinner',note:'Bring a friend.'});
 expect(await rows('select source_follow as follow from emba_team_event')).toEqual([{follow:true}]);
 await changeEvent(t.db,f.organizer,{...f.root,event:'founders-dinner',place:'Sage Hall'});
 expect(await rows('select source_follow as follow from emba_team_event')).toEqual([{follow:false}]);
 expect(await rereadLinkedEvents(t.db,read)).toEqual({read:0,changed:0,gone:0});
 expect(read).not.toHaveBeenCalled();
 expect((await upcomingEvents(t.db,f.memberA,f.root)).events.items[0].place).toBe('Sage Hall');
});
it('reads at most 200 events a run, the one read longest ago first, and skips those that have passed',async()=>{
 const f=await fixture();
 await t.db.query(`insert into emba_team_event(org_id,loop_id,slug,name,starts_at,url,source,source_follow,source_read_at)
  select $1,$2,'bulk-'||n,'Bulk '||n,'2099-01-01T00:00:00Z','https://lu.ma/bulk-'||n,'link',true,timestamptz '2026-01-01'+n*interval '1 minute' from generate_series(1,$3::int) n`,[f.orgId,f.rootId,REREAD.most+5]);
 await t.db.query("insert into emba_team_event(org_id,loop_id,slug,name,starts_at,url,source,source_follow) values($1,$2,'past','Past','2020-01-01T00:00:00Z','https://lu.ma/past','link',true)",[f.orgId,f.rootId]);
 const read=pages({});
 expect((await rereadLinkedEvents(t.db,read)).read).toBe(REREAD.most);
 expect(read.mock.calls[0][0]).toBe('https://lu.ma/bulk-1');expect(read.mock.calls.map(call=>call[0])).not.toContain('https://lu.ma/past');
 // The next run starts with the ones this run did not reach.
 read.mockClear();await rereadLinkedEvents(t.db,read);
 expect(read.mock.calls.slice(0,5).map(call=>call[0])).toEqual([201,202,203,204,205].map(n=>`https://lu.ma/bulk-${n}`));
});
it('runs the daily read from the daily job, which answers as before even if that read fails',async()=>{
 const f=await fixture();
 ok(await linkEvent(t.db,f.memberA,{...f.root,url:luma},pages({[luma]:dinner})));
 await t.db.query("update emba_team_event set source_read_at='2026-01-01T00:00:00Z'");
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:404}));
 try{
  const {GET}=await import('@/app/api/cron/daily/route');
  const answer=await GET(new Request('https://loop.test/api/cron/daily',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  expect(await answer.json()).toEqual({idled:0});
  expect(fetch.mock.calls.map(call=>String(call[0]))).toEqual([luma]);
  expect(await rows('select source_gone_at is not null as gone,archived_at is null as live from emba_team_event')).toEqual([{gone:true,live:true}]);
 }finally{fetch.mockRestore();}
});
