// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease} from '@/lib/emba/consent';
import {registerGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {listReachChoices,reachChoice,setReachChoice,stopFromLink,stopLinkPreview} from '@/lib/emba/reach';
import {revokeMembership} from '@/lib/emba/roles';
import {createAsk} from '@/lib/emba/team-asks';
import {addEvent} from '@/lib/emba/team-events';
import {setInterest} from '@/lib/emba/team-interest';
import {saveBrief} from '@/lib/emba/team-read';
import {releaseOnDeparture} from '@/lib/emba/team-records';

// Specs: openspec/changes/loop-club-reach/specs/reach-preferences.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
afterEach(()=>{vi.unstubAllEnvs();});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'club',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'club',slug:'vietnam'});
 await saveBrief(t.db,f.organizer,{...root,body:'Wine club.',timezone:'America/New_York',expectedVersion:0});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
const inDays=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,19)+'Z';
const whatsappOn=()=>{for(const key of ['WHATSAPP_NUMBER','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET'])vi.stubEnv(key,'set');};
/** A queued message for a member about an ask, as the outbox would hold it. Returns its stop token. */
async function queued(f:F,who:Principal,team:{orgId:string;loopId:string},question:string):Promise<string> {
 const asked=await createAsk(t.db,f.organizer,{...team,question,kind:'one',options:['Yes','No'],closesAt:inDays(3)});
 if(!asked.saved)throw new Error('not asked');
 const {rows:[row]}=await t.db.query<{token:string}>(`insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id) select k.org_id,k.loop_id,$1,'ask_new',k.id from emba_ask k where k.org_id=$2 and k.loop_id=$3 and k.question=$4 returning stop_token as token`,[who.personId,team.orgId,team.loopId,question]);
 return row.token;
}
const states=async(who:Principal)=>(await t.db.query<{loop_id:string;state:string}>('select loop_id,state from emba_reach_message where person_id=$1 order by created_at',[who.personId])).rows.map(row=>row.state);

it('lets a member choose how each team reaches them, with email as the default',async()=>{
 const f=await fixture();
 expect(await reachChoice(t.db,f.memberA,f.root)).toEqual({way:'email',isDefault:true,whatsapp:'off'});
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'none'})).toEqual({saved:true,way:'none'});
 expect(await setReachChoice(t.db,f.memberA,{...f.vietnam,way:'assistant'})).toEqual({saved:true,way:'assistant'});
 expect(await reachChoice(t.db,f.memberA,f.root)).toEqual({way:'none',isDefault:false,whatsapp:'off'});
 // The choice can be changed at any time, and choosing email again is a saved choice, not the default.
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'email'})).toEqual({saved:true,way:'email'});
 expect(await reachChoice(t.db,f.memberA,f.root)).toMatchObject({way:'email',isDefault:false});
 const listed=await listReachChoices(t.db,f.memberA);
 expect(listed.teams.map(team=>[team.handle,team.way,team.isDefault])).toEqual([['@club/vietnam','assistant',false],['@club','email',false]]);
 // One member's choice is theirs alone.
 expect(await reachChoice(t.db,f.memberB,f.root)).toMatchObject({way:'email',isDefault:true});
 expect((await t.db.query('select count(*)::int as n from emba_reach_choice')).rows).toEqual([{n:2}]);
 // A follower belongs to the team and may choose.
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.members[3].personId]);
 expect(await setReachChoice(t.db,f.members[3],{...f.root,way:'assistant'})).toEqual({saved:true,way:'assistant'});
 // Not a way, somebody else's choice, a non-member and an assistant are all refused.
 await expect(setReachChoice(t.db,f.memberA,{...f.root,way:'sms'})).rejects.toThrow();
 await expect(setReachChoice(t.db,f.memberA,{...f.root,way:'none',personId:f.memberB.personId})).rejects.toThrow();
 await expect(setReachChoice(t.db,f.nonmember,{...f.root,way:'none'})).rejects.toThrow('forbidden');
 await expect(reachChoice(t.db,f.nonmember,f.root)).rejects.toThrow('forbidden');
 await grantLease(t.db,f.memberA,{...f.root,clientId:'claude',actions:['plan:read','group-memory:write'],expiresAt:forever});
 const agent=(await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId:'claude',scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
 await expect(setReachChoice(t.db,agent,{...f.root,way:'none'})).rejects.toThrow('forbidden');
 await expect(reachChoice(t.db,agent,f.root)).rejects.toThrow('forbidden');
 await expect(listReachChoices(t.db,agent)).rejects.toThrow('forbidden');
 // Someone whose request to join is waiting can choose before they are in: the join page offers it.
 await t.db.query("insert into emba_group_membership_request(org_id,loop_id,person_id,state) values($1,$2,$3,'pending')",[f.orgId,f.rootId,f.nonmember.personId]);
 expect(await setReachChoice(t.db,f.nonmember,{...f.root,way:'assistant'})).toEqual({saved:true,way:'assistant'});
},120000);

