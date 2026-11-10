import 'server-only';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, authorize, requireFirstParty } from './consent';
import { EmbaError } from './errors';
import type { KnowledgePassage } from './knowledge';

const model=z.string().trim().min(1).max(120);
// pgvector stores float32: validate the stored representation too (overflow/underflow).
const vector=z.array(z.number().finite().refine(n=>Number.isFinite(Math.fround(n)))).min(1).max(2048).refine(v=>v.some(n=>Math.fround(n)!==0));
const batch=z.strictObject({documentId:z.uuid(),version:z.number().int().positive(),modelId:model,dimensions:z.number().int().min(1).max(2048),passages:z.array(z.strictObject({ordinal:z.number().int().min(0).max(199),vector})).min(1).max(200)})
 .refine(b=>b.passages.every(p=>p.vector.length===b.dimensions)&&new Set(b.passages.map(p=>p.ordinal)).size===b.passages.length);
type Source={orgId:string;loopId:string;version:number;state:string;uploadedBy:string};
async function source(q:Q,id:string,lock:false|'share'|'update'):Promise<Source> {
 const {rows:[row]}=await q.query<Source>(`select d.org_id as "orgId",d.loop_id as "loopId",v.version,v.state,v.uploaded_by as "uploadedBy" from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version where d.id=$1 and d.deleted_at is null ${lock?`for ${lock} of d,v`:''}`,[id]);
 if(!row) throw new EmbaError('not_found');return row;
}
// Trusted server-only ingestion of approved document passages. Model ID must include
// provider/model revision; callers cannot supply raw vectors through public routes.
export async function indexKnowledgeVectors(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=batch.parse(input);
 await db.tx(async q=>{
  await requireFirstParty(q,p);
  const initial=await source(q,data.documentId,false);
  if(!await canAccessLoop(q,p,initial.orgId,initial.loopId,'manage')) throw new EmbaError('forbidden');
  const row=await source(q,data.documentId,'update');
  if(row.orgId!==initial.orgId||row.loopId!==initial.loopId||row.uploadedBy!==p.personId) throw new EmbaError('forbidden');
  if(row.version!==data.version||row.state!=='ready') throw new EmbaError('conflict');
  await q.query('insert into emba_embedding_model(model_id,dimensions) values($1,$2) on conflict do nothing',[data.modelId,data.dimensions]);
  const {rows:[registered]}=await q.query<{dimensions:number}>('select dimensions from emba_embedding_model where model_id=$1',[data.modelId]);
  if(registered.dimensions!==data.dimensions) throw new EmbaError('conflict');
  for(const passage of data.passages) await q.query(`insert into emba_document_embedding(document_id,version,ordinal,model_id,dimensions,embedding) values($1,$2,$3,$4,$5,$6::vector) on conflict(document_id,version,ordinal,model_id) do update set embedding=excluded.embedding`,[data.documentId,data.version,passage.ordinal,data.modelId,data.dimensions,JSON.stringify(passage.vector)]);
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,row.orgId,row.loopId,'manage')) throw new EmbaError('forbidden');
  await audit(q,p,'knowledge:write',data.documentId);
 });
}
export async function searchKnowledgeVectors(db:Db,p:Principal,input:unknown):Promise<KnowledgePassage[]> {
 const data=z.object({orgId:z.uuid(),loopId:z.uuid(),modelId:model,vector,limit:z.number().int().min(1).max(20).default(10)}).parse(input);
 return db.tx(async q=>{
  const lease=await authorize(q,p,'plan:read',data);
  const {rows}=await q.query<Omit<KnowledgePassage,'sourceUrl'|'untrusted'>>(`
   with authorized as materialized (
    select p.*,v.title from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version
    join emba_document_passage p on p.document_id=d.id and p.version=v.version
    where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null and v.state='ready'
   ), candidates as materialized (
    select a.*,e.embedding from authorized a join emba_document_embedding e using(document_id,version,ordinal)
    where e.model_id=$3 and e.dimensions=$4
   ), matches as (
    select * from candidates order by embedding <=> $5::vector,document_id,ordinal limit $6
   ), expanded as (
    select a.* from authorized a where exists(select 1 from matches m where (m.document_id=a.document_id and m.ordinal=a.ordinal) or (m.claim_key is not null and m.claim_key=a.claim_key))
   )
   select a.document_id as "documentId",a.version,a.title,a.text,a.location,a.timezone,a.itinerary_version as "itineraryVersion",a.claim_key as "claimKey",a.claim_value as "claimValue",
    (a.claim_key is not null and exists(select 1 from authorized b where b.claim_key=a.claim_key and b.claim_value<>a.claim_value)) as disputed
   from expanded a order by a.document_id,a.ordinal limit 200`,[data.orgId,data.loopId,data.modelId,data.vector.length,JSON.stringify(data.vector),data.limit]);
  await audit(q,p,'plan:read',null,lease);
  await authorize(q,p,'plan:read',data);
  for(const row of rows) {
   const latest=await source(q,row.documentId,'share');
   if(latest.version!==row.version||latest.state!=='ready') throw new EmbaError('conflict');
   await authorize(q,p,'plan:read',latest);
  }
  return rows.map(row=>({...row,sourceUrl:`/api/emba/documents/${row.documentId}?version=${row.version}`,untrusted:true}));
 });
}
