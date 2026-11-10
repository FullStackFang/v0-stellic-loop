// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {registerGroupAddress} from '@/lib/emba/groups';
import {publishGroupNote,readGroupMemory,searchGroupMemory,withdrawGroupNote} from '@/lib/emba/group-memory';
import {createTeamEvent} from '@/lib/emba/team-events';

// Each rejection names the rule that must cause it, so an assertion cannot
// pass because some other constraint happened to fire first.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();});
type Scope={orgId:string;loopId:string};
type Row=Record<string,unknown>;
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'cohort',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'vietnam'});
 // Counters as a service would have left them after issuing numbers 1 to 100.
 for(const scope of [root,f.vietnam])await t.db.query('insert into emba_team_state(org_id,loop_id,record_seq,change_seq) values($1,$2,100,100)',[scope.orgId,scope.loopId]);
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
const columns=(row:Row)=>({names:Object.keys(row).join(','),marks:Object.keys(row).map((_,i)=>`$${i+1}`).join(','),values:Object.values(row)});
/** Inserts a record and its first version in one transaction, as the service will. */
async function add(scope:Scope,record:Row,version:Row={body:'Text'}):Promise<string> {
 const id=randomUUID();
 await t.db.tx(async q=>{
  const r=columns({id,org_id:scope.orgId,loop_id:scope.loopId,current_version:1,...record});
  await q.query(`insert into emba_team_record(${r.names}) values(${r.marks})`,r.values);
  const v=columns({record_id:id,version:1,...version});
  await q.query(`insert into emba_team_record_version(${v.names}) values(${v.marks})`,v.values);
 });
 return id;
}
const link={title:'Deck',body:'Draft of the final deck',url:'https://docs.google.com/presentation/d/abc123/edit?usp=sharing#slide=1'};
const output=(number:number,extra:Row={})=>({kind:'output',number,...extra});
const decision=(number:number,topic:string,extra:Row={})=>({kind:'decision',number,topic,...extra});
const claim=(f:F,number:number,extra:Row={})=>({kind:'claim',number,claim_status:'open',owner_id:f.memberA.personId,...extra});
const char=(code:number)=>String.fromCodePoint(code);

