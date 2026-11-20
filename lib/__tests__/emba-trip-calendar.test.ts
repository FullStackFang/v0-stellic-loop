// @vitest-environment node
import ICAL from 'ical.js';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {setReachChoice} from '@/lib/emba/reach';
import {drainReach,type Carrier} from '@/lib/emba/reach-send';
import {revokeMembership} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import {calendarFeed,feedAddress,newFeedAddress,sendEventInvites} from '@/lib/emba/team-calendar';
import {addEvent,archiveEvent,changeEvent,restoreEvent} from '@/lib/emba/team-events';
import {cancelIdea,changeIdea,proposeIdea} from '@/lib/emba/team-ideas';
import {setInterest} from '@/lib/emba/team-interest';
import {saveBrief} from '@/lib/emba/team-read';
import {saveTravel} from '@/lib/emba/team-travel';

// Specs: openspec/changes/loop-trip/specs/calendar-invites.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
afterEach(()=>{vi.unstubAllEnvs();});
const on=()=>{vi.stubEnv('LOOP_REACH_SENDING','on');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://loop.test');};
/** A timezone in which it is now about noon, so no test stands inside the quiet hours. */
const noon=()=>{let offset=12-new Date().getUTCHours();if(offset>12)offset-=24;if(offset<-11)offset+=24;return offset>=0?`Etc/GMT-${offset}`:`Etc/GMT+${-offset}`;};
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'trip',slug:'workspace'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await saveBrief(t.db,f.organizer,{...root,body:'Vietnam trip.',timezone:noon(),expectedVersion:0});
 return {...f,root,a:f.memberA,b:f.memberB,c:f.members[2],d:f.members[3]};
}
type F=Awaited<ReturnType<typeof fixture>>;
type Sent=Parameters<Carrier['email']>[0];
function carrier(){
 const sent:Sent[]=[];
 const address=(personId:string)=>`${personId.slice(-3)}@example.test`;
 const it:Carrier={address:async personId=>address(personId),email:async message=>{sent.push(message);return {ok:true,providerId:null};}};
 /** Sends what is queued and returns only what this run sent. */
 const run=async()=>{const from=sent.length;await drainReach(t.db,it);return sent.slice(from);};
 return {it,sent,run,address:(p:Principal)=>address(p.personId)};
}
const inDays=(days:number,time='15:00')=>`${new Date(Date.now()+days*86400000).toISOString().slice(0,10)}T${time}:00Z`;
const join=async(f:F,who:Principal,event:string,interested=true)=>{const result=await setInterest(t.db,who,{...f.root,event,interested});if(!result.saved)throw new Error(`not marked: ${JSON.stringify(result)}`);return result;};
/** The calendar file of a message, parsed, with the RFC 5545 line rules ical.js does not check. */
function entry(message:Sent){
 const content=message.calendar!.content;
 expect(content.endsWith('\r\n')).toBe(true);
 for(const line of content.split('\r\n'))expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
 const calendar=new ICAL.Component(ICAL.parse(content)),events=calendar.getAllSubcomponents('vevent');
 expect(events).toHaveLength(1);
 const event=events[0],text=(name:string)=>event.getFirstPropertyValue(name) as string|null;
 return {content,method:calendar.getFirstPropertyValue('method'),uid:text('uid'),sequence:Number(event.getFirstPropertyValue('sequence')),summary:text('summary'),location:text('location'),description:text('description'),status:text('status'),
  start:(event.getFirstPropertyValue('dtstart') as ICAL.Time).toJSDate().toISOString(),end:(event.getFirstPropertyValue('dtend') as ICAL.Time).toJSDate().toISOString(),
  attendees:event.getAllProperties('attendee').map(property=>String(property.getFirstValue())),organizer:String(event.getFirstPropertyValue('organizer'))};
}
/** A plan of A's with A, B and C in. */
async function plan(f:F){
 const saved=await proposeIdea(t.db,f.a,{...f.root,name:'Buy suits; bring cash',startsAt:inDays(3),place:'Tailor, Hang Gai'});
 if(!saved.saved)throw new Error('not proposed');
 await join(f,f.b,saved.event.slug);await join(f,f.c,saved.event.slug);
 return saved.event.slug;
}

