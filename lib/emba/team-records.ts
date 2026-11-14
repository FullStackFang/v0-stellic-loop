import 'server-only';
import {createHash} from 'node:crypto';
import {z,ZodError} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {hostOf,normaliseLink,recognisedHost,type LinkProblem} from './team-link';
import {lineSchema,nameSchema} from './team-text';

// Team records: outputs, decisions, claims and announcements (design D1 to D8,
// D13 to D16). Every write is one call, takes the team's lock, and either
// saves and returns the stored record or saves nothing and says why.

export const LIMITS={title:120,summary:600,statement:400,claim:200,announcement:600,tags:5,writesPerHour:30,openClaims:100,currentOutputs:300,currentDecisions:200,retryMinutes:10,list:30} as const;
type Scope={orgId:string;loopId:string};
const scope={orgId:z.uuid(),loopId:z.uuid()};
const ref=z.number().int().positive();
const refs=z.array(ref).max(20).default([]).transform(list=>[...new Set(list)]);
const tags=z.array(nameSchema).max(LIMITS.tags).default([]).transform(list=>[...new Set(list)]);
const operationId=z.uuid().optional();
const day=z.string().regex(/^2[01]\d{2}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().startsWith(value);});

export type PersonView={handle:string|null;isYou:boolean;former:boolean};
export type RecordView={
 number:number;kind:'output'|'decision'|'claim'|'announcement';state:'current'|'replaced'|'superseded'|'withdrawn';version:number;
 event:string|null;by:PersonView;assistant:string|null;createdAt:string;tags:PersonView[];
 title?:string;summary?:string;url?:string;host?:string;recognisedHost?:boolean;replacedBy?:number;
 conflicts?:{decision:number;topic:string|null;state:'flagged'|'recheck'}[];
 topic?:string;statement?:string;supersededBy?:number;
 what?:string;owner?:PersonView;dueOn?:string|null;claimStatus?:'proposed'|'open'|'done'|'released'|'declined';overlaps?:number[];
 text?:string;
};
export type DecisionSummary={number:number;topic:string;statement:string};
export type Declined=
 |{saved:false;reason:'busy'}
 |{saved:false;reason:'cap';cap:'writes_per_hour'|'open_claims'|'current_outputs'|'current_decisions'}
 |{saved:false;reason:'decisions_needed';decisionsVersion:number;decisions:DecisionSummary[]}
 |{saved:false;reason:'conflict_reported';decisionsVersion:number;decisions:DecisionSummary[]}
 |{saved:false;reason:'unknown_reference';kind:'decision'|'output'|'claim'|'event'|'person'|'record';value:string}
 |{saved:false;reason:'link_refused';problem:LinkProblem}
 |{saved:false;reason:'new_topic_unconfirmed';topics:DecisionSummary[]}
 |{saved:false;reason:'topic_exists';current:DecisionSummary}
 |{saved:false;reason:'stale';current:RecordView|null};
export type Saved={saved:true;replayed:boolean;record:RecordView;decisionsVersion:number;also:RecordView[]};
export type WriteResult=Saved|Declined;

type State={recordSeq:number;decisionSeq:number;changeSeq:number;timezone:string};
type Ctx={q:Q;p:Principal;scope:Scope;state:State;manager:boolean};
export type Row={id:string;number:number;kind:RecordView['kind'];state:RecordView['state'];version:number;eventId:string|null;authorId:string|null;clientId:string|null;
 topic:string|null;ownerId:string|null;dueOn:string|null;claimStatus:RecordView['claimStatus']|null;createdAt:string;title:string|null;body:string|null;url:string|null};
export const rowColumns=`r.id,r.number,r.kind,r.state,r.current_version as version,r.event_id as "eventId",r.author_id as "authorId",r.client_id as "clientId",r.topic,
 r.owner_id as "ownerId",to_char(r.due_on,'YYYY-MM-DD') as "dueOn",r.claim_status as "claimStatus",r.created_at as "createdAt",v.title,v.body,v.url`;
export const rowFrom='emba_team_record r join emba_team_record_version v on v.record_id=r.id and v.version=r.current_version';
const declined=<T extends Declined>(value:T):T=>value;
class Decline extends Error {constructor(readonly result:Declined){super('declined');}}
const stop=(result:Declined):never=>{throw new Decline(result);};
const forbidden=():never=>{throw new EmbaError('forbidden');};

