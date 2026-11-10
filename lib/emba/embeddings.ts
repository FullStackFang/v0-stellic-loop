import 'server-only';
import { embedMany } from 'ai';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, authorize, requireFirstParty } from './consent';
import { EmbaError } from './errors';
import { indexKnowledgeVectors, searchKnowledgeVectors } from './knowledge-vector';

export const EMBEDDING_MODEL_ID='openai/text-embedding-3-small';
export const EMBEDDING_DIMENSIONS=1536;
export function embeddingsEnabled():boolean {return process.env.LOOP_EMBEDDINGS_ENABLED==='true';}
function requireEnabled() {if(!embeddingsEnabled()) throw new EmbaError('unavailable');}
const textsSchema=z.array(z.string().trim().min(1).max(4000).refine(s=>!s.includes('\0'))).min(1).max(200);
const vectorsSchema=z.array(z.array(z.number().finite().refine(n=>Number.isFinite(Math.fround(n)))).length(EMBEDDING_DIMENSIONS).refine(v=>v.some(n=>Math.fround(n)!==0)));
export type EmbedTexts=(texts:string[])=>Promise<number[][]>;
function validateVectors(value:unknown,count:number):number[][] {
 const result=vectorsSchema.safeParse(value);
 if(!result.success||result.data.length!==count) throw new EmbaError('unavailable');
 return result.data;
}
// This trusted adapter is for approved source documents and queries, never raw
// conversation compilation. Gateway ZDR remains subject to provider safety terms.
export const embedTexts:EmbedTexts=async texts=>{
 requireEnabled();
 const values=textsSchema.parse(texts);
 const embeddings:number[][]=[];
 const abortSignal=AbortSignal.timeout(15000);
 try {
  // Bound each provider request independently of the SDK's larger batch limit.
  for(let offset=0;offset<values.length;offset+=16) {
   const batch=values.slice(offset,offset+16);
   const result=await embedMany({model:EMBEDDING_MODEL_ID,dimensions:EMBEDDING_DIMENSIONS,values:batch,maxRetries:0,maxParallelCalls:1,abortSignal,providerOptions:{gateway:{zeroDataRetention:true}},telemetry:{isEnabled:false,recordInputs:false,recordOutputs:false}});
   embeddings.push(...validateVectors(result.embeddings,batch.length));
  }
  return embeddings;
 } catch {throw new EmbaError('unavailable');}
};

// Check optional schema before transmitting content or claiming embedding work.
export async function requireEmbeddingSchema(q:Q):Promise<void> {
 const {rows:[row]}=await q.query<{ready:boolean}>("select to_regclass('public.emba_document_embedding') is not null and to_regclass('public.emba_embedding_model') is not null as ready");
 if(!row?.ready) throw new EmbaError('unavailable');
}
export async function indexDocumentEmbeddings(db:Db,p:Principal,input:unknown,embed:EmbedTexts=embedTexts):Promise<void> {
 requireEnabled();
 const data=z.strictObject({documentId:z.uuid(),version:z.number().int().positive()}).parse(input);
 const passages=await db.tx(async q=>{
  await requireFirstParty(q,p);
  const {rows:[row]}=await q.query<{orgId:string;loopId:string;version:number;state:string;uploadedBy:string}>(`select d.org_id as "orgId",d.loop_id as "loopId",v.version,v.state,v.uploaded_by as "uploadedBy" from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version where d.id=$1 and d.deleted_at is null`,[data.documentId]);
  if(!row) throw new EmbaError('not_found');
  if(row.uploadedBy!==p.personId||!await canAccessLoop(q,p,row.orgId,row.loopId,'manage')) throw new EmbaError('forbidden');
  // Authority locks precede source locks, matching deletion and indexing order.
  const {rows:[current]}=await q.query<{version:number;state:string}>(`select v.version,v.state from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version where d.id=$1 and d.deleted_at is null for share of d,v`,[data.documentId]);
  if(!current||current.version!==data.version||current.state!=='ready') throw new EmbaError('conflict');
  await requireEmbeddingSchema(q);
  await audit(q,p,'knowledge:embed-document',data.documentId);
  return (await q.query<{ordinal:number;text:string}>('select ordinal,text from emba_document_passage where document_id=$1 and version=$2 order by ordinal',[data.documentId,data.version])).rows;
 });
 const values=textsSchema.parse(passages.map(p=>p.text));
 const vectors=validateVectors(await embed(values),values.length);
 await indexKnowledgeVectors(db,p,{...data,modelId:EMBEDDING_MODEL_ID,dimensions:EMBEDDING_DIMENSIONS,passages:passages.map((passage,i)=>({ordinal:passage.ordinal,vector:vectors[i]}))});
}
export async function searchKnowledgeSemantic(db:Db,p:Principal,input:unknown,embed:EmbedTexts=embedTexts) {
 requireEnabled();
 const data=z.strictObject({orgId:z.uuid(),loopId:z.uuid(),query:z.string().trim().min(1).max(4000),limit:z.number().int().min(1).max(20).default(10)}).parse(input);
 await db.tx(async q=>{const lease=await authorize(q,p,'plan:read',data);await requireEmbeddingSchema(q);await audit(q,p,'knowledge:embed-query',null,lease);});
 const values=textsSchema.parse([data.query]);
 const [vector]=validateVectors(await embed(values),1);
 return searchKnowledgeVectors(db,p,{orgId:data.orgId,loopId:data.loopId,limit:data.limit,modelId:EMBEDDING_MODEL_ID,vector});
}
