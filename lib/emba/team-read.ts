import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,canAccessPersonal,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {rowColumns,rowFrom,viewPeople,viewRecords,type PersonView,type RecordView,type Row} from './team-records';
import {nameSchema,singleLine} from './team-text';

// What a team's records say now (design D8, D9). Every read is one snapshot:
// a write that commits while it runs is either wholly in the answer or not at all.

export const READ={list:30,announcements:5,briefLength:4000,windowDays:7,warnDays:5} as const;
type Scope={orgId:string;loopId:string};
const scope={orgId:z.uuid(),loopId:z.uuid()};
const day=z.string().regex(/^2[01]\d{2}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().startsWith(value);});

export type TeamHead={handle:string;name:string};
export type Listed<T>={items:T[];more:number};
export type Brief={version:number;body:string;deadline:string|null;editedAt:string};
export type TeamBrief={team:TeamHead;timezone:string;today:string;brief:Brief|null;announcements:RecordView[];resources:Listed<string>;
 counts:{openClaims:number;currentOutputs:number;currentDecisions:number};grantExpiresOn:string|null;untrusted:true};
export type ConflictFlag={output:number;decision:number;topic:string|null;state:'flagged'|'recheck'};
export type TeamState={team:TeamHead;event:string|null;timezone:string;today:string;deadline:string|null;decisionsVersion:number;
 claims:Listed<RecordView&{pastDue:boolean}>;outputs:Listed<RecordView>;decisions:Listed<RecordView>;conflicts:Listed<ConflictFlag>;untrusted:true};
export type Change={cursor:string;action:string;at:string;record:RecordView;by:PersonView;assistant:string|null;other:number|null;about:PersonView|null;mentionsYou:boolean};
export type WhatsNew={team:TeamHead;window:'cursor'|'since'|'last_7_days';changes:Change[];cursor:string;more:boolean;untrusted:true};

type Base={q:Q;lease:string|null;team:TeamHead;timezone:string;today:string;decisionSeq:number;changeSeq:number};
async function reading<T>(db:Db,p:Principal,team:Scope,work:(base:Base)=>Promise<T>):Promise<T> {
 return db.tx(async q=>{
  await q.query('set transaction isolation level repeatable read');
  const lease=await authorize(q,p,'plan:read',team);
  const {rows:[head]}=await q.query<{namespace:string;slug:string;root:boolean;name:string}>(`select a.namespace,a.slug,l.parent_id is null as root,o.name
   from emba_group_address a join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id join emba_organization o on o.id=a.org_id
   where a.org_id=$1 and a.loop_id=$2 and a.retired_at is null`,[team.orgId,team.loopId]);
  if(!head)throw new EmbaError('forbidden');
  const {rows:[state]}=await q.query<{timezone:string;decisionSeq:number;changeSeq:number}>('select timezone,decision_seq as "decisionSeq",change_seq::int as "changeSeq" from emba_team_state where org_id=$1 and loop_id=$2',[team.orgId,team.loopId]);
  const timezone=state?.timezone??'UTC';
  const {rows:[now]}=await q.query<{today:string}>("select to_char((clock_timestamp() at time zone $1)::date,'YYYY-MM-DD') as today",[timezone]);
  const value=await work({q,lease,team:{handle:head.root?`@${head.namespace}`:`@${head.namespace}/${head.slug}`,name:head.name},timezone,today:now.today,decisionSeq:state?.decisionSeq??0,changeSeq:state?.changeSeq??0});
  await audit(q,p,'plan:read',team.loopId,lease);
  return value;
 });
}
async function latestBrief(q:Q,team:Scope):Promise<Brief|null> {
 const {rows:[row]}=await q.query<Brief>(`select version,body,to_char(deadline,'YYYY-MM-DD') as deadline,at as "editedAt" from emba_team_brief where org_id=$1 and loop_id=$2 order by version desc limit 1`,[team.orgId,team.loopId]);
 return row?{...row,editedAt:new Date(row.editedAt).toISOString()}:null;
}
async function list(q:Q,p:Principal,team:Scope,where:string,order:string,params:unknown[]=[],limit:number=READ.list):Promise<Listed<RecordView>> {
 const {rows}=await q.query<Row&{total:number}>(`select ${rowColumns},count(*) over()::int as total from ${rowFrom} where r.org_id=$1 and r.loop_id=$2 and r.state='current' and ${where} order by ${order} limit ${limit}`,[team.orgId,team.loopId,...params]);
 return {items:await viewRecords(q,p,team,rows),more:Math.max(0,(rows[0]?.total??0)-rows.length)};
}
const openClaim="r.kind='claim' and r.claim_status in ('open','proposed')";

