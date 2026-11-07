import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {authorize,audit,requireFirstParty} from './consent';
import {EmbaError} from './errors';

const scope={orgId:z.uuid(),loopId:z.uuid()};
const common={...scope,operationId:z.uuid(),recordId:z.uuid()};
const text=z.string().trim().min(1).max(2000).refine(value=>!value.includes('\0'));
export const groupNoteSchema=z.discriminatedUnion('mutation',[
 z.strictObject({...common,mutation:z.literal('publish'),expectedVersion:z.literal(1),text}),
 z.strictObject({...common,mutation:z.literal('correct'),expectedVersion:z.number().int().positive(),text}),
 z.strictObject({...common,mutation:z.literal('withdraw'),expectedVersion:z.number().int().positive()}),
]).refine(data=>Buffer.byteLength(JSON.stringify(data),'utf8')<=8192);
export type GroupNoteMutation=z.infer<typeof groupNoteSchema>;
export type GroupNoteReceipt={operationId:string;recordId:string;version:number;status:'active'|'withdrawn'};
export type GroupMemoryItem={id:string;orgId:string;loopId:string;version:number;kind:'note';provenance:'member_submission';status:'active';text:string;authorId:string|null;publishedAt:string};
type RecordRow={id:string;orgId:string;loopId:string;version:number;authorId:string|null;status:'active'|'withdrawn'};
const recordColumns='id,org_id as "orgId",loop_id as "loopId",current_version as version,author_id as "authorId",status';
const itemColumns=`m.id,m.org_id as "orgId",m.loop_id as "loopId",v.version,m.kind,m.provenance,m.status,v.text,m.author_id as "authorId",v.created_at as "publishedAt"`;

async function writeAuthority(q:Q,p:Principal,data:{orgId:string;loopId:string}) {
 // Consistent with personal deletion and confirmation consumption lock ordering.
 await q.query('select id from person where id=$1 for update',[p.personId]);
 const lease=await authorize(q,p,'group-memory:write',data);
 if(!await canAccessLoop(q,p,data.orgId,data.loopId,'post'))throw new EmbaError('forbidden');
 return lease;
}
async function record(q:Q,data:{orgId:string;loopId:string;recordId:string}) {
 const {rows:[row]}=await q.query<RecordRow>(`select ${recordColumns} from emba_group_memory where id=$1 and org_id=$2 and loop_id=$3 for update`,[data.recordId,data.orgId,data.loopId]);
 return row;
}
async function authorOrManager(q:Q,p:Principal,row:RecordRow) {
 if(row.authorId!==p.personId&&!await canAccessLoop(q,p,row.orgId,row.loopId,'manage'))throw new EmbaError('forbidden');
}
function hash(data:GroupNoteMutation) {return createHash('sha256').update(JSON.stringify(data)).digest('hex');}

/** Validates a bounded note only; it publishes nothing and accepts no provenance claims. */
export async function validateGroupNote(q:Q,p:Principal,input:unknown):Promise<GroupNoteMutation> {
 const data=groupNoteSchema.parse(input);await writeAuthority(q,p,data);
 const row=await record(q,data);
 if(data.mutation==='publish') {if(row)throw new EmbaError('conflict');}
 else {
  if(!row)throw new EmbaError('not_found');await authorOrManager(q,p,row);
  if(row.status!=='active'||row.version!==data.expectedVersion)throw new EmbaError('conflict');
 }
 return data;
}
/** Retry receipt contains no old text. Current lease, role and client binding still apply. */
export async function readGroupNoteReceipt(q:Q,p:Principal,input:unknown):Promise<GroupNoteReceipt|null> {
 const data=groupNoteSchema.parse(input),lease=await writeAuthority(q,p,data);
 const {rows:[prior]}=await q.query<{requestHash:string;clientId:string|null;recordId:string;version:number}>(`select request_hash as "requestHash",client_id as "clientId",record_id as "recordId",version from emba_group_memory_operation where person_id=$1 and operation_id=$2`,[p.personId,data.operationId]);
 if(!prior)return null;
 if(prior.requestHash!==hash(data)||prior.clientId!==p.clientId)throw new EmbaError('conflict');
 const row=await record(q,data);if(!row)throw new EmbaError('not_found');await authorOrManager(q,p,row);
 await audit(q,p,'memory:write',row.id,lease);
 return {operationId:data.operationId,recordId:prior.recordId,version:prior.version,status:row.status};
}
async function apply(q:Q,p:Principal,input:unknown):Promise<GroupNoteReceipt> {
 const prior=await readGroupNoteReceipt(q,p,input);if(prior)return prior;
 const data=await validateGroupNote(q,p,input);
 const version=data.mutation==='publish'?1:data.expectedVersion+1,status=data.mutation==='withdraw'?'withdrawn':'active';
 if(data.mutation==='publish')await q.query('insert into emba_group_memory(id,org_id,loop_id,author_id,current_version) values($1,$2,$3,$4,1)',[data.recordId,data.orgId,data.loopId,p.personId]);
 else await q.query('update emba_group_memory set current_version=$2,status=$3 where id=$1',[data.recordId,version,status]);
 await q.query('insert into emba_group_memory_version(record_id,version,text,status,edited_by) values($1,$2,$3,$4,$5)',[data.recordId,version,data.mutation==='withdraw'?null:data.text,status,p.personId]);
 await q.query('insert into emba_group_memory_operation(person_id,operation_id,client_id,request_hash,record_id,version) values($1,$2,$3,$4,$5,$6)',[p.personId,data.operationId,p.clientId,hash(data),data.recordId,version]);
 const lease=await writeAuthority(q,p,data);await audit(q,p,'memory:write',data.recordId,lease);
 return {operationId:data.operationId,recordId:data.recordId,version,status};
}
/** Trusted transaction callback ONLY: invoke inside consumeConfirmation after exact payload binding.
 * This helper verifies current delegated scope/lease and role; it does not consume approval itself.
 */
