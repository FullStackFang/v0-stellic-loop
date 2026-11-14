// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {grantRole,revokeMembership} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import {addEvent,archiveEvent,changeEvent,createTeamEvent,EVENTS,listTeamEvents,restoreEvent,type EventWrite} from '@/lib/emba/team-events';
import {eventDetail,eventShare,setInterest,upcomingEvents} from '@/lib/emba/team-interest';
import {saveBrief,teamState,whatsNew} from '@/lib/emba/team-read';
import {fileOutput,LIMITS,postAnnouncement} from '@/lib/emba/team-records';

// Specs: openspec/changes/loop-club-events-and-asks/specs/group-events.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'club',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
/** An assistant acting for a person, with a grant for the team. */
async function assistant(f:F,who:Principal,actions:string[]=['plan:read','group-memory:write'],client='claude',scope:{orgId:string;loopId:string}=f.root) {
 await grantLease(t.db,who,{...scope,clientId:client,actions,expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const ok=(result:EventWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const mixer=(f:F,extra:Record<string,unknown>={})=>({...f.root,slug:'spring-mixer',name:'Spring mixer',startsAt:'2099-01-15T18:00',place:'Statler Hall',...extra});
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const idFree=(value:unknown,f:F)=>{const text=JSON.stringify(value);for(const person of [...f.members,f.organizer])expect(text).not.toContain(person.personId);expect(text).not.toMatch(uuids);};
const follower=(f:F,who:Principal)=>t.db.query("update emba_role set role='follower' where person_id=$1",[who.personId]);
const interest=(who:Principal,f:F,event='spring-mixer',extra:Record<string,unknown>={})=>setInterest(t.db,who,{...f.root,event,...extra});

it('saves an event\'s date, end, place, link and note in the team\'s timezone, and refuses an end before the start',async()=>{
 const f=await fixture();
 const added=ok(await addEvent(t.db,f.organizer,mixer(f,{endsAt:'2099-01-15T21:00',url:'https://example.com/mixer',note:'Bring  a\nfriend.'})));
 // 18:00 in New York in January is 23:00 UTC; members read it in the team's timezone.
 expect(added.event).toMatchObject({slug:'spring-mixer',name:'Spring mixer',startsAt:'2099-01-15T23:00:00.000Z',endsAt:'2099-01-16T02:00:00.000Z',timezone:'America/New_York',place:'Statler Hall',url:'https://example.com/mixer',note:'Bring a friend.',archived:false,interested:0,youAreInterested:false});
 expect(added.event.starts).toMatch(/^[A-Z][a-z]{2} 15 Jan 2099, 18:00$/);expect(added.event.ends).toMatch(/15 Jan 2099, 21:00$/);
 expect(added.event.shareUrl).toMatch(/\/e\/[0-9a-f]{32}$/);
 // A moment with an offset is taken as written.
 expect(ok(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',startsAt:'2099-01-15T17:30:00-05:00'})).event.startsAt).toBe('2099-01-15T22:30:00.000Z');
 // Nothing is saved, and the answer says which value is wrong.
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',endsAt:'2099-01-15T12:00'})).toEqual({saved:false,reason:'end_before_start'});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'late',name:'Late',startsAt:'2099-02-01T10:00',endsAt:'2099-02-01T09:00'})).toEqual({saved:false,reason:'end_before_start'});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'late',name:'Late',endsAt:'2099-02-01T09:00'})).toEqual({saved:false,reason:'end_needs_start'});
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',startsAt:null})).toEqual({saved:false,reason:'end_needs_start'});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'late',name:'Late',url:'http://example.com'})).toEqual({saved:false,reason:'link_refused',problem:'not_https'});
 expect(await addEvent(t.db,f.organizer,mixer(f))).toEqual({saved:false,reason:'name_taken'});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'ana',name:'Ana'})).toEqual({saved:false,reason:'name_taken'});
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'no-such',name:'X'})).toEqual({saved:false,reason:'unknown_event',value:'no-such'});
 for(const bad of [{startsAt:'tomorrow'},{startsAt:'2099-02-30T10:00'},{place:'x'.repeat(121)},{note:'x'.repeat(601)},{name:'x'.repeat(81)},{extra:1}])
  await expect(addEvent(t.db,f.organizer,{...f.root,slug:'bad',name:'Bad',...bad})).rejects.toThrow();
 expect((await t.db.query('select slug from emba_team_event order by slug')).rows).toEqual([{slug:'spring-mixer'}]);
 // Fields left out stay; null clears one; the stored row is what the answer said.
 const cleared=ok(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',endsAt:null,note:null,place:'Room 12'}));
 expect(cleared.event).toMatchObject({startsAt:'2099-01-15T22:30:00.000Z',endsAt:null,note:null,place:'Room 12',url:'https://example.com/mixer'});
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',place:'Room 12'})).toMatchObject({saved:true,changed:false});
 // The database keeps the rules too.
 await expect(t.db.query("update emba_team_event set ends_at=starts_at-interval '1 hour' where slug='spring-mixer'")).rejects.toThrow();
 await expect(t.db.query("update emba_team_event set place=$1 where slug='spring-mixer'",['a‮b'])).rejects.toThrow();
 idFree(cleared,f);
});
it('keeps an undated event working as a label for records',async()=>{
 const f=await fixture();
 const label=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 expect(label).toMatchObject({slug:'final-deck',startsAt:null,starts:null,shareUrl:null});
 expect(await fileOutput(t.db,f.memberA,{...f.root,url:'https://docs.google.com/document/d/abc',title:'Deck',summary:'Draft.',decisionsVersion:0,event:'final-deck'})).toMatchObject({saved:true,record:{event:'final-deck'}});
 expect((await teamState(t.db,f.memberA,{...f.root,event:'final-deck'})).outputs.items).toHaveLength(1);
});
it('lets an owner or organizer manage events through an assistant with a read-and-write grant, and nobody else',async()=>{
 const f=await fixture();
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.memberB.personId]);
 const lead=await assistant(f,f.memberB),member=await assistant(f,f.memberA);
 const added=ok(await addEvent(t.db,lead,mixer(f)));
 expect(added.event.slug).toBe('spring-mixer');
 ok(await changeEvent(t.db,lead,{...f.root,event:'spring-mixer',place:'Room 12'}));
 ok(await archiveEvent(t.db,lead,{...f.root,event:'spring-mixer'}));
 // The change log names the assistant.
 expect((await t.db.query('select action,client_id,actor_id=$1 as lead from emba_team_change where event_id is not null order by seq',[f.memberB.personId])).rows).toEqual([
  {action:'event_added',client_id:'claude',lead:true},{action:'event_changed',client_id:'claude',lead:true},{action:'event_archived',client_id:'claude',lead:true}]);
 // An archived event is restored on the site only.
 const [archived]=await listTeamEvents(t.db,f.organizer,{...f.root,archived:true});
 await expect(restoreEvent(t.db,lead,{orgId:f.orgId,eventId:archived.id})).rejects.toThrow('forbidden');
 await expect(listTeamEvents(t.db,f.memberA,{...f.root,archived:true})).rejects.toThrow('forbidden');
 expect(await restoreEvent(t.db,f.organizer,{orgId:f.orgId,eventId:archived.id})).toMatchObject({saved:true,changed:true,event:{archived:false}});
 // A member, on the site or through an assistant, is told who can; nothing is saved.
 for(const who of [member,f.memberA]){
  expect(await addEvent(t.db,who,{...f.root,slug:'mine',name:'Mine'})).toEqual({saved:false,reason:'organizers_only'});
  expect(await changeEvent(t.db,who,{...f.root,event:'spring-mixer',name:'Mine'})).toEqual({saved:false,reason:'organizers_only'});
  expect(await archiveEvent(t.db,who,{...f.root,event:'spring-mixer'})).toEqual({saved:false,reason:'organizers_only'});
 }
 // An organizer's assistant with a read-only grant, a grant for another team, or no grant: denied.
 await expect(addEvent(t.db,await assistant(f,f.organizer,['plan:read'],'reader'),{...f.root,slug:'ro',name:'Read only'})).rejects.toThrow('forbidden');
 await expect(addEvent(t.db,await assistant(f,f.organizer,['plan:read','group-memory:write'],'elsewhere',f.vietnam),{...f.root,slug:'other',name:'Other'})).rejects.toThrow('forbidden');
 await expect(addEvent(t.db,f.nonmember,{...f.root,slug:'out',name:'Out'})).rejects.toThrow('forbidden');
 // No other organizer action became available to an assistant.
 await expect(saveBrief(t.db,lead,{...f.root,body:'From an assistant',expectedVersion:1})).rejects.toThrow('forbidden');
 await expect(postAnnouncement(t.db,lead,{...f.root,text:'From an assistant'})).rejects.toThrow('forbidden');
 expect((await t.db.query('select slug from emba_team_event where archived_at is null')).rows).toEqual([{slug:'spring-mixer'}]);
});
it('counts an assistant\'s event writes toward the hourly limit, and caps upcoming events at 50',async()=>{
 const f=await fixture(),lead=await assistant(f,f.organizer);
 for(let i=0;i<LIMITS.writesPerHour;i++)ok(await addEvent(t.db,lead,{...f.root,slug:`event-${i}`,name:`Event ${i}`}));
 expect(await addEvent(t.db,lead,{...f.root,slug:'one-more',name:'One more'})).toEqual({saved:false,reason:'cap',cap:'writes_per_hour'});
 // The site is not rate limited for events; the cap on upcoming events applies to everyone.
 for(let i=LIMITS.writesPerHour;i<EVENTS.upcoming;i++)ok(await addEvent(t.db,f.organizer,{...f.root,slug:`event-${i}`,name:`Event ${i}`}));
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'too-many',name:'Too many'})).toEqual({saved:false,reason:'cap',cap:'upcoming_events'});
 ok(await archiveEvent(t.db,f.organizer,{...f.root,event:'event-0'}));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'fits-now',name:'Fits now'}));
 // Restoring an archived event is held to the same cap.
 const [archived]=await listTeamEvents(t.db,f.organizer,{...f.root,archived:true});
 expect(await restoreEvent(t.db,f.organizer,{orgId:f.orgId,eventId:archived.id})).toEqual({saved:false,reason:'cap',cap:'upcoming_events'});
},120000);
it('counts and lists only members whose sign-in is still live',async()=>{
 const f=await fixture();
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 for(const who of f.members.slice(0,3))await interest(who,f);
 await t.db.query('update emba_identity set revoked_at=clock_timestamp() where person_id=$1',[f.members[2].personId]);
 const seen=await eventDetail(t.db,f.memberA,{...f.root,event:'spring-mixer'});
 expect([seen.event.interested,seen.event.people.length]).toEqual([2,2]);
});