const briefSchema=z.strictObject({...scope,body:z.string().max(READ.briefLength*4),deadline:day.nullable().default(null),timezone:z.string().min(1).max(64).optional(),expectedVersion:z.number().int().min(0)});
/** One visible line per line; blank lines kept singly; nothing invisible. */
const cleanBrief=(body:string)=>body.split(/\r\n|\r|\n/).map(singleLine).join('\n').replace(/\n{3,}/g,'\n\n').replace(/^\n+|\n+$/g,'');
/** The zone's usual spelling, or null. Any name the runtime knows is accepted, in any letter case, including older names such as US/Eastern; a bare offset is not a name. */
const zoneName=(zone:string)=>{
 if(!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(zone))return null;
 try{return new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone;}catch{return null;}
};
/** Site only: an owner or organizer saves the brief, its deadline and the team's timezone. Earlier versions are kept. */
export async function saveBrief(db:Db,p:Principal,input:unknown):Promise<Brief> {
 const data=briefSchema.parse(input),body=cleanBrief(data.body),timezone=data.timezone===undefined?undefined:zoneName(data.timezone);
 if([...body].length>READ.briefLength||timezone===null)throw new z.ZodError([]);
 return db.tx(async q=>{
  await q.query("set local lock_timeout='2s'");
  await q.query('select id from person where id=$1 for update',[p.personId]);
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,data.orgId,data.loopId,'manage'))throw new EmbaError('forbidden');
  const {rows:[address]}=await q.query('select 1 from emba_group_address where org_id=$1 and loop_id=$2 and retired_at is null for share',[data.orgId,data.loopId]);
  if(!address)throw new EmbaError('forbidden');
  await q.query('insert into emba_team_state(org_id,loop_id) values($1,$2) on conflict do nothing',[data.orgId,data.loopId]);
  await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[data.orgId,data.loopId]);
  const current=await latestBrief(q,data);
  // Two organizers editing at once: the second is told, not merged.
  if((current?.version??0)!==data.expectedVersion)throw new EmbaError('conflict');
  if(timezone!==undefined)await q.query('update emba_team_state set timezone=$3 where org_id=$1 and loop_id=$2',[data.orgId,data.loopId,timezone]);
  await q.query('insert into emba_team_brief(org_id,loop_id,version,body,deadline,edited_by) values($1,$2,$3,$4,$5,$6)',[data.orgId,data.loopId,data.expectedVersion+1,body,data.deadline,p.personId]);
  await audit(q,p,'activity:write',data.loopId);
  return (await latestBrief(q,data))!;
 });
}
/** Site only: the brief's saved versions, newest first, for owners and organizers. */
export async function briefHistory(db:Db,p:Principal,input:unknown):Promise<Brief[]> {
 const team=z.strictObject(scope).parse(input);
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,team.orgId,team.loopId,'manage'))throw new EmbaError('forbidden');
  const {rows}=await q.query<Brief>(`select version,body,to_char(deadline,'YYYY-MM-DD') as deadline,at as "editedAt" from emba_team_brief where org_id=$1 and loop_id=$2 order by version desc limit 50`,[team.orgId,team.loopId]);
  return rows.map(row=>({...row,editedAt:new Date(row.editedAt).toISOString()}));
 });
}