async function locked(q:Q,team:Scope,number:number,kind?:Row['kind']):Promise<Row|undefined> {
 const {rows:[row]}=await q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.org_id=$1 and r.loop_id=$2 and r.number=$3 and ($4::text is null or r.kind=$4) for update of r`,[team.orgId,team.loopId,number,kind??null]);
 return row;
}
async function currentDecisions(q:Q,team:Scope):Promise<(DecisionSummary&{id:string})[]> {
 const {rows}=await q.query<DecisionSummary&{id:string}>(`select r.id,r.number,r.topic,v.body as statement from ${rowFrom} where r.org_id=$1 and r.loop_id=$2 and r.kind='decision' and r.state='current' order by r.number limit $3`,[team.orgId,team.loopId,LIMITS.currentDecisions]);
 return rows;
}
const summary=({number,topic,statement}:DecisionSummary):DecisionSummary=>({number,topic,statement});

/** Builds the assistant-safe view of records: numbers and handles, never an internal id. */
export async function viewRecords(q:Q,p:Principal,team:Scope,rows:Row[]):Promise<RecordView[]> {
 if(!rows.length)return [];
 // Everything a record's view needs beyond its own row, in one statement: a list of thirty costs what a list of one does.
 // An overlap mark is live while both claims are still open or proposed.
 const {rows:extras}=await q.query<{id:string;tags:string[];conflicts:NonNullable<RecordView['conflicts']>;supersededBy:number|null;replacedBy:number|null;overlaps:number[];event:string|null}>(`select r.id,
   coalesce((select json_agg(t.person_id order by t.person_id) from emba_team_record_tag t where t.record_id=r.id),'[]') as tags,
   coalesce((select json_agg(json_build_object('decision',d.number,'topic',case when d.state='withdrawn' then null else d.topic end,'state',c.state) order by d.number)
    from emba_team_conflict c join emba_team_record d on d.id=c.decision_id where c.output_id=r.id),'[]') as conflicts,
   s.number as "supersededBy",n.number as "replacedBy",
   coalesce((select json_agg(o.number order by o.number) from (select claim_b as other_id from emba_team_overlap where claim_a=r.id union all select claim_a from emba_team_overlap where claim_b=r.id) x
    join emba_team_record o on o.id=x.other_id and o.state='current' and o.claim_status in ('open','proposed')),'[]') as overlaps,
   (select e.slug from emba_team_event e where e.id=r.event_id) as event
  from emba_team_record r left join emba_team_record s on s.id=r.superseded_by left join emba_team_record n on n.id=r.replaced_by where r.id=any($1::uuid[])`,[rows.map(row=>row.id)]);
 const extra=new Map(extras.map(item=>[item.id,item]));
 const person=await viewPeople(q,p,team,[...rows.flatMap(row=>[row.authorId,row.ownerId]),...extras.flatMap(item=>item.tags)]);
 return rows.map(row=>{
  const more=extra.get(row.id);
  const base={number:row.number,kind:row.kind,state:row.state,version:row.version,event:more?.event??null,by:person(row.authorId),assistant:row.clientId,
   createdAt:new Date(row.createdAt).toISOString(),tags:(more?.tags??[]).map(person)};
  // A withdrawn record has no text left to show.
  if(row.state==='withdrawn'||row.body===null)return base;
  if(row.kind==='output'){const host=hostOf(row.url!);return {...base,title:row.title!,summary:row.body,url:row.url!,host,recognisedHost:recognisedHost(host),...(more?.replacedBy?{replacedBy:more.replacedBy}:{}),
   conflicts:more?.conflicts??[]};}
  if(row.kind==='decision')return {...base,topic:row.topic!,statement:row.body,...(more?.supersededBy?{supersededBy:more.supersededBy}:{})};
  if(row.kind==='claim')return {...base,what:row.body,owner:person(row.ownerId),dueOn:row.dueOn,claimStatus:row.claimStatus!,overlaps:more?.overlaps??[]};
  return {...base,text:row.body};
 });
}
async function viewOne(ctx:Ctx,id:string):Promise<RecordView> {
 const {rows}=await ctx.q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.id=$1`,[id]);
 return (await viewRecords(ctx.q,ctx.p,ctx.scope,rows))[0];
}

const digest=(tool:string,input:unknown)=>createHash('sha256').update(JSON.stringify([tool,input])).digest('hex');
type Work={recordId:string;also?:string[]}|Declined;
/**
 * The one path every team write takes (design D16). Order of locks: the
 * acting person, then the team's state row. Authority, retry, caps and the
 * work itself all happen under that lock, and authority is checked again
 * before commit.
 */
