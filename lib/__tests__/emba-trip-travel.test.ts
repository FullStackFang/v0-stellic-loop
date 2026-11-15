// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {revokeMembership} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import {saveBrief} from '@/lib/emba/team-read';
import {arrivals,removeTravel,saveTravel,type TravelWrite} from '@/lib/emba/team-travel';

// Specs: openspec/changes/loop-trip/specs/trip-travel.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'trip',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'trip',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 await saveBrief(t.db,f.organizer,{...root,body:'Vietnam trip.',timezone:'Asia/Bangkok',expectedVersion:0});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,who:Principal,actions:string[]=['plan:read','group-memory:write'],client='claude',scope:{orgId:string;loopId:string}=f.root) {
 await grantLease(t.db,who,{...scope,clientId:client,actions,expiresAt:forever});
 return (await authenticate(t.db,'test',async()=>({issuer:who.issuer,subject:who.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
}
const ok=(result:TravelWrite)=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const follower=(who:Principal)=>t.db.query("update emba_role set role='follower' where person_id=$1",[who.personId]);

it('saves a member\'s own travel in one call through an assistant and returns it in full',async()=>{
 const f=await fixture(),agent=await assistant(f,f.memberA);
 const saved=ok(await saveTravel(t.db,agent,{...f.root,arrivesAt:'2099-03-03T14:20',arrivesPlace:'Hanoi',arrivesFlight:'vn 54'}));
 // 14:20 in Hanoi is 07:20 UTC; the flight number is stored in one spelling.
 expect(saved).toMatchObject({changed:true,entry:{who:{handle:'@trip/ana',isYou:true},arrival:{at:'2099-03-03T07:20:00.000Z',timed:true,place:'Hanoi',flight:'VN 54'},departure:null,stay:null,assistant:'claude',nearYourArrival:false}});
 expect(saved.entry.arrival!.when).toMatch(/3 Mar 2099, 14:20$/);expect(saved.entry.changedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect(JSON.stringify(saved)).not.toMatch(uuids);
 // Fields left out stay; null clears one; saving the same again changes nothing.
 const more=ok(await saveTravel(t.db,f.memberA,{...f.root,departsAt:'2099-03-10',departsPlace:'Ho Chi Minh City',stay:'Hotel Metropole'}));
 expect(more.entry).toMatchObject({arrival:{place:'Hanoi',flight:'VN 54'},departure:{at:'2099-03-09T17:00:00.000Z',timed:false,place:'Ho Chi Minh City',flight:null},stay:'Hotel Metropole',assistant:null});
 expect(more.entry.departure!.when).toMatch(/^[A-Z][a-z]{2} 10 Mar 2099$/);
 expect(await saveTravel(t.db,f.memberA,{...f.root,stay:'Hotel Metropole'})).toMatchObject({saved:true,changed:false});
 expect(ok(await saveTravel(t.db,f.memberA,{...f.root,arrivesFlight:null,stay:null})).entry).toMatchObject({arrival:{place:'Hanoi',flight:null},stay:null});
 expect((await t.db.query('select count(*)::int as n from emba_travel')).rows).toEqual([{n:1}]);
});
it('needs an arrival or a departure, and a day for the side a place or flight belongs to',async()=>{
 const f=await fixture();
 expect(await saveTravel(t.db,f.memberA,{...f.root,stay:'Hotel Metropole'})).toEqual({saved:false,reason:'incomplete',problem:'no_day'});
 expect(await saveTravel(t.db,f.memberA,{...f.root,departsAt:'2099-03-10T09:00',arrivesPlace:'Hanoi'})).toEqual({saved:false,reason:'incomplete',problem:'arrival_needs_day'});
 expect(await saveTravel(t.db,f.memberA,{...f.root,arrivesAt:'2099-03-03',departsFlight:'VN 55'})).toEqual({saved:false,reason:'incomplete',problem:'departure_needs_day'});
 ok(await saveTravel(t.db,f.memberA,{...f.root,arrivesAt:'2099-03-03T14:20',arrivesPlace:'Hanoi'}));
 // Clearing the only day is refused, and the entry stays as it was.
 expect(await saveTravel(t.db,f.memberA,{...f.root,arrivesAt:null})).toEqual({saved:false,reason:'incomplete',problem:'no_day'});
 for(const bad of [{arrivesAt:'next week'},{arrivesAt:'2099-02-30'},{arrivesPlace:'x'.repeat(121)},{arrivesFlight:'!'},{stay:'x'.repeat(121)},{extra:1}])
  await expect(saveTravel(t.db,f.memberA,{...f.root,arrivesAt:'2099-03-03',...bad})).rejects.toThrow();
 expect((await arrivals(t.db,f.memberA,f.root)).yours).toMatchObject({arrival:{place:'Hanoi',timed:true}});
 // The database keeps the rule too.
 await expect(t.db.query('update emba_travel set arrives_at=null')).rejects.toThrow();
});
it('lets nobody write or delete another person\'s entry, and only members who may post write their own',async()=>{
 const f=await fixture();
 ok(await saveTravel(t.db,f.memberB,{...f.root,arrivesAt:'2099-03-03T15:05',arrivesPlace:'Hanoi'}));
 // There is no way to name another person: the field is refused, for a member and for an owner.
 for(const who of [f.memberA,f.organizer])await expect(saveTravel(t.db,who,{...f.root,personId:f.memberB.personId,arrivesAt:'2099-03-04T10:00'})).rejects.toThrow();
 await expect(removeTravel(t.db,f.organizer,{...f.root,personId:f.memberB.personId})).rejects.toThrow();
 expect(await removeTravel(t.db,f.organizer,f.root)).toEqual({saved:true,removed:false});
 expect((await arrivals(t.db,f.memberB,f.root)).yours).toMatchObject({arrival:{at:'2099-03-03T08:05:00.000Z'}});
 // A follower reads and cannot write; a read-only assistant, an assistant granted another team, and a non-member are denied.
 await follower(f.members[3]);
 expect(await saveTravel(t.db,f.members[3],{...f.root,arrivesAt:'2099-03-03'})).toEqual({saved:false,reason:'members_only'});
 await expect(saveTravel(t.db,await assistant(f,f.members[4],['plan:read'],'reader'),{...f.root,arrivesAt:'2099-03-03'})).rejects.toThrow('forbidden');
 await expect(saveTravel(t.db,await assistant(f,f.members[4],['plan:read','group-memory:write'],'elsewhere',f.vietnam),{...f.root,arrivesAt:'2099-03-03'})).rejects.toThrow('forbidden');
 await expect(saveTravel(t.db,f.nonmember,{...f.root,arrivesAt:'2099-03-03'})).rejects.toThrow('forbidden');
 expect((await t.db.query('select count(*)::int as n from emba_travel')).rows).toEqual([{n:1}]);
});
it('lists arrivals in time order to members and followers, marks who lands near the caller, and says nothing of members with no entry',async()=>{
 const f=await fixture();
 ok(await saveTravel(t.db,f.memberA,{...f.root,arrivesAt:'2099-03-03T14:20',arrivesPlace:'Hanoi',departsAt:'2099-03-10T09:00',departsPlace:'Da Nang'}));
 ok(await saveTravel(t.db,f.memberB,{...f.root,arrivesAt:'2099-03-03T15:05',arrivesPlace:'hanoi',departsAt:'2099-03-10T11:30',departsPlace:'Da Nang'}));
 // Same place, two hours and one minute later; another place at the same time; the same day with no time; a departure only.
 ok(await saveTravel(t.db,f.members[2],{...f.root,arrivesAt:'2099-03-03T16:21',arrivesPlace:'Hanoi'}));
 ok(await saveTravel(t.db,f.members[3],{...f.root,arrivesAt:'2099-03-03T14:20',arrivesPlace:'Da Nang'}));
 ok(await saveTravel(t.db,f.members[4],{...f.root,arrivesAt:'2099-03-03',arrivesPlace:'Hanoi'}));
 ok(await saveTravel(t.db,f.members[5],{...f.root,departsAt:'2099-03-10T10:00',departsPlace:'Da Nang'}));
 const agent=await assistant(f,f.memberA,['plan:read'],'reader'),seen=await arrivals(t.db,agent,f.root);
 expect(seen).toMatchObject({team:{handle:'@trip'},timezone:'Asia/Bangkok',untrusted:true,yours:{who:{isYou:true},nearYourArrival:false,nearYourDeparture:false}});
 expect(seen.entries.items.map(entry=>[entry.who.handle,entry.arrival?.place??null,entry.nearYourArrival,entry.nearYourDeparture])).toEqual([
  [null,'Hanoi',false,false],['@trip/ana','Hanoi',false,false],[null,'Da Nang',false,false],['@trip/ben','hanoi',true,false],[null,'Hanoi',false,false],[null,null,false,true]]);
 expect(seen.entries.more).toBe(0);
 // To an assistant: handles or nobody's name, and no ids. Two members have no entry, and nothing is said of them.
 const text=JSON.stringify(seen);expect(text).not.toMatch(uuids);expect(text).not.toMatch(/Member/);expect(seen.entries.items).toHaveLength(6);
 // Each side is the caller's own: the marks are different for another reader.
 expect((await arrivals(t.db,f.members[5],f.root)).entries.items.map(entry=>entry.nearYourDeparture)).toEqual([false,true,false,true,false,false]);
 // On the site, a follower reads names. A caller with no entry sees no marks.
 await follower(f.members[6]);
 const site=await arrivals(t.db,f.members[6],f.root);
 expect(site.yours).toBeNull();expect(site.entries.items.map(entry=>entry.who.name)).toContain('Member B');
 expect(site.entries.items.some(entry=>entry.nearYourArrival||entry.nearYourDeparture)).toBe(false);
 await expect(arrivals(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 await expect(arrivals(t.db,await assistant(f,f.memberB,['plan:read'],'elsewhere',f.vietnam),f.root)).rejects.toThrow('forbidden');
});
it('deletes the entry on request, on leaving and on account deletion, and lists it in the export',async()=>{
 const f=await fixture();
 for(const who of f.members.slice(0,4))ok(await saveTravel(t.db,who,{...f.root,arrivesAt:'2099-03-03T14:20',arrivesPlace:'Hanoi'}));
 const listed=async()=>(await arrivals(t.db,f.organizer,f.root)).entries.items.length;
 const recent=await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.parse(forever),authenticatedAt:Date.now()-1000}));
 expect((await exportPersonalData(t.db,recent!)).travel).toMatchObject([{arrives_place:'Hanoi',arrives_timed:true,departs_at:null}]);
 expect(await removeTravel(t.db,f.memberA,f.root)).toEqual({saved:true,removed:true});
 expect(await listed()).toBe(3);
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberB.personId});
 expect(await listed()).toBe(2);
 await applyDeletionTombstones(t.db,[f.members[2].personId]);
 expect(await listed()).toBe(1);
 expect((await t.db.query('select person_id from emba_travel')).rows).toEqual([{person_id:f.members[3].personId}]);
});