export async function teamBrief(db:Db,p:Principal,input:unknown):Promise<TeamBrief> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q,lease,...base})=>{
  const announcements=await list(q,p,team,"r.kind='announcement'",'r.number desc',[],READ.announcements);
  const {rows:documents}=await q.query<{title:string;total:number}>(`select v.title,count(*) over()::int as total from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version
   where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null order by v.created_at desc,d.id limit $3`,[team.orgId,team.loopId,READ.list]);
  const {rows:[counts]}=await q.query<TeamBrief['counts']>(`select count(*) filter(where ${openClaim})::int as "openClaims",count(*) filter(where r.kind='output')::int as "currentOutputs",count(*) filter(where r.kind='decision')::int as "currentDecisions"
   from emba_team_record r where r.org_id=$1 and r.loop_id=$2 and r.state='current'`,[team.orgId,team.loopId]);
  // Only the calling assistant's own grant, and only when it is about to end.
  const {rows:[grant]}=lease?await q.query<{on:string}>(`select to_char(expires_at at time zone 'UTC','YYYY-MM-DD') as on from emba_lease where id=$1 and expires_at<clock_timestamp()+make_interval(days=>${READ.warnDays})`,[lease]):{rows:[]};
  return {team:base.team,timezone:base.timezone,today:base.today,brief:await latestBrief(q,team),announcements:announcements.items,
   resources:{items:documents.map(row=>singleLine(row.title)),more:Math.max(0,(documents[0]?.total??0)-documents.length)},counts,grantExpiresOn:grant?.on??null,untrusted:true as const};
 });
}

export async function teamState(db:Db,p:Principal,input:unknown):Promise<TeamState> {
 const {event,...team}=z.strictObject({...scope,event:nameSchema.optional()}).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  // An archived or unknown event is not a scope; the caller is told, not shown the whole team instead.
  const {rows:[found]}=event?await q.query<{id:string}>('select id from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null',[team.orgId,team.loopId,event]):{rows:[]};
  if(event&&!found)throw new EmbaError('not_found');
  const inEvent=found?' and r.event_id=$3':'',params=found?[found.id]:[];
  const claims=await list(q,p,team,openClaim+inEvent,'r.due_on asc nulls last,r.number',params);
  const outputs=await list(q,p,team,"r.kind='output'"+inEvent,'r.number desc',params);
  const decisions=await list(q,p,team,"r.kind='decision'",'r.number desc');
  const {rows:flags}=await q.query<ConflictFlag&{total:number}>(`select o.number as output,d.number as decision,case when d.state='withdrawn' then null else d.topic end as topic,c.state,count(*) over()::int as total from emba_team_conflict c
   join emba_team_record o on o.id=c.output_id and o.state='current' join emba_team_record d on d.id=c.decision_id
   where c.org_id=$1 and c.loop_id=$2${found?' and o.event_id=$3':''} order by o.number desc,d.number limit ${READ.list}`,[team.orgId,team.loopId,...params]);
  return {team:base.team,event:event??null,timezone:base.timezone,today:base.today,deadline:(await latestBrief(q,team))?.deadline??null,decisionsVersion:base.decisionSeq,
   // Past due is a fact about a date, in the team's own timezone. It says nothing about a person.
   claims:{...claims,items:claims.items.map(item=>({...item,pastDue:Boolean(item.dueOn&&item.dueOn<base.today)}))},outputs,decisions,
   conflicts:{items:flags.map(({output,decision,topic,state})=>({output,decision,topic,state})),more:Math.max(0,(flags[0]?.total??0)-flags.length)},untrusted:true as const};
 });
}