async function write(db:Db,p:Principal,team:Scope,tool:string,input:{operationId?:string},work:(ctx:Ctx)=>Promise<Work>,options:{siteOnly?:boolean;manage?:boolean;people?:(string|undefined)[];record?:number}={},attempt=0):Promise<WriteResult> {
 const {operationId:operation,...content}=input,hash=digest(tool,content);
 try {
  return await db.tx(async q=>{
   // A write waits a bounded time for its locks, then saves nothing.
   await q.query("set local lock_timeout='2s'");
   // An assistant's name is stored with what it writes; one that is not plain printable text writes nothing.
   if(p.clientId!==null&&!/^[ -~]{1,200}$/.test(p.clientId))forbidden();
   // The actor's own row is locked without blocking others from referring to them.
   await q.query('select id from person where id=$1 for no key update',[p.personId]);
   const authority=async()=>{
    if(options.siteOnly)await requireFirstParty(q,p);
    const lease=await authorize(q,p,'group-memory:write',team);
    // Every write can answer with team records (current decisions, the record as it stands), so it needs read consent too.
    await authorize(q,p,'plan:read',team);
    if(!await canAccessLoop(q,p,team.orgId,team.loopId,options.manage?'manage':'post'))forbidden();
    return lease;
   };
   const lease=await authority();
   const {rows:[address]}=await q.query('select 1 from emba_group_address where org_id=$1 and loop_id=$2 and retired_at is null for share',[team.orgId,team.loopId]);
   if(!address)forbidden();
   // Lock order (design D16): the actor, then every other person the write names or concerns, then the team.
   // Account deletion and removal lock the person first too, so neither can cross a write.
   const handles=(options.people??[]).filter((handle):handle is string=>Boolean(handle));
   if(handles.length)await q.query('select p.id from person p join emba_member_handle h on h.person_id=p.id where h.org_id=$1 and h.handle=any($2::text[]) order by p.id for key share of p',[team.orgId,handles]);
   if(options.record!==undefined)await q.query('select p.id from person p join emba_team_record r on p.id in (r.author_id,r.owner_id) where r.org_id=$1 and r.loop_id=$2 and r.number=$3 order by p.id for key share of p',[team.orgId,team.loopId,options.record]);
   await q.query('insert into emba_team_state(org_id,loop_id) values($1,$2) on conflict do nothing',[team.orgId,team.loopId]);
   const {rows:[state]}=await q.query<State>('select record_seq as "recordSeq",decision_seq as "decisionSeq",change_seq::int as "changeSeq",timezone from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
   const ctx:Ctx={q,p,scope:team,state,manager:p.clientId===null&&await canAccessLoop(q,p,team.orgId,team.loopId,'manage')};
   // A retry returns the record as it stands now, and writes nothing. Without an operation id, an identical
   // write counts as a retry only while nothing has happened to its record since.
   const {rows:[prior]}=await q.query<{recordId:string;hash:string;clientId:string|null;orgId:string;loopId:string}>(operation
    ?'select record_id as "recordId",request_hash as hash,client_id as "clientId",org_id as "orgId",loop_id as "loopId" from emba_team_operation where person_id=$1 and operation_id=$2'
    :`select record_id as "recordId",request_hash as hash,client_id as "clientId",org_id as "orgId",loop_id as "loopId" from emba_team_operation o where person_id=$1 and request_hash=$2 and client_id is not distinct from $3 and org_id=$4 and loop_id=$5 and at>clock_timestamp()-make_interval(mins=>${LIMITS.retryMinutes})
     and not exists(select 1 from emba_team_change c where c.org_id=o.org_id and c.loop_id=o.loop_id and c.record_id=o.record_id and c.seq>o.change_seq) order by at desc limit 1`,
    operation?[p.personId,operation]:[p.personId,hash,p.clientId,team.orgId,team.loopId]);
   if(prior){
    if(prior.hash!==hash||prior.clientId!==p.clientId||prior.orgId!==team.orgId||prior.loopId!==team.loopId)throw new EmbaError('conflict');
    await audit(q,p,'memory:write',prior.recordId,lease);
    return {saved:true as const,replayed:true,record:await viewOne(ctx,prior.recordId),decisionsVersion:state.decisionSeq,also:[]};
   }
   const {rows:[recent]}=await q.query<{count:number}>(`select ((select count(*) from emba_team_operation where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour')
    +(select count(*) from emba_team_conflict_report where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour')
    +(select count(*) from emba_team_write where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour'))::int as count`,[team.orgId,team.loopId,p.personId,p.clientId]);
   if(recent.count>=LIMITS.writesPerHour)return declined({saved:false,reason:'cap',cap:'writes_per_hour'});
   // A declined write undoes everything the work had already done.
   let result:Work;
   await q.query('savepoint team_work');
   try{result=await work(ctx);}
   catch(error){if(!(error instanceof Decline))throw error;await q.query('rollback to savepoint team_work');result=error.result;}
   // Authority is checked again inside the transaction, so a grant revoked a moment ago is not used.
   const final=await authority();
   if('saved' in result){
    // A reported conflict is the one declined outcome that leaves a (content-free) row behind.
    if(result.reason==='conflict_reported'){
     const {rows:[seen]}=await q.query(`select 1 from emba_team_conflict_report where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and request_hash=$5 and at>clock_timestamp()-make_interval(mins=>${LIMITS.retryMinutes}) limit 1`,[team.orgId,team.loopId,p.personId,p.clientId,hash]);
     if(!seen){
      await q.query('insert into emba_team_conflict_report(org_id,loop_id,person_id,client_id,request_hash,decisions) values($1,$2,$3,$4,$5,$6)',[team.orgId,team.loopId,p.personId,p.clientId,hash,result.decisions.length]);
      await audit(q,p,'memory:write',null,final);
     }
    }
    // A declined write may have shown team records; that is a read, and is recorded as one.
    await audit(q,p,'plan:read',team.loopId,final);
    return result;
   }
   await q.query('insert into emba_team_operation(org_id,loop_id,person_id,client_id,operation_id,request_hash,record_id,change_seq) values($1,$2,$3,$4,$5,$6,$7,$8)',[team.orgId,team.loopId,p.personId,p.clientId,operation??null,hash,result.recordId,ctx.state.changeSeq]);
   await audit(q,p,'memory:write',result.recordId,final);
   const also:RecordView[]=[];
   for(const id of result.also??[])also.push(await viewOne(ctx,id));
   return {saved:true as const,replayed:false,record:await viewOne(ctx,result.recordId),decisionsVersion:ctx.state.decisionSeq,also};
  });
 }catch(error){
  // 55P03: the lock wait ran out. 23505 on the operation id: the same call arrived twice at once.
  const code=typeof error==='object'&&error!==null&&'code' in error?error.code:null;
  // 40P01 and 40001: the database stopped this write to let another finish. Nothing was saved either way.
  if(code==='55P03'||code==='40P01'||code==='40001')return {saved:false,reason:'busy'};
  // A database rule refused the content. Its message quotes the row, so it is replaced by a plain invalid-input error.
  if(code==='23514'||(typeof code==='string'&&code.startsWith('22')))throw new ZodError([]);
  if(code==='23505'&&operation&&attempt===0)return write(db,p,team,tool,input,work,options,1);
  throw error;
 }
}

async function nextNumber(ctx:Ctx):Promise<number> {
 const {rows:[row]}=await ctx.q.query<{n:number}>('update emba_team_state set record_seq=record_seq+1 where org_id=$1 and loop_id=$2 returning record_seq as n',[ctx.scope.orgId,ctx.scope.loopId]);
 return ctx.state.recordSeq=row.n;
}
async function bumpDecisions(ctx:Ctx) {
 const {rows:[row]}=await ctx.q.query<{n:number}>('update emba_team_state set decision_seq=decision_seq+1 where org_id=$1 and loop_id=$2 returning decision_seq as n',[ctx.scope.orgId,ctx.scope.loopId]);
 ctx.state.decisionSeq=row.n;
}
async function change(ctx:Ctx,recordId:string,action:string,extra:{subjectId?:string|null;otherId?:string|null}={}) {
 const {rows:[row]}=await ctx.q.query<{n:number}>('update emba_team_state set change_seq=change_seq+1 where org_id=$1 and loop_id=$2 returning change_seq::int as n',[ctx.scope.orgId,ctx.scope.loopId]);
 ctx.state.changeSeq=row.n;
 await ctx.q.query('insert into emba_team_change(org_id,loop_id,seq,record_id,action,actor_id,client_id,subject_id,other_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[ctx.scope.orgId,ctx.scope.loopId,row.n,recordId,action,ctx.p.personId,ctx.p.clientId,extra.subjectId??null,extra.otherId??null]);
}
async function insert(ctx:Ctx,record:Record<string,unknown>,version:{title?:string;body:string;url?:string}):Promise<string> {
 const number=await nextNumber(ctx);
 const values:Record<string,unknown>={org_id:ctx.scope.orgId,loop_id:ctx.scope.loopId,number,author_id:ctx.p.personId,client_id:ctx.p.clientId,current_version:1,...record};
 const names=Object.keys(values);
 const {rows:[row]}=await ctx.q.query<{id:string}>(`insert into emba_team_record(${names.join(',')}) values(${names.map((_,i)=>`$${i+1}`).join(',')}) returning id`,Object.values(values));
 await ctx.q.query('insert into emba_team_record_version(record_id,version,title,body,url,edited_by,client_id) values($1,1,$2,$3,$4,$5,$6)',[row.id,version.title??null,version.body,version.url??null,ctx.p.personId,ctx.p.clientId]);
 return row.id;
}
async function eventId(ctx:Ctx,slug:string|undefined):Promise<string|null> {
 if(!slug)return null;
 const {rows:[row]}=await ctx.q.query<{id:string}>('select id from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null for share',[ctx.scope.orgId,ctx.scope.loopId,slug]);
 return row?.id??stop({saved:false,reason:'unknown_reference',kind:'event',value:slug});
}
/** A handle names exactly one current teammate, or nothing is saved. */
async function teammate(ctx:Ctx,handle:string):Promise<string> {
 const {rows:[row]}=await ctx.q.query<{personId:string}>(`select h.person_id as "personId" from emba_member_handle h where h.org_id=$1 and h.handle=$2
  and exists(select 1 from emba_membership m where m.org_id=h.org_id and m.person_id=h.person_id and m.revoked_at is null)
  and exists(with recursive up as (select id,parent_id from emba_loop where org_id=$1 and id=$3 union all select l.id,l.parent_id from emba_loop l join up on l.id=up.parent_id where l.org_id=$1)
   select 1 from up join emba_role r on r.org_id=$1 and r.loop_id=up.id and r.person_id=h.person_id and r.revoked_at is null and r.role in ('owner','organizer','member'))
  and exists(select 1 from emba_identity i where i.person_id=h.person_id and i.revoked_at is null)
  and not exists(select 1 from emba_deletion_tombstone t where t.person_id=h.person_id)`,[ctx.scope.orgId,handle,ctx.scope.loopId]);
 return row?.personId??stop({saved:false,reason:'unknown_reference',kind:'person',value:handle});
}
async function tag(ctx:Ctx,recordId:string,handles:string[]) {
 for(const handle of handles){
  const personId=await teammate(ctx,handle);
  const {rows}=await ctx.q.query('insert into emba_team_record_tag(record_id,person_id) values($1,$2) on conflict do nothing returning person_id',[recordId,personId]);
  if(rows.length)await change(ctx,recordId,'tagged',{subjectId:personId});
 }
}
async function count(ctx:Ctx,where:string):Promise<number> {
 const {rows:[row]}=await ctx.q.query<{n:number}>(`select count(*)::int as n from emba_team_record where org_id=$1 and loop_id=$2 and state='current' and ${where}`,[ctx.scope.orgId,ctx.scope.loopId]);
 return row.n;
}
const link=(raw:string)=>{const found=normaliseLink(raw);return 'problem' in found?stop({saved:false,reason:'link_refused',problem:found.problem}):found.url;};

/**
 * The conflict check (design D5). The caller must hold the team's current
 * decisions and say which of them the output contradicts. Loop runs no model:
 * this proves the decisions were delivered, not that they were compared.
 */
async function checked(ctx:Ctx,data:{decisionsVersion?:number;conflictsWith:(number|string)[];fileAnyway:boolean}):Promise<string[]> {
 const decisions=await currentDecisions(ctx.q,ctx.scope);
 if(data.decisionsVersion!==ctx.state.decisionSeq)stop({saved:false,reason:'decisions_needed',decisionsVersion:ctx.state.decisionSeq,decisions:decisions.map(summary)});
 const named=[...new Map(data.conflictsWith.map(value=>decisions.find(item=>item.number===value||item.topic===value)??stop({saved:false,reason:'unknown_reference',kind:'decision',value:String(value)})).map(item=>[item.id,item])).values()];
 if(named.length&&!data.fileAnyway)stop({saved:false,reason:'conflict_reported',decisionsVersion:ctx.state.decisionSeq,decisions:named.map(summary)});
 return [...new Set(named.map(item=>item.id))];
}
async function flag(ctx:Ctx,outputId:string,decisionIds:string[]) {
 for(const decisionId of decisionIds){
  await ctx.q.query("insert into emba_team_conflict(org_id,loop_id,output_id,decision_id,flagged_by) values($1,$2,$3,$4,$5) on conflict(output_id,decision_id) do update set state='flagged',flagged_by=excluded.flagged_by",[ctx.scope.orgId,ctx.scope.loopId,outputId,decisionId,ctx.p.personId]);
  await change(ctx,outputId,'flagged',{otherId:decisionId});
 }
}
const conflictInput={decisionsVersion:z.number().int().min(0).optional(),conflictsWith:z.array(z.union([ref,nameSchema])).max(20).default([]),fileAnyway:z.boolean().default(false)};

const outputSchema=z.strictObject({...scope,operationId,url:z.string().min(1).max(8000),title:lineSchema(LIMITS.title),summary:lineSchema(LIMITS.summary),event:nameSchema.optional(),
 replaces:ref.optional(),closesClaim:ref.optional(),tags,...conflictInput});
export async function fileOutput(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=outputSchema.parse(input);
 return write(db,p,data,'file_output',data,async ctx=>{
  const url=link(data.url),event=await eventId(ctx,data.event);
  const replaced=data.replaces===undefined?null:await locked(ctx.q,ctx.scope,data.replaces,'output');
  if(data.replaces!==undefined&&(!replaced||replaced.state!=='current'))stop(replaced?{saved:false,reason:'stale',current:(await viewRecords(ctx.q,ctx.p,ctx.scope,[replaced]))[0]}:{saved:false,reason:'unknown_reference',kind:'output',value:String(data.replaces)});
  const closing=data.closesClaim===undefined?null:await locked(ctx.q,ctx.scope,data.closesClaim,'claim');
  if(data.closesClaim!==undefined&&!closing)stop({saved:false,reason:'unknown_reference',kind:'claim',value:String(data.closesClaim)});
  if(closing&&(closing.ownerId!==ctx.p.personId||closing.state!=='current'||closing.claimStatus!=='open'))stop({saved:false,reason:'stale',current:(await viewRecords(ctx.q,ctx.p,ctx.scope,[closing]))[0]});
  const conflicts=await checked(ctx,data);
  if(!replaced&&await count(ctx,"kind='output'")>=LIMITS.currentOutputs)stop({saved:false,reason:'cap',cap:'current_outputs'});
  const id=await insert(ctx,{kind:'output',event_id:event},{title:data.title,body:data.summary,url});
  await change(ctx,id,'filed');
  if(replaced){
   await ctx.q.query("update emba_team_record set state='replaced',replaced_by=$2 where id=$1",[replaced.id,id]);
   await ctx.q.query('delete from emba_team_conflict where output_id=$1',[replaced.id]);
   await change(ctx,replaced.id,'replaced',{otherId:id});
  }
  if(closing){
   await ctx.q.query("update emba_team_record set claim_status='done' where id=$1",[closing.id]);
   await change(ctx,closing.id,'done',{otherId:id});
  }
  await flag(ctx,id,conflicts);
  await tag(ctx,id,data.tags);
  return {recordId:id,also:[replaced?.id,closing?.id].filter((item):item is string=>Boolean(item))};
 },{people:data.tags});
}

const correctOutputSchema=z.strictObject({...scope,operationId,number:ref,expectedVersion:ref,url:z.string().min(1).max(8000),title:lineSchema(LIMITS.title),summary:lineSchema(LIMITS.summary),...conflictInput});
/** A correction is a new version and is subject to the same conflict check; a flag is cleared only by an empty list. */
export async function correctOutput(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=correctOutputSchema.parse(input);
 return write(db,p,data,'correct_output',data,async ctx=>{
  const url=link(data.url),row=await locked(ctx.q,ctx.scope,data.number,'output');
  if(!row)return stop({saved:false,reason:'unknown_reference',kind:'output',value:String(data.number)});
  if(row.authorId!==ctx.p.personId)forbidden();
  if(row.state!=='current'||row.version!==data.expectedVersion)stop({saved:false,reason:'stale',current:(await viewRecords(ctx.q,ctx.p,ctx.scope,[row]))[0]});
  const conflicts=await checked(ctx,data);
  await ctx.q.query('insert into emba_team_record_version(record_id,version,title,body,url,edited_by,client_id) values($1,$2,$3,$4,$5,$6,$7)',[row.id,row.version+1,data.title,data.summary,url,ctx.p.personId,ctx.p.clientId]);
  await ctx.q.query('update emba_team_record set current_version=$2 where id=$1',[row.id,row.version+1]);
  await change(ctx,row.id,'corrected');
  // A flag goes only when the correction reports no conflict at all, or when its decision is no longer current (the re-check has now happened).
  const {rows:gone}=await ctx.q.query("delete from emba_team_conflict c using emba_team_record d where d.id=c.decision_id and c.output_id=$1 and ($2::boolean or d.state<>'current') returning c.decision_id",[row.id,conflicts.length===0]);
  if(gone.length)await change(ctx,row.id,'unflagged');
  await flag(ctx,row.id,conflicts);
  return {recordId:row.id};
 });
}

// A topic key needs a letter, so that "12" always means record number 12.
const decisionSchema=z.strictObject({...scope,operationId,topic:nameSchema.refine(value=>/[a-z]/.test(value)),statement:lineSchema(LIMITS.statement),newTopic:z.boolean().default(false),supersedes:ref.optional(),conflictsWithOutputs:refs,tags})
 .refine(data=>!(data.newTopic&&data.supersedes!==undefined));
export async function logDecision(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=decisionSchema.parse(input);
 return write(db,p,data,'log_decision',data,async ctx=>{
  const decisions=await currentDecisions(ctx.q,ctx.scope),current=decisions.find(item=>item.topic===data.topic);
  // A new topic must be declared, so a near-duplicate key is noticed; an existing one must name what it replaces.
  if(!current&&data.supersedes!==undefined)stop({saved:false,reason:'stale',current:null});
  if(!current&&!data.newTopic)stop({saved:false,reason:'new_topic_unconfirmed',topics:decisions.map(summary)});
  if(current&&data.newTopic)stop({saved:false,reason:'topic_exists',current:summary(current)});
  if(current&&data.supersedes!==current.number)stop({saved:false,reason:'stale',current:await viewOne(ctx,current.id)});
  const outputs:string[]=[];
  for(const number of data.conflictsWithOutputs){
   const row=await locked(ctx.q,ctx.scope,number,'output');
   if(!row||row.state!=='current')return stop({saved:false,reason:'unknown_reference',kind:'output',value:String(number)});
   outputs.push(row.id);
  }
  if(!current&&decisions.length>=LIMITS.currentDecisions)stop({saved:false,reason:'cap',cap:'current_decisions'});
  // The successor's id is fixed first so the old decision can point at it before it exists (deferred key).
  const {rows:[fresh]}=await ctx.q.query<{id:string}>('select gen_random_uuid() as id');
  if(current){
   await locked(ctx.q,ctx.scope,current.number,'decision');
   await ctx.q.query("update emba_team_record set state='superseded',superseded_by=$2 where id=$1",[current.id,fresh.id]);
  }
  const id=await insert(ctx,{id:fresh.id,kind:'decision',topic:data.topic},{body:data.statement});
  await bumpDecisions(ctx);
  await change(ctx,id,'logged');
  if(current){
   await change(ctx,current.id,'superseded',{otherId:id});
   // A flag against the old decision is not cleared; it asks for a re-check.
   const {rows:flagged}=await ctx.q.query<{outputId:string}>(`update emba_team_conflict set state='recheck' where decision_id=$1 and state='flagged' returning output_id as "outputId"`,[current.id]);
   for(const item of flagged)await change(ctx,item.outputId,'recheck',{otherId:current.id});
  }
  for(const outputId of outputs)await flag(ctx,outputId,[id]);
  await tag(ctx,id,data.tags);
  return {recordId:id,also:[...(current?[current.id]:[]),...outputs]};
 },{people:data.tags});
}

const claimSchema=z.strictObject({...scope,operationId,what:lineSchema(LIMITS.claim),owner:nameSchema.optional(),dueOn:day.optional(),event:nameSchema.optional(),overlapsWith:refs,tags});
/** A claim for yourself is open at once; a claim for someone else is proposed until they confirm it (design D4). */
export async function claim(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=claimSchema.parse(input);
 return write(db,p,data,'claim',data,async ctx=>{
  const event=await eventId(ctx,data.event),ownerId=data.owner?await teammate(ctx,data.owner):ctx.p.personId,own=ownerId===ctx.p.personId;
  const others:string[]=[];
  for(const number of data.overlapsWith){
   const row=await locked(ctx.q,ctx.scope,number,'claim');
   if(!row||row.state!=='current'||!['open','proposed'].includes(row.claimStatus??''))return stop({saved:false,reason:'unknown_reference',kind:'claim',value:String(number)});
   others.push(row.id);
  }
  if(await count(ctx,"kind='claim' and claim_status in ('open','proposed')")>=LIMITS.openClaims)stop({saved:false,reason:'cap',cap:'open_claims'});
  const id=await insert(ctx,{kind:'claim',event_id:event,owner_id:ownerId,due_on:data.dueOn??null,claim_status:own?'open':'proposed'},{body:data.what});
  await change(ctx,id,own?'claimed':'proposed',{subjectId:own?null:ownerId});
  for(const other of others){
   const [a,b]=[id,other].sort();
   await ctx.q.query('insert into emba_team_overlap(org_id,loop_id,claim_a,claim_b) values($1,$2,$3,$4) on conflict do nothing',[ctx.scope.orgId,ctx.scope.loopId,a,b]);
   await change(ctx,id,'overlap',{otherId:other});
  }
  await tag(ctx,id,data.tags);
  return {recordId:id,also:others};
 },{people:[...data.tags,data.owner]});
}

const amendSchema=z.strictObject({...scope,operationId,number:ref,action:z.enum(['withdraw','confirm','decline','done','release','untag'])});
/** Withdraws a record, moves a claim on, or removes the caller's own tag. A stale request saves nothing and returns the record as it stands. */
export async function amendRecord(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=amendSchema.parse(input);
 return write(db,p,data,'amend_record',data,async ctx=>{
  const row=await locked(ctx.q,ctx.scope,data.number);
  if(!row)return stop({saved:false,reason:'unknown_reference',kind:'record',value:String(data.number)});
  const stale=async()=>stop({saved:false,reason:'stale',current:(await viewRecords(ctx.q,ctx.p,ctx.scope,[row]))[0]});
  if(data.action==='untag'){
   const {rows}=await ctx.q.query('delete from emba_team_record_tag where record_id=$1 and person_id=$2 returning person_id',[row.id,ctx.p.personId]);
   if(!rows.length)await stale();
   await change(ctx,row.id,'untagged',{subjectId:ctx.p.personId});
   return {recordId:row.id};
  }
  if(data.action==='withdraw'){
   // The author, or an owner or organizer. Announcements are the organizers' own.
   if(row.authorId!==ctx.p.personId&&!ctx.manager)forbidden();
   if(row.state==='withdrawn')await stale();
   // Withdrawal removes the text and the link from every stored version.
   await ctx.q.query('update emba_team_record_version set withdrawn=true,title=null,body=null,url=null where record_id=$1',[row.id]);
   // A withdrawn claim is no longer held by anyone: it is let go, so its owner link can be removed when that person leaves.
   await ctx.q.query("update emba_team_record set state='withdrawn',claim_status=case claim_status when 'open' then 'released' when 'proposed' then 'declined' else claim_status end where id=$1",[row.id]);
   await ctx.q.query('delete from emba_team_record_tag where record_id=$1',[row.id]);
   await ctx.q.query('delete from emba_team_conflict where output_id=$1',[row.id]);
   if(row.kind==='decision'){
    if(row.state==='current')await bumpDecisions(ctx);
    const {rows:flagged}=await ctx.q.query<{outputId:string}>(`update emba_team_conflict set state='recheck' where decision_id=$1 and state='flagged' returning output_id as "outputId"`,[row.id]);
    for(const item of flagged)await change(ctx,item.outputId,'recheck',{otherId:row.id});
   }
   await change(ctx,row.id,'withdrawn');
   return {recordId:row.id};
  }
  if(row.kind!=='claim'||row.state!=='current')return stale();
  const owner=row.ownerId===ctx.p.personId,recorder=row.authorId===ctx.p.personId;
  if(data.action==='confirm'||data.action==='decline'){
   // Only the person a claim was proposed for can accept or refuse it.
   if(!owner)forbidden();
   if(row.claimStatus!=='proposed')await stale();
   await ctx.q.query('update emba_team_record set claim_status=$2 where id=$1',[row.id,data.action==='confirm'?'open':'declined']);
   await change(ctx,row.id,data.action==='confirm'?'confirmed':'declined',{subjectId:row.authorId});
   return {recordId:row.id};
  }
  if(!owner&&!recorder&&!ctx.manager)forbidden();
  // Done needs an accepted claim; a proposal can only be released (taken back) or declined.
  if(data.action==='done'?row.claimStatus!=='open':!['open','proposed'].includes(row.claimStatus??''))await stale();
  await ctx.q.query('update emba_team_record set claim_status=$2 where id=$1',[row.id,data.action==='done'?'done':'released']);
  await change(ctx,row.id,data.action==='done'?'done':'released',{subjectId:owner?null:row.ownerId});
  return {recordId:row.id};
 },{record:data.number});
}

const announcementSchema=z.strictObject({...scope,operationId,text:lineSchema(LIMITS.announcement)});
/** Site only: an owner or organizer posts an announcement. It is withdrawn with amendRecord. */
export async function postAnnouncement(db:Db,p:Principal,input:unknown):Promise<WriteResult> {
 const data=announcementSchema.parse(input);
 return write(db,p,data,'announce',data,async ctx=>{
  const id=await insert(ctx,{kind:'announcement'},{body:data.text});
  await change(ctx,id,'announced');
  return {recordId:id};
 },{siteOnly:true,manage:true});
}

/** SQL: person $1 is still a member of the team who may post. */
const canPost=(org:string,loop:string)=>`(exists(select 1 from emba_membership m where m.org_id=${org} and m.person_id=$1 and m.revoked_at is null) and not exists(select 1 from emba_deletion_tombstone t where t.person_id=$1)
    and exists(with recursive up as (select id,parent_id from emba_loop where org_id=${org} and id=${loop} union all select l.id,l.parent_id from emba_loop l join up on l.id=up.parent_id where l.org_id=${org})
     select 1 from up join emba_role r on r.org_id=${org} and r.loop_id=up.id and r.person_id=$1 and r.revoked_at is null and r.role in ('owner','organizer','member')))`;
/**
 * In every team the person can no longer write to (role or membership
 * removed, or account deleted): their open claims are released, claims
 * proposed for them are declined, tags on them are removed (design D13), their
 * answers to open asks are removed and their own open asks are closed.
 * The caller already holds the person's lock; team locks follow in a fixed order.
 */
export async function releaseOnDeparture(q:Q,personId:string,options:{orgId?:string;actorId:string|null}) {
 // Interest follows membership: a person who can no longer post to a team is not listed as interested in its events.
 await q.query(`delete from emba_event_interest i where i.person_id=$1 and ($2::uuid is null or i.org_id=$2) and not ${canPost('i.org_id','i.loop_id')}`,[personId,options.orgId??null]);
 const {rows:teams}=await q.query<Scope>(`select s.org_id as "orgId",s.loop_id as "loopId" from emba_team_state s where ($2::uuid is null or s.org_id=$2)
   and not ${canPost('s.org_id','s.loop_id')}
   and (
   exists(select 1 from emba_team_record r where r.org_id=s.org_id and r.loop_id=s.loop_id and r.owner_id=$1 and r.state='current' and r.claim_status in ('open','proposed'))
   or exists(select 1 from emba_team_record_tag t join emba_team_record r on r.id=t.record_id where t.person_id=$1 and r.org_id=s.org_id and r.loop_id=s.loop_id)
   or exists(select 1 from emba_ask k where k.org_id=s.org_id and k.loop_id=s.loop_id and k.closed_at is null and k.closes_at>clock_timestamp()
    and (k.asker_id=$1 or exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=$1))))
  order by s.org_id,s.loop_id for update of s`,[personId,options.orgId??null]);
 for(const team of teams){
  const log=async(recordId:string,action:string,subjectId:string|null)=>{
   const {rows:[row]}=await q.query<{n:number}>('update emba_team_state set change_seq=change_seq+1 where org_id=$1 and loop_id=$2 returning change_seq::int as n',[team.orgId,team.loopId]);
   await q.query('insert into emba_team_change(org_id,loop_id,seq,record_id,action,actor_id,subject_id) values($1,$2,$3,$4,$5,$6,$7)',[team.orgId,team.loopId,row.n,recordId,action,options.actorId,subjectId]);
  };
  const {rows:claims}=await q.query<{id:string;status:string}>(`update emba_team_record set claim_status=case claim_status when 'open' then 'released' else 'declined' end
   where org_id=$1 and loop_id=$2 and owner_id=$3 and state='current' and claim_status in ('open','proposed') returning id,claim_status as status`,[team.orgId,team.loopId,personId]);
  for(const item of claims)await log(item.id,item.status,personId);
  const {rows:tagged}=await q.query<{id:string}>('delete from emba_team_record_tag t using emba_team_record r where r.id=t.record_id and r.org_id=$1 and r.loop_id=$2 and t.person_id=$3 returning r.id',[team.orgId,team.loopId,personId]);
  for(const item of tagged)await log(item.id,'untagged',personId);
  // Asks follow membership: an answer to an open ask no longer counts, and the person's own open asks are closed. Answers to closed asks stay, shown as a former member's.
  await q.query('delete from emba_ask_answer a using emba_ask k where k.id=a.ask_id and k.org_id=$1 and k.loop_id=$2 and a.person_id=$3 and k.closed_at is null and k.closes_at>clock_timestamp()',[team.orgId,team.loopId,personId]);
  const {rows:asks}=await q.query<{id:string}>('update emba_ask set closed_at=clock_timestamp() where org_id=$1 and loop_id=$2 and asker_id=$3 and closed_at is null and closes_at>clock_timestamp() returning id',[team.orgId,team.loopId,personId]);
  for(const item of asks){
   const {rows:[row]}=await q.query<{n:number}>('update emba_team_state set change_seq=change_seq+1 where org_id=$1 and loop_id=$2 returning change_seq::int as n',[team.orgId,team.loopId]);
   await q.query("insert into emba_team_change(org_id,loop_id,seq,ask_id,action,actor_id) values($1,$2,$3,$4,'ask_closed',$5)",[team.orgId,team.loopId,row.n,item.id,options.actorId]);
  }
 }
}

/** How people are shown to an assistant: by handle, never by id. A person who is no longer on this team, or deleted their account, has no handle. */
export async function viewPeople(q:Q,p:Principal,team:Scope,ids:(string|null)[]):Promise<(id:string|null)=>PersonView> {
 return (await knownPeople(q,p,team,ids)).view;
}
/**
 * The people named by id, in one statement: how each is shown, and for the site their name.
 * A name is selected only when the caller is a person on the site, so no row read for an assistant holds one.
 */
export async function knownPeople(q:Q,p:Principal,team:Scope,ids:(string|null)[]):Promise<{view:(id:string|null)=>PersonView;name:(id:string|null)=>string|null}> {
 const wanted=[...new Set(ids.filter((id):id is string=>Boolean(id)))];
 const {rows}=wanted.length?await q.query<{personId:string;handle:string|null;live:boolean;namespace:string|null;name:string|null}>(`select p.id as "personId",h.handle,
  (exists(select 1 from emba_membership m where m.org_id=$2 and m.person_id=p.id and m.revoked_at is null) and not exists(select 1 from emba_deletion_tombstone t where t.person_id=p.id)
   and exists(with recursive up as (select id,parent_id from emba_loop where org_id=$2 and id=$3 union all select l.id,l.parent_id from emba_loop l join up on l.id=up.parent_id where l.org_id=$2)
    select 1 from up join emba_role r on r.org_id=$2 and r.loop_id=up.id and r.person_id=p.id and r.revoked_at is null)) as live,
  (select n.namespace from emba_group_namespace n where n.org_id=$2) as namespace,case when $4::boolean then p.name end as name
  from person p left join emba_member_handle h on h.org_id=$2 and h.person_id=p.id where p.id=any($1::uuid[]) order by p.id`,[wanted,team.orgId,team.loopId,p.clientId===null]):{rows:[]};
 const known=new Map(rows.map(row=>[row.personId,row]));
 return {
  view:id=>{
   const found=id===null?undefined:known.get(id);
   return {handle:found?.live&&found.handle&&found.namespace?`@${found.namespace}/${found.handle}`:null,isYou:id!==null&&id===p.personId,former:!found?.live};
  },
  name:id=>(id===null?undefined:known.get(id))?.name??null,
 };
}

/**
 * Run after a role or membership change has committed. A write that named
 * the person either finished before the change took their lock, and is seen
 * here, or starts after it and no longer finds them on the team.
 */
export async function releaseAfterAccessChange(db:Db,personId:string,orgId:string,actorId:string|null) {
 // The access change has already been saved and cannot be asked for again, so a busy team is waited out here.
 for(let attempt=1;;attempt++){
  try{
   await db.tx(async q=>{
    await q.query("set local lock_timeout='10s'");
    await q.query('select id from person where id=$1 for update',[personId]);
    await releaseOnDeparture(q,personId,{orgId,actorId});
   });
   return;
  }catch(error){
   if(attempt===3||!['55P03','40P01','40001'].includes((error as {code?:string}).code??''))throw error;
  }
 }
}