it('stores each kind with a number that is unique within its team and issued by its counter',async()=>{
 const f=await fixture();
 await add(f.root,output(1),link);
 await add(f.root,decision(2,'deck-length'));
 await add(f.root,claim(f,3,{due_on:'2099-03-01'}));
 await add(f.root,{kind:'announcement',number:4});
 await expect(add(f.root,output(1),link)).rejects.toThrow(/emba_team_record_org_id_loop_id_number_key/);
 await add(f.vietnam,output(1),link);
 await expect(add(f.root,output(0),link)).rejects.toThrow(/emba_team_record_number_check/);
 await expect(add(f.root,{kind:'note',number:9})).rejects.toThrow(/emba_team_record_kind_check/);
 await expect(add(f.root,output(101),link)).rejects.toThrow(/Record numbers come from the team counter/);
 // A team without a state row, and therefore without a lock to take, holds no records.
 await expect(add(f.estonia,output(1),link)).rejects.toThrow(/emba_team_record_org_id_loop_id_fkey/);
 // Counters only move forward.
 await expect(t.db.query('update emba_team_state set record_seq=5 where org_id=$1 and loop_id=$2',[f.orgId,f.rootId])).rejects.toThrow(/Team counters only move forward/);
 await expect(t.db.query('update emba_team_state set change_seq=change_seq-1')).rejects.toThrow(/Team counters only move forward/);
 await t.db.query('update emba_team_state set record_seq=record_seq+1,decision_seq=decision_seq+1,change_seq=change_seq+1');
});
it('rejects fields that do not belong to the kind',async()=>{
 const f=await fixture();
 const event=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 const cases:[Row,RegExp][]=[
  [{kind:'decision',number:1},/emba_team_decision_has_topic/],
  [decision(1,'Deck Length'),/emba_team_record_topic_check/],
  [output(1,{topic:'deck-length'}),/emba_team_decision_has_topic/],
  [{kind:'claim',number:1,owner_id:f.memberA.personId},/emba_team_claim_has_status/],
  [output(1,{claim_status:'open'}),/emba_team_claim_has_status/],
  [claim(f,1,{claim_status:'maybe'}),/emba_team_record_claim_status_check/],
  [output(1,{owner_id:f.memberA.personId}),/emba_team_owner_only_on_claims/],
  [output(1,{due_on:'2099-03-01'}),/emba_team_owner_only_on_claims/],
  [claim(f,1,{owner_id:null}),/emba_team_live_claim_has_owner/],
  [claim(f,1,{owner_id:null,claim_status:'proposed'}),/emba_team_live_claim_has_owner/],
  [decision(1,'deck-length',{event_id:event.id}),/emba_team_event_only_on_work/],
  [{kind:'announcement',number:1,event_id:event.id},/emba_team_event_only_on_work/],
  [decision(1,'deck-length',{state:'superseded'}),/emba_team_superseded_needs_link/],
  [output(1,{state:'replaced'}),/emba_team_replaced_needs_link/],
  [output(1,{state:'gone'}),/emba_team_record_state_check/],
  [output(1,{client_id:`claude${char(0x202e)}`}),/emba_team_record_client_id_check/],
  [output(1,{client_id:'x'.repeat(201)}),/emba_team_record_client_id_check/],
 ];
 for(const [bad,rule] of cases)await expect(add(f.root,bad,bad.kind==='output'?link:undefined)).rejects.toThrow(rule);
 await add(f.root,output(1,{event_id:event.id,client_id:'Claude Desktop'}),link);
 await add(f.root,claim(f,2,{event_id:event.id}));
 await add(f.root,claim(f,3,{owner_id:null,claim_status:'released'}));
 // Version fields must fit the kind: an output has a title and a link; nothing else does; statements and claims are shorter.
 const shape=/Version fields do not fit the record kind/;
 await expect(add(f.root,output(4),{body:'No link'})).rejects.toThrow(shape);
 await expect(add(f.root,output(4),{body:'No title',url:link.url})).rejects.toThrow(shape);
 await expect(add(f.root,decision(4,'venue'),link)).rejects.toThrow(shape);
 await expect(add(f.root,claim(f,4),{body:'Slides',title:'T'})).rejects.toThrow(shape);
 await expect(add(f.root,{kind:'announcement',number:4},{body:'News',url:link.url})).rejects.toThrow(shape);
 await expect(add(f.root,decision(4,'venue'),{body:'x'.repeat(401)})).rejects.toThrow(shape);
 await expect(add(f.root,claim(f,4),{body:'x'.repeat(201)})).rejects.toThrow(shape);
 await add(f.root,decision(4,'venue'),{body:'x'.repeat(400)});
 await add(f.root,claim(f,5),{body:'x'.repeat(200)});
 await add(f.root,{kind:'announcement',number:6},{body:'x'.repeat(600)});
});
it('never lets a decision or a stored version be edited, or a record change identity',async()=>{
 const f=await fixture();
 const id=await add(f.root,decision(1,'deck-length'),{body:'Ten slides'});
 const out=await add(f.root,output(2),link);
 // A decision has exactly one version: it is superseded or withdrawn, never corrected.
 await expect(t.db.tx(async q=>{
  await q.query('insert into emba_team_record_version(record_id,version,body) values($1,2,$2)',[id,'Changed']);
  await q.query('update emba_team_record set current_version=2 where id=$1',[id]);
 })).rejects.toThrow(/emba_team_decision_single_version/);
 await expect(t.db.query('insert into emba_team_record_version(record_id,version,body) values($1,2,$2)',[id,'Orphan'])).rejects.toThrow(/Record versions are contiguous/);
 const edited=/A stored version is not edited/;
 await expect(t.db.query("update emba_team_record_version set body='Twelve slides' where record_id=$1",[id])).rejects.toThrow(edited);
 await expect(t.db.query("update emba_team_record_version set url='https://evil.example/x' where record_id=$1",[out])).rejects.toThrow(edited);
 await expect(t.db.query("update emba_team_record_version set title='Other' where record_id=$1",[out])).rejects.toThrow(edited);
 await expect(t.db.query('update emba_team_record_version set version=3 where record_id=$1',[out])).rejects.toThrow(edited);
 await expect(t.db.query('update emba_team_record_version set edited_by=$2 where record_id=$1',[out,f.memberB.personId])).rejects.toThrow(edited);
 const identity=/A team record keeps its identity/;
 for(const change of ["topic='other-topic'","number=50","kind='output'","loop_id='"+f.vietnam.loopId+"'","created_at=now()","client_id='other'"])
  await expect(t.db.query(`update emba_team_record set ${change} where id=$1`,[id])).rejects.toThrow(identity);
 await expect(t.db.query('update emba_team_record set author_id=$2 where id=$1',[id,f.memberB.personId])).rejects.toThrow(identity);
 // A correction adds a version; the current version never moves back.
 await t.db.tx(async q=>{
  await q.query('insert into emba_team_record_version(record_id,version,title,body,url) values($1,2,$2,$3,$4)',[out,'Deck v2','Second draft',link.url]);
  await q.query('update emba_team_record set current_version=2 where id=$1',[out]);
 });
 await expect(t.db.query('update emba_team_record set current_version=1 where id=$1',[out])).rejects.toThrow(identity);
 await expect(t.db.query('update emba_team_record set current_version=3 where id=$1',[out])).rejects.toThrow(/emba_team_record_id_current_version_fkey|Record versions are contiguous/);
 expect((await t.db.query<{body:string}>('select body from emba_team_record_version where record_id=$1 order by version',[out])).rows.map(row=>row.body)).toEqual([link.body,'Second draft']);
});
it('removes text and link from every version on withdrawal, and only then',async()=>{
 const f=await fixture();
 const out=await add(f.root,output(1),link);
 await t.db.tx(async q=>{
  await q.query('insert into emba_team_record_version(record_id,version,title,body,url) values($1,2,$2,$3,$4)',[out,'Deck v2','Second draft','https://docs.google.com/secret-link']);
  await q.query('update emba_team_record set current_version=2 where id=$1',[out]);
 });
 const rule=/A withdrawn record holds no text/;
 // Marking the record withdrawn while any version keeps its text is refused.
 await expect(t.db.query("update emba_team_record set state='withdrawn' where id=$1",[out])).rejects.toThrow(rule);
 await expect(t.db.tx(async q=>{
  await q.query('update emba_team_record_version set withdrawn=true,title=null,body=null,url=null where record_id=$1 and version=2',[out]);
  await q.query("update emba_team_record set state='withdrawn' where id=$1",[out]);
 })).rejects.toThrow(rule);
 // Emptying a version of a record that is not withdrawn is refused too.
 await expect(t.db.query('update emba_team_record_version set withdrawn=true,title=null,body=null,url=null where record_id=$1',[out])).rejects.toThrow(rule);
 await expect(t.db.query('update emba_team_record_version set withdrawn=true where record_id=$1 and version=1',[out])).rejects.toThrow(/emba_team_withdrawn_is_empty/);
 await expect(add(f.root,output(2),{title:'Deck',url:link.url})).rejects.toThrow(/emba_team_version_has_body/);
 await t.db.tx(async q=>{
  await q.query('update emba_team_record_version set withdrawn=true,title=null,body=null,url=null where record_id=$1',[out]);
  await q.query("update emba_team_record set state='withdrawn' where id=$1",[out]);
 });
 expect((await t.db.query('select title,body,url from emba_team_record_version where record_id=$1',[out])).rows).toEqual([{title:null,body:null,url:null},{title:null,body:null,url:null}]);
 // Withdrawn text does not come back.
 await expect(t.db.query("update emba_team_record_version set withdrawn=false,body='Back' where record_id=$1 and version=1",[out])).rejects.toThrow(/A stored version is not edited/);
});
it('allows one current decision per topic, superseded in the natural order, with same-team same-kind links only',async()=>{
 const f=await fixture();
 const first=await add(f.root,decision(1,'deck-length'));
 await expect(add(f.root,decision(2,'deck-length'))).rejects.toThrow(/emba_team_record_topic/);
 // Supersede: mark the old decision, then insert the new one as current. No false intermediate state.
 const second=randomUUID();
 await t.db.tx(async q=>{
  await q.query("update emba_team_record set state='superseded',superseded_by=$2 where id=$1",[first,second]);
  await q.query("insert into emba_team_record(id,org_id,loop_id,number,kind,topic,current_version) values($1,$2,$3,2,'decision','deck-length',1)",[second,f.orgId,f.rootId]);
  await q.query("insert into emba_team_record_version(record_id,version,body) values($1,1,'Twelve slides')",[second]);
 });
 expect((await t.db.query<{state:string}>('select state from emba_team_record where id=any($1) order by number',[[first,second]])).rows.map(row=>row.state)).toEqual(['superseded','current']);
 // The link must point at a real, later decision on the same topic in the same team.
 const venue=await add(f.root,decision(3,'venue')),out=await add(f.root,output(4),link),elsewhere=await add(f.vietnam,decision(1,'deck-length'));
 const supersede=(id:string,by:string)=>t.db.query("update emba_team_record set state='superseded',superseded_by=$2 where id=$1",[id,by]);
 await expect(supersede(second,randomUUID())).rejects.toThrow(/emba_team_record_superseded_by_org_id_loop_id_kind_fkey/);
 await expect(supersede(second,out)).rejects.toThrow(/emba_team_record_superseded_by_org_id_loop_id_kind_fkey/);
 await expect(supersede(second,elsewhere)).rejects.toThrow(/emba_team_record_superseded_by_org_id_loop_id_kind_fkey/);
 await expect(supersede(second,second)).rejects.toThrow(/emba_team_not_self_linked/);
 await expect(supersede(second,venue)).rejects.toThrow(/superseded by a later decision on its topic/);
 // second already supersedes one decision; a record supersedes at most one.
 await expect(supersede(venue,second)).rejects.toThrow(/emba_team_record_superseded_by/);
 await expect(t.db.query('update emba_team_record set superseded_by=$2 where id=$1',[venue,second])).rejects.toThrow(/emba_team_superseded_link_state/);
 await expect(t.db.query('update emba_team_record set superseded_by=$2 where id=$1',[out,second])).rejects.toThrow(/emba_team_supersede_only_decisions/);
 await expect(t.db.query('update emba_team_record set replaced_by=$2 where id=$1',[second,out])).rejects.toThrow(/emba_team_replace_only_outputs/);
 // A superseded decision cannot be made current again while linked to its successor.
 await expect(t.db.query("update emba_team_record set state='current' where id=$1",[first])).rejects.toThrow(/emba_team_superseded_link_state/);
 // Replace: insert the new output, then mark the old one. One successor each.
 const next=await add(f.root,output(5),link),other=await add(f.root,output(6),link);
 const replace=(id:string,by:string)=>t.db.query("update emba_team_record set state='replaced',replaced_by=$2 where id=$1",[id,by]);
 await expect(replace(next,out)).rejects.toThrow(/replaced by a later output/);
 await expect(replace(out,second)).rejects.toThrow(/emba_team_record_replaced_by_org_id_loop_id_kind_fkey/);
 await replace(out,next);
 await expect(replace(other,next)).rejects.toThrow(/emba_team_replace_only_outputs|replaced by a later output|emba_team_record_replaced_by/);
 const event=await createTeamEvent(t.db,f.organizer,{...f.vietnam,slug:'hanoi-day',name:'Hanoi day'});
 await expect(add(f.root,output(7,{event_id:event.id}),link)).rejects.toThrow(/emba_team_record_event_id_org_id_loop_id_fkey/);
 // An event that holds records cannot be deleted from under them.
 const own=await createTeamEvent(t.db,f.organizer,{...f.root,slug:'final-deck',name:'Final deck'});
 await add(f.root,output(7,{event_id:own.id}),link);
 await expect(t.db.query('delete from emba_team_event where id=$1',[own.id])).rejects.toThrow(/emba_team_record_event_id_org_id_loop_id_fkey/);
});
it('ties flags, overlaps, tags, changes and receipts to records of the right team and kind',async()=>{
 const f=await fixture();
 const out=await add(f.root,output(1),link),ruling=await add(f.root,decision(2,'deck-length')),work=await add(f.root,claim(f,3)),work2=await add(f.root,claim(f,4));
 const elsewhere=await add(f.vietnam,decision(1,'venue')),far=await add(f.vietnam,output(2),link);
 const flag=(outputId:string,decisionId:string,scope:Scope=f.root)=>t.db.query('insert into emba_team_conflict(org_id,loop_id,output_id,decision_id) values($1,$2,$3,$4)',[scope.orgId,scope.loopId,outputId,decisionId]);
 await flag(out,ruling);
 await expect(flag(out,ruling)).rejects.toThrow(/emba_team_conflict_pkey/);
 await expect(flag(ruling,out)).rejects.toThrow(/emba_team_conflict_output_id_org_id_loop_id_output_kind_fkey/);
 await expect(flag(out,elsewhere)).rejects.toThrow(/emba_team_conflict_decision_id_org_id_loop_id_decision_kin_fkey/);
 await expect(flag(out,work)).rejects.toThrow(/emba_team_conflict_decision_id_org_id_loop_id_decision_kin_fkey/);
 await expect(flag(far,elsewhere,f.root)).rejects.toThrow(/emba_team_conflict_output_id_org_id_loop_id_output_kind_fkey/);
 await expect(t.db.query("insert into emba_team_conflict(org_id,loop_id,output_id,decision_id,output_kind) values($1,$2,$3,$4,'decision')",[f.orgId,f.rootId,ruling,ruling])).rejects.toThrow(/emba_team_conflict_output_kind_check/);
 await expect(t.db.query("update emba_team_conflict set state='cleared'")).rejects.toThrow(/emba_team_conflict_state_check/);
 await t.db.query("update emba_team_conflict set state='recheck'");
 const overlap=(a:string,b:string)=>t.db.query('insert into emba_team_overlap(org_id,loop_id,claim_a,claim_b) values($1,$2,$3,$4)',[f.orgId,f.rootId,a,b]);
 const [low,high]=[work,work2].sort();
 await overlap(low,high);
 await expect(overlap(high,low)).rejects.toThrow(/emba_team_overlap_ordered/);
 await expect(overlap(low,low)).rejects.toThrow(/emba_team_overlap_ordered/);
 const [a,b]=[work,out].sort();
 await expect(overlap(a,b)).rejects.toThrow(/emba_team_overlap_claim_[ab]_org_id_loop_id_kind_fkey/);
 // Changes: numbered by the team counter, unique, never edited, and only about this team's records.
 const change=(seq:number,action='filed',scope:Scope=f.root,recordId=out,otherId:string|null=null)=>t.db.query('insert into emba_team_change(org_id,loop_id,seq,record_id,action,actor_id,other_id) values($1,$2,$3,$4,$5,$6,$7)',[scope.orgId,scope.loopId,seq,recordId,action,f.memberA.personId,otherId]);
 await change(1);
 await expect(change(1)).rejects.toThrow(/emba_team_change_pkey/);
 await expect(change(0)).rejects.toThrow(/emba_team_change_seq_check/);
 await expect(change(2,'read')).rejects.toThrow(/emba_team_change_action_check/);
 await expect(change(101)).rejects.toThrow(/Change numbers come from the team counter/);
 await expect(change(2,'filed',f.vietnam)).rejects.toThrow(/emba_team_change_record_id_org_id_loop_id_fkey/);
 await expect(change(2,'flagged',f.root,out,elsewhere)).rejects.toThrow(/emba_team_change_other_id_org_id_loop_id_fkey/);
 await change(2,'flagged',f.root,out,ruling);
 await expect(t.db.query("update emba_team_change set action='withdrawn' where seq=1")).rejects.toThrow(/The change log is not edited/);
 await expect(t.db.query('update emba_team_change set actor_id=$1 where seq=1',[f.memberB.personId])).rejects.toThrow(/The change log is not edited/);
 // Receipts: one per person and operation id, for a real change of the same team.
 const receipt=(operationId:string|null,options:{hash?:string;person?:string;scope?:Scope;seq?:number}={})=>t.db.query('insert into emba_team_operation(org_id,loop_id,person_id,client_id,operation_id,request_hash,record_id,change_seq) values($1,$2,$3,$4,$5,$6,$7,$8)',
  [(options.scope??f.root).orgId,(options.scope??f.root).loopId,options.person??f.memberA.personId,'claude',operationId,options.hash??'a'.repeat(64),out,options.seq??1]);
 const operationId=randomUUID();
 await receipt(operationId);
 await expect(receipt(operationId)).rejects.toThrow(/emba_team_operation_id/);
 await receipt(operationId,{person:f.memberB.personId});
 await receipt(null);await receipt(null);
 await expect(receipt(randomUUID(),{hash:'not-a-digest'})).rejects.toThrow(/emba_team_operation_request_hash_check/);
 await expect(receipt(randomUUID(),{seq:77})).rejects.toThrow(/emba_team_operation_org_id_loop_id_change_seq_fkey/);
 await expect(receipt(randomUUID(),{scope:f.vietnam})).rejects.toThrow(/emba_team_operation_(record_id_org_id_loop_id|org_id_loop_id_change_seq)_fkey/);
 const report=(decisions:number,hash='b'.repeat(64))=>t.db.query('insert into emba_team_conflict_report(org_id,loop_id,person_id,client_id,request_hash,decisions) values($1,$2,$3,$4,$5,$6)',[f.orgId,f.rootId,f.memberA.personId,'claude',hash,decisions]);
 await expect(report(0)).rejects.toThrow(/emba_team_conflict_report_decisions_check/);
 await expect(report(1,'text')).rejects.toThrow(/emba_team_conflict_report_request_hash_check/);
 await report(2);
 // Tags: one per person per record, at most five.
 const tag=(personId:string)=>t.db.query('insert into emba_team_record_tag(record_id,person_id) values($1,$2)',[out,personId]);
 for(const person of f.members.slice(0,5))await tag(person.personId);
 await expect(tag(f.members[0].personId)).rejects.toThrow(/emba_team_record_tag_pkey|at most five tags/);
 await expect(tag(f.members[5].personId)).rejects.toThrow(/at most five tags/);
 await expect(t.db.query("update emba_team_state set timezone='Not a zone; drop' where org_id=$1",[f.orgId])).rejects.toThrow(/emba_team_state_timezone_check/);
 await t.db.query("update emba_team_state set timezone='America/New_York' where org_id=$1 and loop_id=$2",[f.orgId,f.rootId]);
});
it('keeps text to one visible line and links to plain https pointers',async()=>{
 const f=await fixture();let n=0;
 const body=/emba_team_record_version_body_check/,title=/emba_team_record_version_title_check/,url=/emba_team_record_version_url_check/;
 for(const text of ['two\nlines','tab\there','cr\rhere',`bidi${char(0x202e)}text`,`sep${char(0x2028)}text`,`zero${char(0x200b)}width`,`mark${char(0x61c)}text`,
  `tag${char(0xe0041)}text`,`soft${char(0xad)}hyphen`,`mvs${char(0x180e)}text`,`nbsp${char(0xa0)}text`,`c1${char(0x85)}text`,`isolate${char(0x2066)}text`,
  char(0x3164),' ',' padded','padded ','x'.repeat(601),''])
  await expect(add(f.root,output(++n),{...link,body:text})).rejects.toThrow(body);
 for(const text of ['x'.repeat(121),'',`a${char(0x202e)}b`,' '])await expect(add(f.root,output(++n),{...link,title:text})).rejects.toThrow(title);
 for(const bad of ['http://docs.google.com/a','https://user@docs.google.com/a','https://user:pw@docs.google.com/a','https://docs.google.com:8443/a','https://DOCS.google.com/a',
  `https://docs.g${char(0x43e)}ogle.com/a`,'https://docs.google.com/a b','https://','https:///path','javascript:alert(1)','https://docs.google.com/'+'a'.repeat(500),
  'https://docs.google.com/a\nhttps://evil.example/','https://localhost/a','https://127.0.0.1/a','https://169.254.169.254/latest/meta-data/','https://2130706433/a','https://0x7f.1/a',
  'https://xn--pple-43d.com/a','https://docs.xn--pple-43d.com/a','https://a..b/c','https://a-.com/c','https://-a.com/c','https://example.com./a',`https://${'a'.repeat(64)}.com/a`,
  'https://example.com/a\\b','https://example.com/"x"','https://example.com/<script>','https://example.com/a|b','https://example.com/{x}','https://example.com/a`b','https://example.com/a^b',
  'https://example.com?x=1','https://example.com#frag','https://[::1]/a'])
  await expect(add(f.root,output(++n),{...link,url:bad})).rejects.toThrow(url);
 for(const good of ['https://docs.google.com','https://docs.google.com/','https://docs.google.com/document/d/1AbC_dEf-123/edit?usp=sharing','https://drive.google.com/file/d/1AbC/view?usp=drive_link',
  'https://my-team.sharepoint.com/:w:/r/sites/x/Doc.docx?d=w1&csf=1&web=1','https://contoso-my.sharepoint.com/:p:/g/personal/a_b_contoso_com/EaBc?e=x1','https://1drv.ms/w/s!AbCdEf','https://onedrive.live.com/?cid=ABC&id=ABC%21123',
  'https://www.dropbox.com/scl/fi/abc/Deck.pptx?rlkey=xyz&dl=0','https://www.notion.so/team/Page-0123456789abcdef','https://www.figma.com/design/AbC/Name?node-id=1-2&t=x','https://www.canva.com/design/DAF/abc/edit',
  'https://github.com/org/repo/blob/main/README.md#L10','https://example.org/a%20b/(draft)/x;y=1,2*3~4'])
  await add(f.root,output(++n),{...link,url:good});
});
it('keeps every team-record table out of the Data API under Supabase default privileges',async()=>{
 await fixture();
 const tables=['emba_team_state','emba_team_record','emba_team_record_version','emba_team_conflict','emba_team_overlap','emba_team_record_tag','emba_team_change','emba_team_operation','emba_team_conflict_report','emba_team_event','emba_team_name','emba_team_brief'].sort();
 const {rows}=await t.db.query<{name:string}>("select tablename as name from pg_tables where schemaname='public' and tablename like 'emba_team_%' order by 1");
 // Every emba_team_ table is covered, including the two from the addressing migration.
 expect(rows.map(row=>row.name)).toEqual(tables);
 expect((await t.db.query("select tablename from pg_tables where schemaname='public' and tablename like 'emba_team_%' and not rowsecurity")).rows).toEqual([]);
 // The shared test database grants nothing to the API roles by default, which would hide a missing
 // revoke. Build one that grants everything by default, as hosted Supabase does, and apply the migrations.
 const pg=new PGlite(),migrations=join(__dirname,'..','..','supabase','migrations');
 try{
  await pg.exec('create role anon; create role authenticated;'
   +' alter default privileges in schema public grant all on tables to anon,authenticated;'
   +' alter default privileges in schema public grant all on sequences to anon,authenticated;'
   +' alter default privileges in schema public grant execute on functions to anon,authenticated;');
  for(const file of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())await pg.exec(readFileSync(join(migrations,file),'utf8'));
  // The defaults really are in force: a table made without a revoke is open to anon.
  await pg.exec('create table zz_probe(id integer)');
  const open=await pg.query<{granted:boolean}>("select has_table_privilege('anon','zz_probe','select') as granted");
  expect(open.rows).toEqual([{granted:true}]);
  const granted=await pg.query<{role:string;name:string;privilege:string}>(`select r.role,c.relname as name,p.privilege from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join (values('anon'),('authenticated'),('public')) r(role) cross join (values('select'),('insert'),('update'),('delete'),('truncate'),('references'),('trigger')) p(privilege)
   where n.nspname='public' and c.relkind='r' and c.relname like 'emba_team_%'
   and case when r.role='public' then exists(select 1 from aclexplode(c.relacl) a where a.grantee=0 and lower(a.privilege_type)=p.privilege) else has_table_privilege(r.role,c.oid,p.privilege) end`);
  expect(granted.rows).toEqual([]);
  const callable=await pg.query<{name:string}>(`select p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'emba_team_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))`);
  expect(callable.rows).toEqual([]);
  const functions=await pg.query<{count:number}>("select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'emba_team_%'");
  expect(functions.rows[0].count).toBe(10);
 }finally{await pg.close();}
},60000);
it('keeps team records invisible and unchangeable through the shared-note tools',async()=>{
 const f=await fixture();
 const id=await add(f.root,decision(1,'deck-length'),{body:'TEAM_RECORD_CANARY twelve slides'});
 const out=await add(f.root,output(2),{...link,body:'TEAM_RECORD_CANARY draft'});
 const note=await publishGroupNote(t.db,f.memberA,{...f.root,operationId:randomUUID(),text:'A shared note about the hotel.'});
 const found=await searchGroupMemory(t.db,f.memberA,f.root);
 expect(found.items.map(item=>item.id)).toEqual([note.recordId]);
 expect(JSON.stringify([found,await searchGroupMemory(t.db,f.memberA,{...f.root,query:'TEAM_RECORD_CANARY'})])).not.toContain('TEAM_RECORD_CANARY');
 for(const recordId of [id,out]){
  await expect(readGroupMemory(t.db,f.memberA,{...f.root,recordId})).rejects.toThrow('not_found');
  await expect(publishGroupNote(t.db,f.organizer,{...f.root,operationId:randomUUID(),recordId,expectedVersion:1,text:'Overwritten'})).rejects.toThrow('not_found');
  await expect(withdrawGroupNote(t.db,f.organizer,{...f.root,operationId:randomUUID(),recordId,expectedVersion:1})).rejects.toThrow('not_found');
 }
 expect((await t.db.query<{body:string}>('select body from emba_team_record_version order by body')).rows.map(row=>row.body)).toEqual(['TEAM_RECORD_CANARY draft','TEAM_RECORD_CANARY twelve slides']);
 // The note store still accepts notes only: the same complete insert succeeds as a note and fails as any other kind.
 const note2=(kind:string)=>t.db.tx(async q=>{
  const noteId=randomUUID();
  await q.query('insert into emba_group_memory(id,org_id,loop_id,kind,current_version) values($1,$2,$3,$4,1)',[noteId,f.orgId,f.rootId,kind]);
  await q.query("insert into emba_group_memory_version(record_id,version,text,status) values($1,1,'Text','active')",[noteId]);
 });
 await note2('note');
 await expect(note2('decision')).rejects.toThrow(/emba_group_memory_kind_check/);
 // Nothing in the team tables refers to the note tables, or the reverse.
 const {rows:links}=await t.db.query(`select conname from pg_constraint where contype='f'
  and ((conrelid::regclass::text like 'emba_team_%' and confrelid::regclass::text like 'emba_group_memory%')
    or (conrelid::regclass::text like 'emba_group_memory%' and confrelid::regclass::text like 'emba_team_%'))`);
 expect(links).toEqual([]);
});