// The cursor is a position in the team's change sequence. It carries a short
// mark of the team so a cursor from one team is refused on another.
const mark=(team:Scope)=>createHash('sha256').update(`${team.orgId}/${team.loopId}`).digest('hex').slice(0,6);
const cursorOf=(team:Scope,seq:number)=>`n${mark(team)}-${seq.toString(36)}`;
const newsSchema=z.strictObject({...scope,cursor:z.string().regex(/^n[0-9a-f]{6}-[0-9a-z]{1,11}$/).optional(),since:day.optional()});
export async function whatsNew(db:Db,p:Principal,input:unknown):Promise<WhatsNew> {
 const {cursor,since,...team}=newsSchema.parse(input);
 if(cursor&&cursor.slice(1,7)!==mark(team))throw new EmbaError('not_found');
 return reading(db,p,team,async({q,...base})=>{
  // The sequence is assigned under the team's lock, so its order is the order of commit: nothing can appear behind a cursor.
  const after=cursor?parseInt(cursor.slice(8),36):0;
  const from=cursor?null:since?`$4::date::timestamp at time zone $5`:`clock_timestamp()-make_interval(days=>${READ.windowDays})`;
  const {rows}=await q.query<{seq:number;action:string;at:string;actorId:string|null;clientId:string|null;subjectId:string|null;otherId:string|null;recordId:string}>(`select c.seq::int as seq,c.action,c.at,c.actor_id as "actorId",c.client_id as "clientId",c.subject_id as "subjectId",c.other_id as "otherId",c.record_id as "recordId"
   from emba_team_change c where c.org_id=$1 and c.loop_id=$2 and c.seq>$3${from?` and c.at>=${from}`:''} order by c.seq limit ${READ.list+1}`,[team.orgId,team.loopId,after,...(!cursor&&since?[since,base.timezone]:[])]);
  const page=rows.slice(0,READ.list);
  const {rows:records}=await q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.id=any($1::uuid[])`,[[...new Set(page.flatMap(row=>[row.recordId,row.otherId]).filter(Boolean))]]);
  const views=await viewRecords(q,p,team,records),person=await viewPeople(q,p,team,page.flatMap(row=>[row.actorId,row.subjectId]));
  const view=(id:string|null)=>{const index=records.findIndex(row=>row.id===id);return index<0?null:views[index];};
  const changes=page.flatMap(row=>{
   const record=view(row.recordId);
   if(!record)return [];
   return [{cursor:cursorOf(team,row.seq),action:row.action,at:new Date(row.at).toISOString(),record,by:person(row.actorId),assistant:row.clientId,other:view(row.otherId)?.number??null,about:row.subjectId?person(row.subjectId):null,
    mentionsYou:row.subjectId===p.personId||record.tags.some(tag=>tag.isYou)}];
  });
  // With nothing to return, a first call starts the caller at the present.
  const last=page.at(-1)?.seq??(cursor?after:base.changeSeq);
  return {team:base.team,window:cursor?'cursor' as const:since?'since' as const:'last_7_days' as const,changes,cursor:cursorOf(team,last),more:rows.length>page.length,untrusted:true as const};
 });
}

/** The number of the current decision on a topic, so a decision can be named by its topic key. */
export async function currentDecisionNumber(db:Db,p:Principal,input:unknown):Promise<number|null> {
 const {topic,...team}=z.strictObject({...scope,topic:nameSchema}).parse(input);
 return reading(db,p,team,async({q})=>{
  const {rows:[row]}=await q.query<{number:number}>("select number from emba_team_record where org_id=$1 and loop_id=$2 and kind='decision' and state='current' and topic=$3",[team.orgId,team.loopId,topic]);
  return row?.number??null;
 });
}
/**
 * How many teams the person belongs to (0, 1, or 2 meaning "more than one"),
 * whatever an assistant has been granted. A write with no team named is only
 * safe when this is exactly one. Nothing about the teams is returned.
 */
export async function memberTeamCount(db:Db,p:Principal):Promise<number> {
 return db.tx(async q=>{
  if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
  const {rows:[row]}=await q.query<{n:number}>(`with recursive accessible as (
    select l.id,l.org_id from emba_loop l join emba_role r on r.org_id=l.org_id and r.loop_id=l.id join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
    where r.person_id=$1 and r.revoked_at is null and m.revoked_at is null
    union select l.id,l.org_id from emba_loop l join accessible a on l.org_id=a.org_id and l.parent_id=a.id)
   select count(*)::int as n from (select 1 from emba_group_address g join accessible a on a.org_id=g.org_id and a.id=g.loop_id where g.retired_at is null limit 2) x`,[p.personId]);
  return row.n;
 });
}

/** The caller's own recent records in a team that still have their text, newest first, for the "your recent saves" list on the site. */
export async function myRecentRecords(db:Db,p:Principal,input:unknown):Promise<RecordView[]> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q})=>{
  const {rows}=await q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.org_id=$1 and r.loop_id=$2 and r.author_id=$3 and r.state<>'withdrawn' order by r.number desc limit 20`,[team.orgId,team.loopId,p.personId]);
  return viewRecords(q,p,team,rows);
 });
}