it('offers WhatsApp only once the operator has set it up and the member has linked their own number',async()=>{
 const f=await fixture();
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'whatsapp'})).toEqual({saved:false,reason:'whatsapp_off'});
 whatsappOn();
 expect(await reachChoice(t.db,f.memberA,f.root)).toMatchObject({whatsapp:'not_linked'});
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'whatsapp'})).toEqual({saved:false,reason:'whatsapp_not_linked'});
 await t.db.query("insert into emba_whatsapp_number(person_id,phone) values($1,'+16075550101')",[f.memberA.personId]);
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'whatsapp'})).toEqual({saved:true,way:'whatsapp'});
 expect(await reachChoice(t.db,f.memberA,f.root)).toEqual({way:'whatsapp',isDefault:false,whatsapp:'linked'});
 // A number belongs to at most one member, and a number that sent "stop" is not linked.
 await expect(t.db.query("insert into emba_whatsapp_number(person_id,phone) values($1,'+16075550101')",[f.memberB.personId])).rejects.toThrow();
 await t.db.query('update emba_whatsapp_number set stopped_at=clock_timestamp()');
 expect(await setReachChoice(t.db,f.memberA,{...f.vietnam,way:'whatsapp'})).toEqual({saved:false,reason:'whatsapp_not_linked'});
 expect((await t.db.query('select count(*)::int as n from emba_reach_choice')).rows).toEqual([{n:1}]);
},120000);

it('stops one team from a link with no sign-in, and only when the page is acted on',async()=>{
 const f=await fixture();
 const club=await queued(f,f.memberA,f.root,'Club?'),vietnam=await queued(f,f.memberA,f.vietnam,'Vietnam?');
 await queued(f,f.memberB,f.root,'Club again?');
 // Opening the link writes nothing: mail scanners open links.
 expect(await stopLinkPreview(t.db,club)).toEqual({group:'Synthetic EMBA'});
 expect((await t.db.query('select count(*)::int as n from emba_reach_choice')).rows).toEqual([{n:0}]);
 expect(await states(f.memberA)).toEqual(['queued','queued']);
 // Acting on it stops that team, for that member, and nothing else.
 expect(await stopFromLink(t.db,club)).toEqual({group:'Synthetic EMBA'});
 expect(await reachChoice(t.db,f.memberA,f.root)).toMatchObject({way:'none',isDefault:false});
 expect(await reachChoice(t.db,f.memberA,f.vietnam)).toMatchObject({way:'email',isDefault:true});
 expect(await reachChoice(t.db,f.memberB,f.root)).toMatchObject({way:'email',isDefault:true});
 expect(await states(f.memberA)).toEqual(['skipped','queued']);
 expect(await states(f.memberB)).toEqual(['queued']);
 // Used twice it changes nothing more; the member can turn messages back on from the site.
 expect(await stopFromLink(t.db,club)).toEqual({group:'Synthetic EMBA'});
 expect(await setReachChoice(t.db,f.memberA,{...f.root,way:'email'})).toEqual({saved:true,way:'email'});
 // A token that names nothing does nothing, whatever its shape.
 for(const bad of ['','0'.repeat(32),"' or 1=1 --",vietnam.toUpperCase()]){expect(await stopLinkPreview(t.db,bad)).toBeNull();expect(await stopFromLink(t.db,bad)).toBeNull();}
 expect(await reachChoice(t.db,f.memberA,f.vietnam)).toMatchObject({way:'email',isDefault:true});
},120000);