it('lets a member mark interest and take it back, one state per member, never for anyone else',async()=>{
 const f=await fixture();
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 expect(await interest(f.memberA,f)).toMatchObject({saved:true,interested:true,changed:true,event:{interested:1,youAreInterested:true}});
 // Marking twice is harmless and says so.
 expect(await interest(f.memberA,f)).toMatchObject({saved:true,interested:true,changed:false,event:{interested:1}});
 expect(await interest(f.memberB,f,'spring-mixer',{route:'share_link'})).toMatchObject({saved:true,event:{interested:2,youAreInterested:true}});
 const agent=await assistant(f,f.members[2]);
 expect(await interest(agent,f)).toMatchObject({saved:true,event:{interested:3}});
 // How each mark arrived is stored, and an assistant cannot state its own route.
 expect((await t.db.query('select route,client_id from emba_event_interest order by at')).rows).toEqual([{route:'site',client_id:null},{route:'share_link',client_id:null},{route:'assistant',client_id:'claude'}]);
 expect((await interest(agent,f,'spring-mixer',{route:'site'})).saved).toBe(true);
 expect((await t.db.query("select route from emba_event_interest where client_id='claude'")).rows).toEqual([{route:'assistant'}]);
 // Taking it back.
 expect(await interest(f.memberA,f,'spring-mixer',{interested:false})).toMatchObject({saved:true,interested:false,changed:true,event:{interested:2,youAreInterested:false}});
 expect(await interest(f.memberA,f,'spring-mixer',{interested:false})).toMatchObject({saved:true,changed:false});
 // There is no way to name another person, and an unknown or archived event saves nothing.
 await expect(setInterest(t.db,f.memberA,{...f.root,event:'spring-mixer',personId:f.memberB.personId})).rejects.toThrow();
 expect(await interest(f.memberA,f,'no-such')).toEqual({saved:false,reason:'unknown_event',value:'no-such'});
 // A follower can read and cannot post; an assistant with a read-only grant and a non-member are denied.
 await follower(f,f.members[3]);
 expect(await interest(f.members[3],f)).toEqual({saved:false,reason:'members_only'});
 await expect(interest(await assistant(f,f.members[4],['plan:read'],'reader'),f)).rejects.toThrow('forbidden');
 await expect(interest(f.nonmember,f)).rejects.toThrow('forbidden');
 ok(await archiveEvent(t.db,f.organizer,{...f.root,event:'spring-mixer'}));
 expect(await interest(f.memberA,f)).toEqual({saved:false,reason:'unknown_event',value:'spring-mixer'});
 expect((await t.db.query('select count(*)::int as n from emba_event_interest')).rows).toEqual([{n:2}]);
});
it('lists upcoming events soonest first, undated last, at most 30, and drops events 12 hours past',async()=>{
 const f=await fixture();
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'later',name:'Later',startsAt:'2099-03-01T10:00'}));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'label',name:'Label'}));
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'gone',name:'Gone',startsAt:'2099-01-01T10:00'}));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'just-ended',name:'Just ended',startsAt:'2099-01-02T10:00'}));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'long-running',name:'Long running',startsAt:'2099-01-03T10:00',endsAt:'2099-01-04T10:00'}));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'hidden',name:'Hidden',startsAt:'2099-01-05T10:00'}));
 ok(await archiveEvent(t.db,f.organizer,{...f.root,event:'hidden'}));
 // 13 hours past its start with no end; 2 hours past; started 3 days ago and ended 2 hours ago.
 await t.db.query("update emba_team_event set starts_at=clock_timestamp()-interval '13 hours' where slug='gone'");
 await t.db.query("update emba_team_event set starts_at=clock_timestamp()-interval '2 hours' where slug='just-ended'");
 await t.db.query("update emba_team_event set starts_at=clock_timestamp()-interval '3 days',ends_at=clock_timestamp()-interval '2 hours' where slug='long-running'");
 await interest(f.memberA,f);await interest(f.memberB,f);
 const list=await upcomingEvents(t.db,f.memberA,f.root);
 expect(list).toMatchObject({team:{handle:'@club'},timezone:'America/New_York',untrusted:true});
 expect(list.events.items.map(event=>[event.slug,event.interested,event.youAreInterested])).toEqual([['long-running',0,false],['just-ended',0,false],['spring-mixer',2,true],['later',0,false],['label',0,false]]);
 expect(list.events.more).toBe(0);expect(list.events.items[0]).not.toHaveProperty('people');
 idFree(list,f);
 // An assistant with a read grant reads the same list; no grant, another team's grant, or no membership reads nothing.
 expect((await upcomingEvents(t.db,await assistant(f,f.memberB,['plan:read'],'reader'),f.root)).events.items.map(event=>[event.slug,event.youAreInterested])[2]).toEqual(['spring-mixer',true]);
 await expect(upcomingEvents(t.db,await assistant(f,f.memberB,['plan:read'],'elsewhere',f.vietnam),f.root)).rejects.toThrow('forbidden');
 await expect(upcomingEvents(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 for(let i=0;i<32;i++)ok(await addEvent(t.db,f.organizer,{...f.root,slug:`night-${i}`,name:`Night ${i}`,startsAt:`2099-04-${String(i%28+1).padStart(2,'0')}T19:00`}));
 const long=await upcomingEvents(t.db,f.memberA,f.root);
 expect([long.events.items.length,long.events.more]).toEqual([30,7]);
},120000);
it('shows members who is interested: handles or "a teammate" to an assistant, names on the site, no ids',async()=>{
 const f=await fixture();
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 for(const who of [f.memberB,f.members[2],f.memberA])await interest(who,f);
 const agent=await assistant(f,f.memberA,['plan:read'],'reader');
 const seen=await eventDetail(t.db,agent,{...f.root,event:'spring-mixer'});
 // The caller first, then by handle; a member with no handle has no name here.
 expect(seen.event.people).toEqual([{handle:'@club/ana',isYou:true,former:false},{handle:'@club/ben',isYou:false,former:false},{handle:null,isYou:false,former:false}]);
 expect(seen.event).toMatchObject({interested:3,youAreInterested:true,morePeople:0});
 idFree(seen,f);
 // On the site, members and followers see names.
 await follower(f,f.members[3]);
 for(const who of [f.memberA,f.members[3]]){
  const site=await eventDetail(t.db,who,{...f.root,event:'spring-mixer'});
  expect(site.event.people.map(person=>person.name).sort()).toEqual(['Member 3','Member A','Member B']);
  idFree(site,f);
 }
 expect((await upcomingEvents(t.db,f.memberB,{...f.root,people:true})).events.items[0]).toMatchObject({slug:'spring-mixer',people:[{name:'Member B',isYou:true},{name:'Member 3'},{name:'Member A'}]});
 await expect(eventDetail(t.db,f.nonmember,{...f.root,event:'spring-mixer'})).rejects.toThrow('forbidden');
 await expect(eventDetail(t.db,f.memberA,{...f.root,event:'no-such'})).rejects.toThrow('not_found');
});
it('shows someone outside the team the event\'s facts only, a count only at five or more, and never a name',async()=>{
 const f=await fixture();
 const added=ok(await addEvent(t.db,f.organizer,mixer(f,{note:'Members only detail',url:'https://example.com/private'})));
 const token=added.event.shareUrl!.split('/').at(-1)!;
 for(const who of f.members.slice(0,4))await interest(who,f);
 const facts={group:'Synthetic EMBA',name:'Spring mixer',startsAt:'2099-01-15T23:00:00.000Z',endsAt:null,ends:null,timezone:'America/New_York',place:'Statler Hall'};
 // Four interested: nothing about interest, signed out or signed in.
 for(const who of [null,f.nonmember]){
  const page=await eventShare(t.db,who,token);
  expect(page).toMatchObject({view:'outside',signedIn:who!==null,join:null,outside:{...facts,interested:null}});
  expect(Object.keys(page.outside).sort()).toEqual(['ends','endsAt','group','interested','name','place','starts','startsAt','timezone']);
  expect(JSON.stringify(page)).not.toMatch(/Member|@club|Members only detail|example\.com/);idFree(page,f);
 }
 await interest(f.members[4],f);await interest(f.members[5],f);
 const six=await eventShare(t.db,null,token);
 expect(six.outside.interested).toBe(6);expect(JSON.stringify(six)).not.toMatch(/Member|@club/);
 // A member who leaves is no longer counted; five is still shown, four is not.
 await interest(f.members[5],f,'spring-mixer',{interested:false});
 expect((await eventShare(t.db,null,token)).outside.interested).toBe(5);
 await follower(f,f.members[4]);
 expect((await eventShare(t.db,null,token)).outside.interested).toBeNull();
 // A member gets the member view, with the outside view beside it for the link preview. An assistant never gets the member view here.
 const member=await eventShare(t.db,f.memberA,token);
 expect(member).toMatchObject({view:'member',namespace:'club',scope:f.root,detail:{event:{slug:'spring-mixer',youAreInterested:true,note:'Members only detail'}},outside:{interested:null}});
 expect((await eventShare(t.db,await assistant(f,f.memberA),token)).view).toBe('outside');
 // The token grants nothing and names only a dated, current event.
 await expect(eventShare(t.db,null,'0'.repeat(32))).rejects.toThrow('not_found');
 await expect(eventShare(t.db,null,'not-a-token')).rejects.toThrow();
 const label=ok(await addEvent(t.db,f.organizer,{...f.root,slug:'label',name:'Label'}));
 expect(label.event.shareUrl).toBeNull();
 const {rows:[row]}=await t.db.query<{share_token:string}>("select share_token from emba_team_event where slug='label'");
 await expect(eventShare(t.db,f.memberA,row.share_token)).rejects.toThrow('not_found');
 ok(await archiveEvent(t.db,f.organizer,{...f.root,event:'spring-mixer'}));
 await expect(eventShare(t.db,f.memberA,token)).rejects.toThrow('not_found');
 expect((await t.db.query('select 1 from emba_membership where person_id=$1',[f.nonmember.personId])).rows).toEqual([]);
});
it('reports a new event, a change of time or place and an archive in what is new, and never interest',async()=>{
 const f=await fixture();
 const start=await whatsNew(t.db,f.memberA,f.root);
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 for(const who of f.members.slice(0,5))await interest(who,f);
 await interest(f.memberA,f,'spring-mixer',{interested:false});
 const first=await whatsNew(t.db,f.memberA,{...f.root,cursor:start.cursor});
 expect(first.changes.map(item=>[item.action,item.event?.slug,item.event?.place,item.by.isYou,item.assistant])).toEqual([['event_added','spring-mixer','Statler Hall',false,null]]);
 expect(first.changes[0].event!.starts).toMatch(/15 Jan 2099, 18:00$/);
 // A new name or note is not a change of time or place.
 ok(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',name:'Spring mixer!',note:'New note'}));
 expect((await whatsNew(t.db,f.memberA,{...f.root,cursor:first.cursor})).changes).toEqual([]);
 ok(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',startsAt:'2099-01-16T18:00'}));
 ok(await changeEvent(t.db,f.organizer,{...f.root,event:'spring-mixer',place:'Room 12'}));
 ok(await archiveEvent(t.db,f.organizer,{...f.root,event:'spring-mixer'}));
 const next=await whatsNew(t.db,f.memberA,{...f.root,cursor:first.cursor});
 expect(next.changes.map(item=>item.action)).toEqual(['event_changed','event_changed','event_archived']);
 expect(next.changes.every(item=>item.record===undefined&&item.event?.name==='Spring mixer!')).toBe(true);
 idFree(next,f);
 expect((await t.db.query('select count(*)::int as n from emba_team_change')).rows).toEqual([{n:4}]);
});
it('removes interest when a member leaves, loses the right to post or deletes their account, and lists it in their export',async()=>{
 const f=await fixture();
 ok(await addEvent(t.db,f.organizer,mixer(f)));
 ok(await addEvent(t.db,f.organizer,{...f.root,slug:'tasting',name:'Tasting',startsAt:'2099-02-01T19:00'}));
 for(const who of f.members.slice(0,4)){await interest(who,f);await interest(who,f,'tasting');}
 const recent=await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.parse(forever),authenticatedAt:Date.now()-1000}));
 expect((await exportPersonalData(t.db,recent!)).eventInterests).toMatchObject([{slug:'spring-mixer',name:'Spring mixer',route:'site'},{slug:'tasting',route:'site'}]);
 const counts=async()=>(await upcomingEvents(t.db,f.organizer,{...f.root,people:true})).events.items.map(event=>[event.slug,event.interested,'people' in event?event.people.length:null]);
 expect(await counts()).toEqual([['spring-mixer',4,4],['tasting',4,4]]);
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberA.personId});
 expect(await counts()).toEqual([['spring-mixer',3,3],['tasting',3,3]]);
 await grantRole(t.db,f.organizer,{...f.root,personId:f.memberB.personId,role:'follower'});
 expect(await counts()).toEqual([['spring-mixer',2,2],['tasting',2,2]]);
 await applyDeletionTombstones(t.db,[f.members[2].personId]);
 expect(await counts()).toEqual([['spring-mixer',1,1],['tasting',1,1]]);
 expect((await t.db.query('select person_id from emba_event_interest')).rows).toEqual([{person_id:f.members[3].personId},{person_id:f.members[3].personId}]);
 expect((await t.db.query('select 1 from emba_team_write where person_id=any($1::uuid[])',[[f.members[2].personId]])).rows).toEqual([]);
});
