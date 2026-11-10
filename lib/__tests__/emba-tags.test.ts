// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {registerGroupAddress,retireGroupAddress} from '@/lib/emba/groups';
import {createMemoryMcpServer} from '@/lib/emba/mcp';
import {applyDeletionTombstones} from '@/lib/emba/privacy';
import {revokeMembership} from '@/lib/emba/roles';
import {getMemberHandle,listTags,resolveTag,setMemberHandle} from '@/lib/emba/tags';
import {archiveTeamEvent,createTeamEvent,listTeamEvents,renameTeamEvent} from '@/lib/emba/team-events';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const unavailable={status:'unavailable',matches:[]};
const forever='2099-01-01T00:00:00Z';
// Team = any addressed group: the root (@cohort) and a nested trip group
// (@cohort/vietnam). Events are labels under a team.
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'cohort',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'vietnam'});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,scopes=['plan:read']) {
 return (await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId:'claude',scopes,expiresAt:Date.parse(forever)})))!;
}
const lease=(f:F,scope:{orgId:string;loopId:string})=>grantLease(t.db,f.memberA,{...scope,clientId:'claude',actions:['plan:read'],expiresAt:forever});
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

it('reports every addressed group as a team: the root by namespace, a nested group by its address',async()=>{
 const f=await fixture();
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort'})).toEqual({status:'resolved',matches:[{kind:'team',handle:'@cohort',...f.root,team:'Synthetic EMBA'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/workspace'})).toMatchObject({status:'resolved',matches:[{kind:'team',handle:'@cohort'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@vietnam'})).toEqual({status:'resolved',matches:[{kind:'team',handle:'@cohort/vietnam',...f.vietnam,team:'Synthetic EMBA'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/vietnam'})).toMatchObject({status:'resolved',matches:[{kind:'team'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@nothing'})).toEqual(unavailable);
 await expect(resolveTag(t.db,f.memberA,{handle:'cohort'})).rejects.toThrow();
});
it('lets an owner or organizer create, rename and archive events on the site only',async()=>{
 const f=await fixture();
 const event=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 expect(await listTeamEvents(t.db,f.memberA,f.root)).toEqual([{id:event.id,slug:'final-deck',name:'Final deck',archived:false}]);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/final-deck'})).toEqual({status:'resolved',matches:[{kind:'event',handle:'@cohort/final-deck',name:'Final deck',team:'Synthetic EMBA',teamHandle:'@cohort'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@final-deck'})).toMatchObject({status:'resolved',matches:[{kind:'event'}]});
 // A plain member, a non-member and any assistant are denied.
 await expect(createTeamEvent(t.db,f.memberA,{...f.root,slug:'mine',name:'Mine'})).rejects.toThrow('forbidden');
 await expect(createTeamEvent(t.db,f.nonmember,{...f.root,slug:'mine',name:'Mine'})).rejects.toThrow('forbidden');
 await expect(renameTeamEvent(t.db,f.memberA,{orgId:f.orgId,eventId:event.id,slug:'taken',name:'Taken'})).rejects.toThrow('forbidden');
 await expect(archiveTeamEvent(t.db,f.memberA,{orgId:f.orgId,eventId:event.id})).rejects.toThrow('forbidden');
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.memberA.personId]);
 await grantLease(t.db,f.memberA,{...f.root,clientId:'claude',actions:['plan:read','activity:write'],expiresAt:forever});
 await expect(createTeamEvent(t.db,await assistant(f,['plan:read','activity:write']),{...f.root,slug:'by-agent',name:'By agent'})).rejects.toThrow('forbidden');
 for(const bad of [{slug:'Final',name:'x'},{slug:'everyone',name:'Everyone'},{slug:'ok-slug',name:''},{slug:'ok-slug',name:'\u3164\u200B'},{slug:'ok-slug',name:'---'},{slug:'ok-slug',name:'x'.repeat(81)}])
  await expect(createTeamEvent(t.db,f.organizer,{...f.root,...bad})).rejects.toThrow();
 await renameTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id,slug:'deck',name:'Deck'});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/final-deck'})).toEqual(unavailable);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/deck'})).toMatchObject({status:'resolved',matches:[{name:'Deck'}]});
 await archiveTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/deck'})).toEqual(unavailable);
 expect(await listTeamEvents(t.db,f.memberA,f.root)).toEqual([]);
 await expect(renameTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id,slug:'deck',name:'Deck'})).rejects.toThrow('conflict');
 // An archived event releases its name.
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'deck',name:'Deck again'});
 await expect(listTeamEvents(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
});
it('keeps one namespace per team across handles, event slugs and group slugs',async()=>{
 const f=await fixture();
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 const event=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 // A handle may not equal an event or group slug.
 await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'final-deck'})).rejects.toThrow('conflict');
 await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'vietnam'})).rejects.toThrow('conflict');
 await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'workspace'})).rejects.toThrow('conflict');
 // An event may not equal a handle, a group slug or another event, on any team in the namespace.
 await expect(createTeamEvent(t.db,f.organizer,{...f.root,slug:'maya',name:'Maya'})).rejects.toThrow('conflict');
 await expect(createTeamEvent(t.db,f.organizer,{...f.root,slug:'vietnam',name:'Vietnam'})).rejects.toThrow('conflict');
 await expect(createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'final-deck',name:'Other deck'})).rejects.toThrow('conflict');
 await expect(renameTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id,slug:'maya',name:'Maya'})).rejects.toThrow('conflict');
 // A group may not take a handle or an event slug.
 await expect(registerGroupAddress(t.db,f.organizer,{...f.estonia,namespace:'cohort',slug:'maya'})).rejects.toThrow('conflict');
 await expect(registerGroupAddress(t.db,f.organizer,{...f.estonia,namespace:'cohort',slug:'final-deck'})).rejects.toThrow('conflict');
 // A failed attempt changes nothing; freeing a handle frees the name.
 expect(await getMemberHandle(t.db,f.memberA,f.orgId)).toBeNull();
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya-c'});
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'maya',name:'Maya'});
 // The database, not only the service, enforces the rule.
 await expect(t.db.query('insert into emba_member_handle(org_id,person_id,handle) values($1,$2,$3)',[f.orgId,f.memberA.personId,'maya'])).rejects.toThrow();
 for(const handle of ['@cohort/maya','@cohort/maya-c','@cohort/final-deck','@cohort/vietnam'])expect((await resolveTag(t.db,f.memberA,{handle})).status).toBe('resolved');
});
it('lets a member choose one handle per team on the site only, unique within the team',async()=>{
 const f=await fixture();
 expect(await getMemberHandle(t.db,f.memberA,f.orgId)).toBeNull();
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya-c'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya-c'});
 expect(await getMemberHandle(t.db,f.memberA,f.orgId)).toBe('maya-c');
 await expect(setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya-c'})).rejects.toThrow('conflict');
 // The first name was released by the change.
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 await expect(setMemberHandle(t.db,f.nonmember,{orgId:f.orgId,handle:'outsider'})).rejects.toThrow('forbidden');
 await expect(setMemberHandle(t.db,await assistant(f),{orgId:f.orgId,handle:'by-agent'})).rejects.toThrow('forbidden');
 for(const handle of ['Maya','m','a b','x'.repeat(49)]) await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle})).rejects.toThrow();
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:null});
 expect(await getMemberHandle(t.db,f.memberA,f.orgId)).toBeNull();
 expect(await resolveTag(t.db,f.memberB,{handle:'@maya-c'})).toEqual(unavailable);
});
it('resolves a person only among teammates and never returns a person id',async()=>{
 const f=await fixture();
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 const found=await resolveTag(t.db,f.memberA,{handle:'@maya'});
 expect(found).toEqual({status:'resolved',matches:[{kind:'person',handle:'@cohort/maya',team:'Synthetic EMBA',isYou:false}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/maya'})).toMatchObject({status:'resolved'});
 expect(await resolveTag(t.db,f.memberB,{handle:'@maya'})).toMatchObject({matches:[{isYou:true}]});
 expect(await resolveTag(t.db,f.nonmember,{handle:'@maya'})).toEqual(unavailable);
 const listed=JSON.stringify([found,await listTags(t.db,f.memberA,{})]);
 for(const person of [f.memberA,f.memberB,f.organizer])expect(listed).not.toContain(person.personId);
 // A person whose sign-in was revoked can no longer be tagged.
 await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[f.memberB.personId]);
 expect(await resolveTag(t.db,f.memberA,{handle:'@maya'})).toEqual(unavailable);
});
it('deletes the handle when a member is removed, freeing the name',async()=>{
 const f=await fixture();
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberB.personId});
 expect(await resolveTag(t.db,f.memberA,{handle:'@maya'})).toEqual(unavailable);
 expect((await t.db.query('select 1 from emba_member_handle where person_id=$1',[f.memberB.personId])).rows).toEqual([]);
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya'});
 expect(await resolveTag(t.db,f.organizer,{handle:'@cohort/maya'})).toMatchObject({status:'resolved',matches:[{kind:'person'}]});
});
it('reports every match for a short handle used in more than one team',async()=>{
 const f=await fixture();
 // A second organization the same person belongs to, with the same short name.
 const other='00000000-0000-4000-8000-000000000901',otherRoot='00000000-0000-4000-8000-000000000902';
 await t.db.query('insert into emba_organization(id,name) values($1,$2)',[other,'Other team']);
 await t.db.query('insert into emba_loop(id,org_id,path) values($1,$2,$3)',[otherRoot,other,'other']);
 for(const [person,role] of [[f.organizer,'owner'],[f.memberA,'member']] as const){
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[other,person.personId]);
  await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)',[other,otherRoot,person.personId,role]);
 }
 await registerGroupAddress(t.db,f.organizer,{orgId:other,loopId:otherRoot,namespace:'other',slug:'home'});
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'kickoff',name:'Kickoff'});
 await createTeamEvent(t.db,f.organizer,{orgId:other,loopId:otherRoot,slug:'kickoff',name:'Kickoff'});
 const result=await resolveTag(t.db,f.memberA,{handle:'@kickoff'});
 expect(result.status).toBe('ambiguous');
 expect(result.matches.map(match=>match.handle).sort()).toEqual(['@cohort/kickoff','@other/kickoff']);
 expect(await resolveTag(t.db,f.memberA,{handle:'@other/kickoff'})).toMatchObject({status:'resolved',matches:[{teamHandle:'@other'}]});
 // Someone in only one of the teams sees one match, not a hint of the other.
 expect(await resolveTag(t.db,f.memberB,{handle:'@kickoff'})).toMatchObject({status:'resolved',matches:[{handle:'@cohort/kickoff'}]});
});
it('shows an assistant only what its member granted, and nothing after revocation',async()=>{
 const f=await fixture(),p=await assistant(f);
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 await createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'hanoi-day',name:'Hanoi day'});
 const nothing={teams:[],events:[],people:[],partial:false};
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toEqual(unavailable);
 expect(await resolveTag(t.db,p,{handle:'@maya'})).toEqual(unavailable);
 expect(await listTags(t.db,p,{})).toEqual(nothing);
 // Consent for a nested group gives that group and its events, and none of the parent team's people or events.
 await lease(f,f.vietnam);
 expect(await listTags(t.db,p,{})).toEqual({teams:[expect.objectContaining({handle:'@cohort/vietnam'})],events:[expect.objectContaining({handle:'@cohort/hanoi-day',teamHandle:'@cohort/vietnam'})],people:[],partial:false});
 expect(await resolveTag(t.db,p,{handle:'@maya'})).toEqual(unavailable);
 expect(await resolveTag(t.db,p,{handle:'@cohort/final-deck'})).toEqual(unavailable);
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toEqual(unavailable);
 // Consent for the team covers its events and people with no separate grant.
 const granted=await lease(f,f.root);
 expect(await resolveTag(t.db,p,{handle:'@maya'})).toMatchObject({status:'resolved',matches:[{kind:'person'}]});
 expect(await resolveTag(t.db,p,{handle:'@final-deck'})).toMatchObject({status:'resolved',matches:[{kind:'event'}]});
 expect(await listTags(t.db,p,{})).toMatchObject({teams:[{handle:'@cohort/vietnam'},{handle:'@cohort'}],events:[{handle:'@cohort/final-deck'},{handle:'@cohort/hanoi-day'}],people:[{handle:'@cohort/maya'}]});
 await revokeLease(t.db,f.memberA,granted.id);
 expect(await resolveTag(t.db,p,{handle:'@maya'})).toEqual(unavailable);
 expect(await resolveTag(t.db,p,{handle:'@final-deck'})).toEqual(unavailable);
 expect(await resolveTag(t.db,await assistant(f,[]),{handle:'@vietnam'})).toEqual(unavailable);
 expect(await listTags(t.db,await assistant(f,[]),{})).toEqual(nothing);
});
it('marks a long listing as partial and still resolves an exact handle',async()=>{
 const f=await fixture();
 await t.db.query(`insert into emba_team_event(org_id,loop_id,slug,name) select $1,$2,'event-'||lpad(n::text,3,'0'),'Event '||n from generate_series(1,201) n`,[f.orgId,f.rootId]);
 const listed=await listTags(t.db,f.memberA,{});
 expect(listed.partial).toBe(true);
 expect(listed.events).toHaveLength(200);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/event-201'})).toMatchObject({status:'resolved',matches:[{name:'Event 201'}]});
});
it('keeps the tables out of the Data API and returns no person id over MCP',async()=>{
 const f=await fixture(),p=await assistant(f);await lease(f,f.root);
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 for(const role of ['anon','authenticated'])for(const table of ['emba_member_handle','emba_team_event','emba_team_name'])
  await expect(t.db.tx(async q=>{await q.query(`set local role ${role}`);await q.query(`select * from ${table}`);})).rejects.toThrow();
 const server=createMemoryMcpServer(t.db,p),client=new Client({name:'claude',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(b);await client.connect(a);
 try{
  const resolved=await client.callTool({name:'resolve_tag',arguments:{handle:'@maya'}});
  expect(resolved.structuredContent).toEqual({status:'resolved',matches:[{kind:'person',handle:'@cohort/maya',team:'Synthetic EMBA',isYou:false}]});
  const listed=await client.callTool({name:'list_tags',arguments:{}});
  expect(listed.structuredContent).toMatchObject({teams:[{handle:'@cohort'}],events:[{handle:'@cohort/final-deck'}],people:[{handle:'@cohort/maya'}],partial:false});
  // The only ids an assistant receives are the team's own org and loop.
  const ids=new Set(JSON.stringify([resolved,listed]).match(uuids));
  expect([...ids].sort()).toEqual([f.orgId,f.rootId].sort());
  expect((await client.callTool({name:'resolve_tag',arguments:{handle:'no-at-sign'}})).isError).toBe(true);
 }finally{await client.close();await server.close();}
});
// Findings from the section 1 review (2026-11-10).
it('keeps the team name itself out of reach, so @team can only mean the team',async()=>{
 const f=await fixture();
 await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'cohort'})).rejects.toThrow('conflict');
 await expect(createTeamEvent(t.db,f.organizer,{...f.root,slug:'cohort',name:'Cohort'})).rejects.toThrow('conflict');
 await expect(registerGroupAddress(t.db,f.organizer,{...f.estonia,namespace:'cohort',slug:'cohort'})).rejects.toThrow('conflict');
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort'})).toMatchObject({status:'resolved',matches:[{kind:'team',handle:'@cohort'}]});
 for(const handle of ['everyone','all','team','me'])await expect(setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle})).rejects.toThrow();
});
it('resolves an exact handle beyond the listing limits for teams, events and people',async()=>{
 const f=await fixture();
 // The root sorts last, after 56 nested teams, so a listing of 50 holds neither it nor the late teams.
 await t.db.query(`insert into emba_loop(id,org_id,parent_id,path) select gen_random_uuid(),$1,$2,'emba/aa'||lpad(n::text,3,'0') from generate_series(1,56) n`,[f.orgId,f.rootId]);
 await t.db.query(`insert into emba_group_address(org_id,loop_id,namespace,slug) select org_id,id,'cohort','aa'||right(path,3) from emba_loop where org_id=$1 and path like 'emba/aa%'`,[f.orgId]);
 const {rows:[late]}=await t.db.query<{id:string}>("select id from emba_loop where path='emba/aa056'");
 await createTeamEvent(t.db,f.organizer,{orgId:f.orgId,loopId:late.id,slug:'late-event',name:'Late event'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 const listed=await listTags(t.db,f.memberA,{});
 expect(listed.partial).toBe(true);
 expect(listed.teams.map(team=>team.handle)).not.toContain('@cohort/aa056');
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/aa056'})).toMatchObject({status:'resolved',matches:[{kind:'team',loopId:late.id}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/late-event'})).toMatchObject({status:'resolved',matches:[{kind:'event',teamHandle:'@cohort/aa056'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@late-event'})).toMatchObject({status:'resolved'});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/maya'})).toMatchObject({status:'resolved',matches:[{kind:'person'}]});
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort'})).toMatchObject({status:'resolved',matches:[{kind:'team',handle:'@cohort'}]});
 // An assistant still needs consent for the exact team.
 const p=await assistant(f);
 expect(await resolveTag(t.db,p,{handle:'@cohort/late-event'})).toEqual(unavailable);
 await lease(f,{orgId:f.orgId,loopId:late.id});
 expect(await resolveTag(t.db,p,{handle:'@cohort/late-event'})).toMatchObject({status:'resolved'});
 expect(await resolveTag(t.db,p,{handle:'@cohort/maya'})).toEqual(unavailable);
});
it('removes the handle and the creator link on account deletion, and keeps the event',async()=>{
 const f=await fixture();
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.memberB.personId]);
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 const event=await createTeamEvent(t.db,f.memberB,{...f.root,slug:'final-deck',name:'Final deck'});
 await applyDeletionTombstones(t.db,[f.memberB.personId]);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/maya'})).toEqual(unavailable);
 expect((await t.db.query("select 1 from emba_team_name where name='maya'")).rows).toEqual([]);
 expect((await t.db.query('select created_by from emba_team_event where id=$1',[event.id])).rows).toEqual([{created_by:null}]);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/final-deck'})).toMatchObject({status:'resolved'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya'});
});
it('does not let consent for the team reach a nested team, and stops at revocation or expiry',async()=>{
 const f=await fixture(),p=await assistant(f);
 await createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'hanoi-day',name:'Hanoi day'});
 const granted=await lease(f,f.root);
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toMatchObject({status:'resolved'});
 expect(await resolveTag(t.db,p,{handle:'@cohort/vietnam'})).toEqual(unavailable);
 expect(await resolveTag(t.db,p,{handle:'@cohort/hanoi-day'})).toEqual(unavailable);
 expect((await listTags(t.db,p,{})).events).toEqual([]);
 await t.db.query("update emba_lease set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 second' where id=$1",[granted.id]);
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toEqual(unavailable);
 expect(await listTags(t.db,p,{})).toEqual({teams:[],events:[],people:[],partial:false});
 const again=await lease(f,f.root);
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toMatchObject({status:'resolved'});
 await revokeLease(t.db,f.memberA,again.id);
 expect(await resolveTag(t.db,p,{handle:'@cohort'})).toEqual(unavailable);
 expect(await listTags(t.db,p,{})).toEqual({teams:[],events:[],people:[],partial:false});
});
it('stores an event name as one clean line and refuses unsafe names at the database too',async()=>{
 const f=await fixture();
 const event=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'  Final\u2028deck\u202E \u200Bv2\n'});
 expect(event.name).toBe('Final deck v2');
 expect((await createTeamEvent(t.db,f.organizer,{...f.root,slug:'marks',name:`a${'\u0301'.repeat(40)}b`})).name).toBe('a\u0301\u0301\u0301\u0301b'.normalize('NFC'));
 for(const name of ['a\u202Eb','two\nlines','a\u2028b','a\u200Bb'])
  await expect(t.db.query('insert into emba_team_event(org_id,loop_id,slug,name) values($1,$2,$3,$4)',[f.orgId,f.rootId,'direct',name])).rejects.toThrow();
});
it('keeps the name registry in step with its sources and refuses names for a retired team',async()=>{
 const f=await fixture();
 const names=async()=>(await t.db.query<{name:string;kind:string}>('select name,kind from emba_team_name where org_id=$1 order by name',[f.orgId])).rows.map(row=>`${row.kind}:${row.name}`);
 expect(await names()).toEqual(['namespace:cohort','group:vietnam','group:workspace']);
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'maya'});
 const event=await createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'hanoi-day',name:'Hanoi day'});
 expect(await names()).toEqual(['namespace:cohort','event:hanoi-day','person:maya','group:vietnam','group:workspace']);
 // Two active events can never share a slug, even past the registry.
 await expect(t.db.tx(async q=>{await q.query('alter table emba_team_event disable trigger emba_team_event_name');await q.query('insert into emba_team_event(org_id,loop_id,slug,name) values($1,$2,$3,$4)',[f.orgId,f.rootId,'hanoi-day','Copy']);})).rejects.toThrow();
 await t.db.query('truncate emba_member_handle');
 expect(await names()).toEqual(['namespace:cohort','event:hanoi-day','group:vietnam','group:workspace']);
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'maya'});
 // After the team's address is retired its event can be archived but not renamed.
 await retireGroupAddress(t.db,f.organizer,f.vietnam);
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/hanoi-day'})).toEqual(unavailable);
 await expect(renameTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id,slug:'new-name',name:'New name'})).rejects.toThrow('forbidden');
 await expect(createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'another',name:'Another'})).rejects.toThrow('forbidden');
 await archiveTeamEvent(t.db,f.organizer,{orgId:f.orgId,eventId:event.id});
 expect(await names()).toEqual(['namespace:cohort','person:maya','group:vietnam','group:workspace']);
});
it('treats an unknown event and another organization\'s event alike, for people and assistants',async()=>{
 const f=await fixture();
 const event=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 const wrongOrg='00000000-0000-4000-8000-000000000999';
 for(const [who,orgId,eventId] of [[f.organizer,wrongOrg,event.id],[f.organizer,f.orgId,wrongOrg],[f.nonmember,f.orgId,event.id],[await assistant(f),f.orgId,event.id]] as const){
  await expect(archiveTeamEvent(t.db,who,{orgId,eventId})).rejects.toThrow('forbidden');
  await expect(renameTeamEvent(t.db,who,{orgId,eventId,slug:'stolen',name:'Stolen'})).rejects.toThrow('forbidden');
 }
 expect(await resolveTag(t.db,f.memberA,{handle:'@cohort/final-deck'})).toMatchObject({status:'resolved'});
});