it('removes choices and unsent messages when a member leaves or deletes their account, and lists choices in their export',async()=>{
 const f=await fixture();
 await addEvent(t.db,f.organizer,{...f.root,slug:'mixer',name:'Mixer',startsAt:inDays(4)});
 for(const who of [f.memberA,f.memberB]){
  await setReachChoice(t.db,who,{...f.root,way:'email'});await setReachChoice(t.db,who,{...f.vietnam,way:'none'});
  await setInterest(t.db,who,{...f.root,event:'mixer',interested:false,decline:true});
 }
 await queued(f,f.memberA,f.root,'Leaving?');await queued(f,f.memberB,f.root,'Deleting?');await queued(f,f.members[2],f.root,'Staying?');
 const recent=(await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.parse(forever),authenticatedAt:Date.now()-1000})))!;
 const exported=await exportPersonalData(t.db,recent);
 expect(exported.reachChoices).toMatchObject([{loop_id:f.rootId,way:'email'},{loop_id:f.vietnam.loopId,way:'none'}]);
 expect(exported.messages).toMatchObject([{kind:'ask_new',state:'queued',way:null}]);
 expect(JSON.stringify(exported.messages)).not.toMatch(/token/);
 // Leaving: the choice is deleted, and a message already queued is never sent.
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberA.personId});
 expect((await t.db.query('select 1 from emba_reach_choice where person_id=$1',[f.memberA.personId])).rows).toEqual([]);
 expect((await t.db.query('select 1 from emba_event_decline where person_id=$1',[f.memberA.personId])).rows).toEqual([]);
 expect(await states(f.memberA)).toEqual(['skipped']);
 // Deleting the account removes every trace: choices, messages, a linked number, and the request log.
 await t.db.query("insert into emba_whatsapp_number(person_id,phone) values($1,'+16075550102')",[f.memberB.personId]);
 await t.db.query("insert into emba_connector_session(person_id,client_id) values($1,'claude')",[f.memberB.personId]);
 await t.db.query("insert into emba_connector_call(person_id,client_id,tool,via) values($1,'claude','waiting','model')",[f.memberB.personId]);
 await t.db.query('insert into emba_connect_view(person_id) values($1)',[f.memberB.personId]);
 await applyDeletionTombstones(t.db,[f.memberB.personId]);
 for(const table of ['emba_reach_choice','emba_reach_message','emba_event_decline','emba_waiting_shown','emba_whatsapp_number','emba_whatsapp_optin','emba_connector_session','emba_connector_call','emba_connect_view'])
  expect((await t.db.query(`select 1 from ${table} where person_id=$1`,[f.memberB.personId])).rows,table).toEqual([]);
 // Nobody else's were touched.
 expect(await states(f.members[2])).toEqual(['queued']);
},120000);

it('keeps every new table closed to the public API roles',async()=>{
 const tables=['emba_event_decline','emba_waiting_shown','emba_reach_choice','emba_whatsapp_number','emba_whatsapp_optin','emba_reach_message','emba_connector_session','emba_connector_call','emba_connect_view'];
 expect((await t.db.query('select tablename from pg_tables where schemaname=$1 and tablename=any($2::text[]) and rowsecurity order by tablename',['public',tables])).rows.map(row=>(row as {tablename:string}).tablename)).toEqual([...tables].sort());
 expect((await t.db.query("select table_name from information_schema.role_table_grants where table_name=any($1::text[]) and grantee in ('anon','authenticated','PUBLIC')",[tables])).rows).toEqual([]);
});

it('keeps a choice made with a waiting request to join, and saves none from a stop link used after leaving',async()=>{
 const f=await fixture();
 await t.db.query("insert into emba_group_membership_request(org_id,loop_id,person_id,state) values($1,$2,$3,'pending')",[f.orgId,f.rootId,f.nonmember.personId]);
 expect(await setReachChoice(t.db,f.nonmember,{...f.root,way:'none'})).toEqual({saved:true,way:'none'});
 // Any change to the person's roles in the organization runs the departure clean-up: the waiting choice survives it.
 await t.db.tx(q=>releaseOnDeparture(q,f.nonmember.personId,{orgId:f.orgId,actorId:null}));
 expect((await t.db.query('select way from emba_reach_choice where person_id=$1',[f.nonmember.personId])).rows).toEqual([{way:'none'}]);
 // A member leaves, then an old message's stop link is used: nothing is saved to meet them if they join again.
 const token=await queued(f,f.memberA,f.root,'Club?');
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberA.personId});
 expect(await stopFromLink(t.db,token)).toEqual({group:'Synthetic EMBA'});
 expect((await t.db.query('select 1 from emba_reach_choice where person_id=$1',[f.memberA.personId])).rows).toEqual([]);
},120000);
