import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,canAccessPersonal,type Principal} from './access';
import {audit,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {asksById,asksDue,closeDueAsks,openAskCounts,openAsks,type AskView,type Unanswered} from './team-asks';
import {reading,type Listed,type Scope,type TeamHead} from './team-core';
import {bare,viewEvents,type EventView} from './team-events';
import {rowColumns,rowFrom,viewPeople,viewRecords,type PersonView,type RecordView,type Row} from './team-records';
import {nameSchema,singleLine} from './team-text';

// What a team's records say now (design D8, D9). Every read is one snapshot:
// a write that commits while it runs is either wholly in the answer or not at all.

export const READ={list:30,announcements:5,briefLength:4000,windowDays:7,warnDays:5} as const;
const scope={orgId:z.uuid(),loopId:z.uuid()};
const day=z.string().regex(/^2[01]\d{2}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().startsWith(value);});

export type {Listed,TeamHead};
export type Brief={version:number;body:string;deadline:string|null;editedAt:string};
export type TeamBrief={team:TeamHead;timezone:string;today:string;brief:Brief|null;announcements:RecordView[];resources:Listed<string>;
 counts:{openClaims:number;currentOutputs:number;currentDecisions:number};
 /** How many asks are open, and how many of them the caller may answer and has not. */
 asks:{open:number;unanswered:number};grantExpiresOn:string|null;untrusted:true};
export type ConflictFlag={output:number;decision:number;topic:string|null;state:'flagged'|'recheck'};
export type TeamState={team:TeamHead;event:string|null;timezone:string;today:string;deadline:string|null;decisionsVersion:number;
 claims:Listed<RecordView&{pastDue:boolean}>;outputs:Listed<RecordView>;decisions:Listed<RecordView>;conflicts:Listed<ConflictFlag>;untrusted:true};
/** One entry of the change sequence. It concerns exactly one of: a record, an event, an ask. */
export type Change={cursor:string;action:string;at:string;record?:RecordView;event?:EventView;ask?:AskView;by:PersonView;assistant:string|null;other:number|null;about:PersonView|null;mentionsYou:boolean};
export type WhatsNew={team:TeamHead;window:'cursor'|'since'|'last_7_days';changes:Change[];cursor:string;more:boolean;
 /** The open asks the caller has yet to answer, soonest to close first. Not part of the change sequence: it is the same on every call until they answer. */
 unanswered:Listed<Unanswered>;untrusted:true};

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
  return {team:base.team,timezone:base.timezone,today:base.today,brief:await latestBrief(q,team),announcements:announcements.items,asks:await openAskCounts(q,p,team),
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
class Due extends Error {}
const newsSchema=z.strictObject({...scope,cursor:z.string().regex(/^n[0-9a-f]{6}-[0-9a-z]{1,11}$/).optional(),since:day.optional()});
export async function whatsNew(db:Db,p:Principal,input:unknown):Promise<WhatsNew> {
 const {cursor,since,...team}=newsSchema.parse(input);
 if(cursor&&cursor.slice(1,7)!==mark(team))throw new EmbaError('not_found');
 // An ask that passed its closing time is entered in the sequence as closed before the sequence is read. The caller's access is checked first.
 const read=(swept:boolean)=>reading(db,p,team,async({q,...base})=>{
  if(!swept&&await asksDue(q,team))throw new Due();
  // The sequence is assigned under the team's lock, so its order is the order of commit: nothing can appear behind a cursor.
  const after=cursor?parseInt(cursor.slice(8),36):0;
  const from=cursor?null:since?`$4::date::timestamp at time zone $5`:`clock_timestamp()-make_interval(days=>${READ.windowDays})`;
  const {rows}=await q.query<{seq:number;action:string;at:string;actorId:string|null;clientId:string|null;subjectId:string|null;otherId:string|null;recordId:string|null;eventId:string|null;askId:string|null}>(`select c.seq::int as seq,c.action,c.at,c.actor_id as "actorId",c.client_id as "clientId",c.subject_id as "subjectId",c.other_id as "otherId",c.record_id as "recordId",c.event_id as "eventId",c.ask_id as "askId"
   from emba_team_change c where c.org_id=$1 and c.loop_id=$2 and c.seq>$3${from?` and c.at>=${from}`:''} order by c.seq limit ${READ.list+1}`,[team.orgId,team.loopId,after,...(!cursor&&since?[since,base.timezone]:[])]);
  const page=rows.slice(0,READ.list);
  const {rows:records}=await q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.id=any($1::uuid[])`,[[...new Set(page.flatMap(row=>[row.recordId,row.otherId]).filter(Boolean))]]);
  const views=await viewRecords(q,p,team,records),person=await viewPeople(q,p,team,page.flatMap(row=>[row.actorId,row.subjectId]));
  const view=(id:string|null)=>{const index=records.findIndex(row=>row.id===id);return index<0?null:views[index];};
  // An event is shown as it stands now: its present date and place are what a reader needs.
  const events=await viewEvents(q,p,base.timezone,[...new Set(page.flatMap(row=>row.eventId??[]))]);
  const asks=await asksById(q,p,team,base.timezone,[...new Set(page.flatMap(row=>row.askId??[]))]);
  const changes=page.flatMap((row):Change[]=>{
   const entry={cursor:cursorOf(team,row.seq),action:row.action,at:new Date(row.at).toISOString(),by:person(row.actorId),assistant:row.clientId,other:null,about:null,mentionsYou:false};
   const event=events.find(item=>item.id===row.eventId);
   if(event)return [{...entry,event:bare(event)}];
   const asked=asks.find(item=>item.id===row.askId);
   if(asked){const {id:_id,...ask}=asked;void _id;return [{...entry,ask}];}
   const record=view(row.recordId);
   if(!record)return [];
   return [{...entry,record,other:view(row.otherId)?.number??null,about:row.subjectId?person(row.subjectId):null,mentionsYou:row.subjectId===p.personId||record.tags.some(tag=>tag.isYou)}];
  });
  // With nothing to return, a first call starts the caller at the present.
  const last=page.at(-1)?.seq??(cursor?after:base.changeSeq);
  return {team:base.team,window:cursor?'cursor' as const:since?'since' as const:'last_7_days' as const,changes,cursor:cursorOf(team,last),more:rows.length>page.length,
   unanswered:(await openAsks(q,p,team,base.timezone)).unanswered,untrusted:true as const};
 });
 try{return await read(false);}
 catch(error){
  if(!(error instanceof Due))throw error;
  await closeDueAsks(db,team);
  return read(true);
 }
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