export async function applyConfirmedGroupNote(q:Q,p:Principal,input:unknown):Promise<GroupNoteReceipt> {
 if(p.clientId===null)throw new EmbaError('forbidden');return apply(q,p,input);
}
const publishSchema=z.strictObject({...scope,operationId:z.uuid(),recordId:z.uuid().optional(),expectedVersion:z.number().int().positive().optional(),text})
 .refine(data=>Boolean(data.recordId)===Boolean(data.expectedVersion));
export async function publishGroupNote(db:Db,p:Principal,input:unknown):Promise<GroupNoteReceipt> {
 const data=publishSchema.parse(input);
 const mutation={...data,recordId:data.recordId??data.operationId,expectedVersion:data.expectedVersion??1,mutation:data.recordId?'correct':'publish'};
 return db.tx(async q=>{await q.query('select id from person where id=$1 for update',[p.personId]);await requireFirstParty(q,p);return apply(q,p,mutation);});
}
export async function withdrawGroupNote(db:Db,p:Principal,input:unknown):Promise<GroupNoteReceipt> {
 const data=z.strictObject({...common,expectedVersion:z.number().int().positive()}).parse(input);
 return db.tx(async q=>{await q.query('select id from person where id=$1 for update',[p.personId]);await requireFirstParty(q,p);return apply(q,p,{...data,mutation:'withdraw'});});
}
export async function readGroupMemory(db:Db,p:Principal,input:unknown):Promise<GroupMemoryItem> {
 const data=z.strictObject({...scope,recordId:z.uuid()}).parse(input);
 return db.tx(async q=>{
  const lease=await authorize(q,p,'plan:read',data);
  const {rows:[row]}=await q.query<GroupMemoryItem>(`select ${itemColumns} from emba_group_memory m join emba_group_memory_version v on v.record_id=m.id and v.version=m.current_version where m.org_id=$1 and m.loop_id=$2 and m.id=$3 and m.status='active' for share of m,v`,[data.orgId,data.loopId,data.recordId]);
  if(!row)throw new EmbaError('not_found');
  await authorize(q,p,'plan:read',data);await audit(q,p,'plan:read',data.recordId,lease);return row;
 });
}
export async function searchGroupMemory(db:Db,p:Principal,input:unknown):Promise<{items:GroupMemoryItem[];truncated:boolean}> {
 const data=z.strictObject({...scope,query:z.string().trim().min(1).max(500).optional(),limit:z.number().int().min(1).max(20).default(20)}).parse(input);
 return db.tx(async q=>{
  const lease=await authorize(q,p,'plan:read',data);
  const {rows}=await q.query<GroupMemoryItem>(`select ${itemColumns} from emba_group_memory m join emba_group_memory_version v on v.record_id=m.id and v.version=m.current_version where m.org_id=$1 and m.loop_id=$2 and m.status='active' and ($3::text is null or position(lower($3) in lower(v.text))>0) order by v.created_at desc,m.id limit $4 for share of m,v`,[data.orgId,data.loopId,data.query??null,data.limit+1]);
  const items:GroupMemoryItem[]=[];let bytes=64;
  for(const row of rows.slice(0,data.limit)) {const size=Buffer.byteLength(JSON.stringify(row),'utf8')+1;if(bytes+size>32768)break;items.push(row);bytes+=size;}
  await authorize(q,p,'plan:read',data);await audit(q,p,'plan:read',null,lease);
  return {items,truncated:items.length<rows.length};
 });
}
