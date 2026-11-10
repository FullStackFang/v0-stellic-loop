import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';

export const feedbackSchema=z.strictObject({
 operationId:z.uuid(),activityId:z.uuid(),expectedVersion:z.number().int().min(0),
 attendance:z.enum(['attended','not_attended','unspecified']),assessment:z.number().min(0).max(1).nullable(),
 memoryId:z.uuid().optional(),expectedMemoryVersion:z.number().int().positive().optional(),
}).refine(v=>v.assessment===null ? !v.memoryId && !v.expectedMemoryVersion : !!v.memoryId && !!v.expectedMemoryVersion);

async function lockOwner(q:Q,p:Principal) {
 await q.query('select id from person where id=$1 for update',[p.personId]);
 await requireFirstParty(q,p);
}
async function memory(q:Q,p:Principal,id:string,checkScope=true) {
 const {rows:[row]}=await q.query<{current_version:number;kind:string;org_id:string|null;loop_id:string|null}>(
  'select current_version,kind,org_id,loop_id from emba_memory where person_id=$1 and id=$2 for update',[p.personId,id]);
 if(!row) throw new EmbaError('not_found');
 if(checkScope)await authorize(q,p,'memory:write',{orgId:row.org_id,loopId:row.loop_id});
 if(row.kind!=='want') throw new EmbaError('conflict');
 return row;
}
async function baseline(q:Q,p:Principal,id:string) {
 const {rows:[row]}=await q.query<{version:number}>(
  'select max(version)::int version from emba_memory_operation where person_id=$1 and memory_id=$2',[p.personId,id]);
 if(!row?.version) throw new EmbaError('conflict');
 return row.version;
}
// Each current assessment contributes once, alongside the last explicit member
// value. A later explicit correction starts a new basis; stale evidence cannot
// undo it. Attendance alone never contributes to this calculation.
async function recompute(q:Q,p:Principal,id:string,checkScope=true) {
 const current=await memory(q,p,id,checkScope),basis=await baseline(q,p,id);
 const {rows:[aggregate]}=await q.query<{observations:number;total:number}>(
  'select count(*)::int observations,coalesce(sum(assessment),0)::float8 total from emba_feedback where person_id=$1 and memory_id=$2 and basis_version=$3',
  [p.personId,id,basis]);
 await q.query(`insert into emba_memory_version(person_id,memory_id,version,text,category,place,strength,confidence,evidence_count,status,starts_at,ends_at)
  select v.person_id,v.memory_id,$3,v.text,v.category,v.place,(b.strength+$4)/(1+$5),v.confidence,1+$5,v.status,v.starts_at,v.ends_at
  from emba_memory_version v join emba_memory_version b on b.person_id=v.person_id and b.memory_id=v.memory_id and b.version=$6
  where v.person_id=$1 and v.memory_id=$2 and v.version=$7`,
  [p.personId,id,current.current_version+1,aggregate.total,aggregate.observations,basis,current.current_version]);
 await q.query("update emba_memory_version set status='superseded' where person_id=$1 and memory_id=$2 and version=$3",[p.personId,id,current.current_version]);
 await q.query('update emba_memory set current_version=current_version+1 where person_id=$1 and id=$2',[p.personId,id]);
}

export async function saveFeedback(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=feedbackSchema.parse(input),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 await db.tx(async q=>{
  await lockOwner(q,p);
  const {rows:[activity]}=await q.query<{org_id:string;loop_id:string}>('select org_id,loop_id from emba_activity where id=$1',[data.activityId]);
  if(!activity || !await canAccessLoop(q,p,activity.org_id,activity.loop_id,'read')) throw new EmbaError('forbidden');
  const {rows:[op]}=await q.query<{request_hash:string}>('select request_hash from emba_feedback_operation where person_id=$1 and operation_id=$2',[p.personId,data.operationId]);
  if(op) { if(op.request_hash!==hash) throw new EmbaError('conflict'); return; }
  const {rows:[previous]}=await q.query<{version:number;memory_id:string|null}>('select version,memory_id from emba_feedback where person_id=$1 and activity_id=$2',[p.personId,data.activityId]);
  if((previous?.version??0)!==data.expectedVersion) throw new EmbaError('conflict');
  let basis:number|null=null;
  if(data.memoryId) {
   const row=await memory(q,p,data.memoryId);
   if(row.current_version!==data.expectedMemoryVersion) throw new EmbaError('conflict');
   basis=await baseline(q,p,data.memoryId);
  }
  await q.query(`insert into emba_feedback(person_id,activity_id,version,attendance,assessment,memory_id,basis_version) values($1,$2,$3,$4,$5,$6,$7)
   on conflict(person_id,activity_id) do update set version=excluded.version,attendance=excluded.attendance,assessment=excluded.assessment,memory_id=excluded.memory_id,basis_version=excluded.basis_version,updated_at=clock_timestamp()`,
   [p.personId,data.activityId,data.expectedVersion+1,data.attendance,data.assessment,data.memoryId??null,basis]);
  for(const id of new Set([previous?.memory_id,data.memoryId].filter((id):id is string=>!!id))) await recompute(q,p,id,id===data.memoryId);
  await q.query('insert into emba_feedback_operation(person_id,operation_id,request_hash) values($1,$2,$3)',[p.personId,data.operationId,hash]);
  await audit(q,p,'memory:write',data.memoryId??null);
 });
}
export async function deleteFeedback(db:Db,p:Principal,activityId:string,expectedVersion:number):Promise<void> {
 z.uuid().parse(activityId); z.number().int().positive().parse(expectedVersion);
 await db.tx(async q=>{
  await lockOwner(q,p);
  const {rows:[previous]}=await q.query<{memory_id:string|null}>('delete from emba_feedback where person_id=$1 and activity_id=$2 and version=$3 returning memory_id',[p.personId,activityId,expectedVersion]);
  if(!previous) throw new EmbaError('conflict');
  if(previous.memory_id) await recompute(q,p,previous.memory_id,false);
  await audit(q,p,'memory:write',previous.memory_id);
 });
}
export async function listFeedback(db:Db,p:Principal) {
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  const {rows}=await q.query('select activity_id,version,attendance,assessment,memory_id,basis_version from emba_feedback where person_id=$1 order by updated_at desc limit 100',[p.personId]);
  await audit(q,p,'memory:read');
  return rows;
 });
}