it('sends each member who is in an invite that names the plan, its time, place and group, and nobody else',async()=>{
 const f=await fixture(),c=carrier();on();
 // C does not take email from this team: they see the plan on the site, in their assistant and in the feed.
 await setReachChoice(t.db,f.c,{...f.root,way:'none'});
 await plan(f);
 const sent=await c.run();
 expect(sent.map(message=>message.to).sort()).toEqual([c.address(f.a),c.address(f.b)].sort());
 const mail=sent.find(message=>message.to===c.address(f.b))!,ics=entry(mail);
 expect(mail.calendar!.method).toBe('REQUEST');
 expect(ics).toMatchObject({method:'REQUEST',summary:'Buy suits; bring cash',location:'Tailor, Hang Gai',description:'Synthetic EMBA',status:'CONFIRMED',sequence:1,start:new Date(inDays(3)).toISOString(),
  end:new Date(Date.parse(inDays(3))+3600000).toISOString(),attendees:[`mailto:${c.address(f.b)}`],organizer:'mailto:invites@loop.test'});
 expect(ics.uid).toMatch(/^[0-9a-f]{32}@loop\.test$/);
 // The member already said they are in: the entry asks for no reply.
 expect(ics.content).toMatch(/ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:/);
 expect(mail.subject).toBe('Synthetic EMBA: Buy suits; bring cash');
 expect(mail.text).toContain('you are in on this');expect(mail.text).toContain('Tailor, Hang Gai');expect(mail.text).toMatch(/Open in Loopd: https:\/\/loop\.test\/e\/[0-9a-f]{32}/);
 expect(mail.text).toMatch(/Stop messages from Synthetic EMBA: https:\/\/loop\.test\/groups\/reach\/stop\/[0-9a-f]{32}/);
 // No other member's name, handle or address is in any part of any invite.
 for(const message of sent){
  const others=[f.a,f.b,f.c].filter(person=>c.address(person)!==message.to).map(person=>c.address(person));
  const all=message.subject+message.text+message.html+message.calendar!.content;
  for(const other of others)expect(all).not.toContain(other);
  expect(all).not.toMatch(/Member [A-Z0-9]|@trip|ana|ben/);
 }
 // A second run sends nothing more.
 expect(await c.run()).toEqual([]);
},120000);
it('moves the same calendar entry when the time or place changes, and cancels it when the plan is cancelled',async()=>{
 const f=await fixture(),c=carrier();on();
 const slug=await plan(f);
 const first=(await c.run()).map(entry);
 expect(first).toHaveLength(3);
 expect(await changeIdea(t.db,f.a,{...f.root,event:slug,startsAt:inDays(3,'16:00')})).toMatchObject({saved:true,changed:true});
 const moved=await c.run();
 expect(moved).toHaveLength(3);
 for(const message of moved){
  const ics=entry(message);
  // The same entry, a later version: the calendar replaces it and no second entry appears.
  expect(ics).toMatchObject({method:'REQUEST',uid:first[0].uid,start:new Date(inDays(3,'16:00')).toISOString()});
  expect(ics.sequence).toBeGreaterThan(first[0].sequence);
  expect(message.text).toContain('the time or place of this has changed');
 }
 // A new name or note is not a new version.
 expect(await changeIdea(t.db,f.a,{...f.root,event:slug,note:'Bring cash'})).toMatchObject({saved:true,changed:true});
 expect(await c.run()).toEqual([]);
 // Two changes before the next run: only the later one is sent.
 await changeIdea(t.db,f.a,{...f.root,event:slug,place:'Other tailor'});await changeIdea(t.db,f.a,{...f.root,event:slug,place:'Third tailor'});
 const latest=await c.run();
 expect(latest.map(message=>entry(message).location)).toEqual(['Third tailor','Third tailor','Third tailor']);
 expect(await cancelIdea(t.db,f.a,{...f.root,event:slug})).toMatchObject({saved:true});
 const cancelled=await c.run();
 expect(cancelled).toHaveLength(3);
 for(const message of cancelled){
  const ics=entry(message);
  expect(message.calendar!.method).toBe('CANCEL');
  expect(ics).toMatchObject({method:'CANCEL',uid:first[0].uid,status:'CANCELLED'});
  expect(ics.sequence).toBeGreaterThan(entry(latest[0]).sequence);
  expect(message.subject).toBe('Off your calendar · Synthetic EMBA: Buy suits; bring cash');
 }
},120000);
it('invites a member who joins later, and sends a member who drops out a cancellation of their own',async()=>{
 const f=await fixture(),c=carrier();on();
 const slug=await plan(f);
 await c.run();
 await join(f,f.d,slug);
 const late=await c.run();
 expect(late.map(message=>[message.to,message.calendar!.method])).toEqual([[c.address(f.d),'REQUEST']]);
 expect(late[0].text).toContain('you are in on this');
 await join(f,f.b,slug,false);
 const dropped=await c.run();
 // Only that member hears of it; the others' entries are unchanged.
 expect(dropped.map(message=>[message.to,message.calendar!.method])).toEqual([[c.address(f.b),'CANCEL']]);
 expect(entry(dropped[0]).attendees).toEqual([`mailto:${c.address(f.b)}`]);
 // Joining again brings the entry back, as a later version than the cancellation.
 await join(f,f.b,slug);
 const back=await c.run();
 expect(back.map(message=>[message.to,message.calendar!.method])).toEqual([[c.address(f.b),'REQUEST']]);
 expect(entry(back[0]).sequence).toBeGreaterThan(entry(dropped[0]).sequence);
 // Someone who joined and left before any run is sent nothing at all.
 await join(f,f.members[4],slug);await join(f,f.members[4],slug,false);
 expect(await c.run()).toEqual([]);
 // A member who has left the group is sent nothing, and a queued invite for them is dropped.
 await changeIdea(t.db,f.a,{...f.root,event:slug,place:'New place'});
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.d.personId});
 expect((await c.run()).map(message=>message.to).sort()).toEqual([c.address(f.a),c.address(f.b),c.address(f.c)].sort());
},120000);
it('queues nothing while sending is off, and still counts the versions',async()=>{
 const f=await fixture();
 const slug=await plan(f);
 await changeIdea(t.db,f.a,{...f.root,event:slug,place:'Elsewhere'});
 expect((await t.db.query('select count(*)::int as n from emba_reach_message')).rows).toEqual([{n:0}]);
 expect((await t.db.query('select sequence from emba_team_event where slug=$1',[slug])).rows).toEqual([{sequence:2}]);
});
it('lets an organizer send a fixed event as an invite to the members who marked interest',async()=>{
 const f=await fixture(),c=carrier();on();
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'mixer',name:'Mixer',startsAt:inDays(2,'18:00'),endsAt:inDays(2,'20:00'),place:'Rooftop'})).toMatchObject({saved:true});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'someday',name:'Someday'})).toMatchObject({saved:true});
 for(const member of f.members.slice(0,4))await join(f,member,'mixer');
 await setReachChoice(t.db,f.d,{...f.root,way:'none'});
 // Marking interest alone sends nothing.
 expect(await c.run()).toEqual([]);
 // Only an owner or organizer, only a dated event, and never an idea.
 expect(await sendEventInvites(t.db,f.a,{...f.root,event:'mixer'})).toEqual({saved:false,reason:'organizers_only'});
 expect(await sendEventInvites(t.db,f.organizer,{...f.root,event:'someday'})).toEqual({saved:false,reason:'no_date'});
 const idea=await proposeIdea(t.db,f.a,{...f.root,name:'An idea',startsAt:inDays(4),place:'Here'});
 expect(await sendEventInvites(t.db,f.organizer,{...f.root,event:'an-idea'})).toEqual({saved:false,reason:'unknown_event',value:'an-idea'});
 expect(idea.saved).toBe(true);
 expect(await sendEventInvites(t.db,f.organizer,{...f.root,event:'mixer'})).toEqual({saved:true,interested:4,sending:true});
 const sent=await c.run();
 expect(sent).toHaveLength(3);
 expect(entry(sent[0])).toMatchObject({method:'REQUEST',summary:'Mixer',location:'Rooftop',start:new Date(inDays(2,'18:00')).toISOString(),end:new Date(inDays(2,'20:00')).toISOString()});
 // From then on it behaves as a plan does: a later mark is invited, a change moves it, an archive cancels it.
 await join(f,f.members[4],'mixer');
 expect((await c.run()).map(message=>message.to)).toEqual([c.address(f.members[4])]);
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'mixer',place:'Courtyard'})).toMatchObject({saved:true});
 expect((await c.run()).map(message=>entry(message).location)).toEqual(['Courtyard','Courtyard','Courtyard','Courtyard']);
 expect(await archiveEvent(t.db,f.organizer,{...f.root,event:'mixer'})).toMatchObject({saved:true});
 expect((await c.run()).map(message=>message.calendar!.method)).toEqual(['CANCEL','CANCEL','CANCEL','CANCEL']);
},120000);
it('gives each member a private feed of fixed events and plans, with no names, ideas or travel',async()=>{
 const f=await fixture();vi.stubEnv('NEXT_PUBLIC_APP_URL','https://loop.test');
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'temple',name:'Temple visit',startsAt:inDays(2,'09:00'),place:'Temple of Literature',note:'Organizer note'})).toMatchObject({saved:true});
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'undated',name:'Undated thing'})).toMatchObject({saved:true});
 const slug=await plan(f);
 expect(await proposeIdea(t.db,f.a,{...f.root,name:'Secret idea',startsAt:inDays(5),place:'Nowhere yet'})).toMatchObject({saved:true});
 expect(await saveTravel(t.db,f.a,{...f.root,arrivesAt:inDays(1),arrivesPlace:'Hanoi airport',arrivesFlight:'VN 54',stay:'Hotel Metropole'})).toMatchObject({saved:true});
 expect(await feedAddress(t.db,f.b,f.root)).toBeNull();
 const address=await newFeedAddress(t.db,f.b,f.root);
 expect(address).toMatch(/^https:\/\/loop\.test\/api\/calendar\/[0-9a-f]{32}\/loop\.ics$/);
 expect(await feedAddress(t.db,f.b,f.root)).toBe(address);
 const token=address.split('/').at(-2)!,feed=(await calendarFeed(t.db,token))!;
 const calendar=new ICAL.Component(ICAL.parse(feed)),events=calendar.getAllSubcomponents('vevent');
 expect(calendar.getFirstPropertyValue('method')).toBe('PUBLISH');
 expect(events.map(event=>event.getFirstPropertyValue('summary'))).toEqual(['Temple visit','Buy suits; bring cash']);
 expect(events.map(event=>event.getFirstPropertyValue('location'))).toEqual(['Temple of Literature','Tailor, Hang Gai']);
 // No person at all: nobody who is interested or in, no organizer, no attendee; no idea that is not yet a plan; no travel; no note.
 expect(feed).not.toMatch(/ATTENDEE|ORGANIZER|Member [A-Z0-9]|@trip|ana|ben|Secret idea|Undated|Hanoi airport|VN 54|Metropole|Organizer note|example\.test/);
 for(const line of feed.split('\r\n'))expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
 // A new plan appears on the next fetch, with the same identity its invite has.
 await join(f,f.b,'secret-idea');await join(f,f.c,'secret-idea');
 expect((await calendarFeed(t.db,token))!).toContain('SUMMARY:Secret idea');
 // A cancelled plan and an archived event leave it.
 await cancelIdea(t.db,f.a,{...f.root,event:slug});await archiveEvent(t.db,f.organizer,{...f.root,event:'temple'});
 const later=(await calendarFeed(t.db,token))!;
 expect(later).not.toContain('Buy suits');expect(later).not.toContain('Temple visit');expect(later).toContain('Secret idea');
 // Replacing the address: the old one returns nothing.
 const replaced=await newFeedAddress(t.db,f.b,f.root);
 expect(replaced).not.toBe(address);
 expect(await calendarFeed(t.db,token)).toBeNull();
 expect(await calendarFeed(t.db,replaced.split('/').at(-2)!)).toContain('Secret idea');
 // A follower may hold one; someone outside the team may not; an assistant is never shown or given one.
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.d.personId]);
 expect(await newFeedAddress(t.db,f.d,f.root)).toMatch(/loop\.ics$/);
 await expect(newFeedAddress(t.db,f.nonmember,f.root)).rejects.toMatchObject({code:'forbidden'});
 await grantLease(t.db,f.b,{...f.root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:'2099-01-01T00:00:00Z'});
 const agent=(await authenticate(t.db,'test',async()=>({issuer:f.b.issuer,subject:f.b.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse('2099-01-01T00:00:00Z')})))!;
 await expect(feedAddress(t.db,agent,f.root)).rejects.toMatchObject({code:'forbidden'});
 await expect(newFeedAddress(t.db,agent,f.root)).rejects.toMatchObject({code:'forbidden'});
 // After leaving, the address returns nothing, and so does anything that is not a token.
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.b.personId});
 expect(await calendarFeed(t.db,replaced.split('/').at(-2)!)).toBeNull();
 expect((await t.db.query('select count(*)::int as n from emba_calendar_feed where person_id=$1',[f.b.personId])).rows).toEqual([{n:0}]);
 for(const bad of ['','x','0'.repeat(32),"' or 1=1 --"])expect(await calendarFeed(t.db,bad)).toBeNull();
});
it('takes an invited event out of calendars when it loses its date, puts it back when restored, and sends nothing for one that is over',async()=>{
 const f=await fixture(),c=carrier();on();
 expect(await addEvent(t.db,f.organizer,{...f.root,slug:'mixer',name:'Mixer',startsAt:inDays(2,'18:00'),place:'Rooftop'})).toMatchObject({saved:true});
 await join(f,f.a,'mixer');await join(f,f.b,'mixer');
 expect(await sendEventInvites(t.db,f.organizer,{...f.root,event:'mixer'})).toMatchObject({saved:true});
 const first=(await c.run()).map(entry);
 expect(first.map(ics=>ics.method)).toEqual(['REQUEST','REQUEST']);
 // The date is taken away: each calendar is told the entry is off.
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'mixer',startsAt:null})).toMatchObject({saved:true});
 const off=await c.run();
 expect(off.map(message=>message.calendar!.method)).toEqual(['CANCEL','CANCEL']);
 expect(entry(off[0])).toMatchObject({uid:first[0].uid,status:'CANCELLED'});
 expect(entry(off[0]).sequence).toBeGreaterThan(first[0].sequence);
 // A date again: the same entry returns.
 expect(await changeEvent(t.db,f.organizer,{...f.root,event:'mixer',startsAt:inDays(3,'18:00')})).toMatchObject({saved:true});
 const again=await c.run();
 expect(again.map(message=>entry(message).start)).toEqual([new Date(inDays(3,'18:00')).toISOString(),new Date(inDays(3,'18:00')).toISOString()]);
 // Archived and restored: off, then on.
 expect(await archiveEvent(t.db,f.organizer,{...f.root,event:'mixer'})).toMatchObject({saved:true});
 expect((await c.run()).map(message=>message.calendar!.method)).toEqual(['CANCEL','CANCEL']);
 const {rows:[row]}=await t.db.query<{id:string}>("select id from emba_team_event where slug='mixer'");
 expect(await restoreEvent(t.db,f.organizer,{orgId:f.orgId,eventId:row.id})).toMatchObject({saved:true});
 const back=await c.run();
 expect(back.map(message=>message.calendar!.method)).toEqual(['REQUEST','REQUEST']);
 expect(entry(back[0]).uid).toBe(first[0].uid);
 // It has taken place. Archiving it afterwards sends nobody a cancellation.
 await t.db.tx(async q=>{await q.query("set local session_replication_role='replica'");await q.query("update emba_team_event set starts_at=clock_timestamp()-interval '3 hours' where slug='mixer'");});
 expect(await archiveEvent(t.db,f.organizer,{...f.root,event:'mixer'})).toMatchObject({saved:true});
 expect(await c.run()).toEqual([]);
 // Asking for a new address twice at once leaves one address, and no error.
 const both=await Promise.all([newFeedAddress(t.db,f.a,f.root),newFeedAddress(t.db,f.a,f.root)]);
 expect(both).toContain(await feedAddress(t.db,f.a,f.root));
 expect((await t.db.query('select count(*)::int as n from emba_calendar_feed')).rows).toEqual([{n:1}]);
},120000);
