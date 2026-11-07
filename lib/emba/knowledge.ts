import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, authorize, requireFirstParty } from './consent';
import { EmbaError } from './errors';

const scopeSchema = z.object({orgId:z.uuid(),loopId:z.uuid()});
const passageSchema = z.strictObject({text:z.string().trim().min(1).max(4000),claimKey:z.string().trim().min(1).max(120).optional(),claimValue:z.string().trim().min(1).max(500).optional()})
  .refine(p => Boolean(p.claimKey) === Boolean(p.claimValue));
const itinerarySchema = z.strictObject({itineraryVersion:z.string().min(1).max(120),timezone:z.string().min(1).max(100).refine(value=>{try {new Intl.DateTimeFormat('en',{timeZone:value});return true;} catch{return false;}}),passages:z.array(passageSchema).min(1).max(200)});
const uploadSchema = z.strictObject({operationId:z.uuid(),orgId:z.uuid(),loopId:z.uuid(),documentId:z.uuid().optional(),expectedVersion:z.number().int().positive().optional(),title:z.string().trim().min(1).max(200),mediaType:z.enum(['text/plain','application/json']),body:z.string().min(1).max(262144).refine(s=>Buffer.byteLength(s,'utf8')<=262144 && !s.includes('\0'))})
  .refine(s=>Boolean(s.documentId)===Boolean(s.expectedVersion));
type Scope = z.infer<typeof scopeSchema>;
type Extracted = {text:string;location:string;timezone:string|null;itineraryVersion:string|null;claimKey:string|null;claimValue:string|null};
type DocumentRow = {id:string;orgId:string;loopId:string;version:number;title:string;mediaType:'text/plain'|'application/json';body:string;state:'accepted'|'extracting'|'indexing'|'ready'|'failed';failedStage:string|null;uploadedBy:string|null;extracted:Extracted[]|null};
export type KnowledgePassage = Extracted & {documentId:string;version:number;title:string;sourceUrl:string;untrusted:true;disputed:boolean};
const columns = `d.id,d.org_id as "orgId",d.loop_id as "loopId",v.version,v.title,v.media_type as "mediaType",v.body,v.state,v.failed_stage as "failedStage",v.uploaded_by as "uploadedBy",v.extracted`;

// This is a deterministic parser, not a model/compiler. No URL or embedded instruction is executed.
function extract(mediaType:string,body:string): Extracted[] {
  if (mediaType==='application/json') {
    const data=itinerarySchema.parse(JSON.parse(body));
    return data.passages.map((p,i)=>({text:p.text,location:`/passages/${i}`,timezone:data.timezone,itineraryVersion:data.itineraryVersion,claimKey:p.claimKey??null,claimValue:p.claimValue??null}));
  }
  const lines=body.split(/\r?\n/);
  const passages:Extracted[]=[];
  for (const [i,line] of lines.entries()) {
    for (let offset=0;offset<line.length;offset+=4000) {
      const text=line.slice(offset,offset+4000).trim();
      if(text) passages.push({text,location:`line:${i+1}${offset ? `:offset:${offset}` : ''}`,timezone:null,itineraryVersion:null,claimKey:null,claimValue:null});
    }
  }
  z.array(z.unknown()).min(1).max(200).parse(passages);
  return passages;
}
async function manage(q:Q,p:Principal,scope:Scope) {
  await requireFirstParty(q,p);
  if (!await canAccessLoop(q,p,scope.orgId,scope.loopId,'manage')) throw new EmbaError('forbidden');
}
async function current(q:Q,id:string,version?:number,lock:false|'share'|'update'=false):Promise<DocumentRow> {
  const {rows:[row]}=await q.query<DocumentRow>(`select ${columns} from emba_document d join emba_document_version v on v.document_id=d.id and v.version=coalesce($2::integer,d.current_version) where d.id=$1 and d.deleted_at is null ${lock?`for ${lock} of d,v`:''}`,[id,version??null]);
  if(!row) throw new EmbaError('not_found');
  return row;
}
export async function uploadDocument(db:Db,p:Principal,input:unknown):Promise<{id:string;version:number}> {
  const data=uploadSchema.parse(input);
  extract(data.mediaType,data.body); // Reject malformed or unsupported source content before persistence.
  const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return db.tx(async q=>{
    await manage(q,p,data);
    await q.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${p.personId}:${data.operationId}`]);
    const {rows:[prior]}=await q.query<{id:string;version:number;hash:string}>('select document_id as id,version,request_hash as hash from emba_document_operation where person_id=$1 and operation_id=$2',[p.personId,data.operationId]);
    if(prior) {if(prior.hash!==hash) throw new EmbaError('conflict'); const row=await current(q,prior.id); await manage(q,p,row); return {id:prior.id,version:prior.version};}
    let id=data.documentId,version=1;
    if(id) {
      const row=await current(q,id,undefined,'update');
      if(row.orgId!==data.orgId || row.loopId!==data.loopId) throw new EmbaError('forbidden');
      if(row.version!==data.expectedVersion) throw new EmbaError('conflict');
      version=row.version+1;
      await q.query('update emba_document set current_version=$2 where id=$1',[id,version]);
      await q.query('delete from emba_document_passage where document_id=$1',[id]);
    } else {
      const {rows:[doc]}=await q.query<{id:string}>('insert into emba_document(org_id,loop_id,current_version) values ($1,$2,1) returning id',[data.orgId,data.loopId]);
      id=doc.id;
    }
    await q.query('insert into emba_document_version(document_id,version,title,media_type,body,uploaded_by) values ($1,$2,$3,$4,$5,$6)',[id,version,data.title,data.mediaType,data.body,p.personId]);
    await q.query('insert into emba_document_operation(person_id,operation_id,request_hash,document_id,version) values ($1,$2,$3,$4,$5)',[p.personId,data.operationId,hash,id,version]);
    await audit(q,p,'knowledge:write',id);
    return {id,version};
  });
}

// Durable job identity is (document_id,version). Stages commit separately so an
// indexing failure retains canonical extraction; retries replace the same index.
// The trusted caller supplies the original uploader's current principal.
export async function processDocument(db:Db,p:Principal,id:string,version:number):Promise<void> {
  z.uuid().parse(id); z.number().int().positive().parse(version);
  const guard=async(q:Q)=>{
    await manage(q,p,await current(q,id));
    const row=await current(q,id,undefined,'update');
    if(row.version!==version) throw new EmbaError('conflict');
    if(row.uploadedBy!==p.personId) throw new EmbaError('forbidden');
    return row;
  };
  const row=await db.tx(async q=>{
    const row=await guard(q);
    if(row.state!=='ready') await q.query("update emba_document_version set state=$3,failed_stage=null,attempts=attempts+1 where document_id=$1 and version=$2",[id,version,row.extracted?'indexing':'extracting']);
    return row;
  });
  if(row.state==='ready') return;
  let stage='extracting';
  try {
    const passages=row.extracted??extract(row.mediaType,row.body);
    await db.tx(async q=>{await guard(q);await q.query("update emba_document_version set extracted=$3::jsonb,state='indexing' where document_id=$1 and version=$2",[id,version,JSON.stringify(passages)]);});
    stage='indexing';
    await db.tx(async q=>{
      await guard(q);
      await q.query('delete from emba_document_passage where document_id=$1 and version=$2',[id,version]);
      for(const [i,passage] of passages.entries()) await q.query('insert into emba_document_passage(document_id,version,ordinal,text,location,timezone,itinerary_version,claim_key,claim_value) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,version,i,passage.text,passage.location,passage.timezone,passage.itineraryVersion,passage.claimKey,passage.claimValue]);
      await guard(q);
      await q.query("update emba_document_version set state='ready',failed_stage=null where document_id=$1 and version=$2",[id,version]);
      await audit(q,p,'knowledge:write',id);
    });
  } catch(error) {
    try {
      await db.tx(async q=>{
        await guard(q);
        await q.query("update emba_document_version set state='failed',failed_stage=$3 where document_id=$1 and version=$2 and state<>'ready'",[id,version,stage]);
      });
    } catch {
      // Revoked or obsolete workers cannot record status either. Preserve the
      // original processing error if the best-effort failure marker is denied.
    }
    throw error;
  }
}
export async function readDocument(db:Db,p:Principal,id:string,version?:number) {
  z.uuid().parse(id); if(version!==undefined) z.number().int().positive().parse(version);
  return db.tx(async q=>{
    const row=await current(q,id,version);
    const lease=await authorize(q,p,'plan:read',row);
    await audit(q,p,'plan:read',id,lease);
    await authorize(q,p,'plan:read',row);
    // Hold both source identity and version through transaction completion:
    // changes after this check cannot race another citation's output check.
    const latest=await current(q,id,version,'share');
    if(latest.version!==row.version) throw new EmbaError('conflict');
    return {id:latest.id,orgId:latest.orgId,loopId:latest.loopId,version:latest.version,title:latest.title,mediaType:latest.mediaType,body:latest.body,state:latest.state,failedStage:latest.failedStage,untrusted:true as const};
  });
}
export async function listDocuments(db:Db,p:Principal,input:unknown) {
  const scope=scopeSchema.parse(input);
  return db.tx(async q=>{
    const lease=await authorize(q,p,'plan:read',scope);
    const {rows}=await q.query<{id:string;version:number;title:string;state:DocumentRow['state'];failedStage:string|null}>(`select d.id,v.version,v.title,v.state,v.failed_stage as "failedStage" from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null order by v.created_at desc,d.id limit 100`,[scope.orgId,scope.loopId]);
    await audit(q,p,'plan:read',null,lease);
    await authorize(q,p,'plan:read',scope);
    for(const row of rows) {
      const latest=await current(q,row.id,undefined,'share');
      if(latest.version!==row.version) throw new EmbaError('conflict');
      row.state=latest.state;
      row.failedStage=latest.failedStage;
    }
    return rows;
  });
}
export async function deleteDocument(db:Db,p:Principal,id:string,expectedVersion:number) {
  z.uuid().parse(id); z.number().int().positive().parse(expectedVersion);
  await db.tx(async q=>{
    await manage(q,p,await current(q,id));
    const row=await current(q,id,undefined,'update');
    if(row.version!==expectedVersion) throw new EmbaError('conflict');
    await q.query('update emba_document set deleted_at=now() where id=$1',[id]);
    await q.query('delete from emba_document_passage where document_id=$1',[id]);
    await audit(q,p,'knowledge:write',id);
  });
}
export async function searchKnowledge(db:Db,p:Principal,input:unknown):Promise<KnowledgePassage[]> {
  const data=scopeSchema.extend({query:z.string().trim().min(1).max(500),limit:z.number().int().min(1).max(20).default(10)}).parse(input);
  return db.tx(async q=>{
    const lease=await authorize(q,p,'plan:read',data);
    // Materialize exactly the authorized context before ranking. There are no
    // private subtree overrides: every document inherits its loop permissions.
    // Expand matched claim keys before output to avoid hiding contradictions.
    const {rows}=await q.query<Extracted & {documentId:string;version:number;title:string;disputed:boolean}>(`
      with authorized as materialized (
        select p.*,v.title from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version
        join emba_document_passage p on p.document_id=d.id and p.version=v.version
        where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null and v.state='ready'
      ), matches as (
        select * from authorized where search @@ plainto_tsquery('simple',$3)
        order by ts_rank(search,plainto_tsquery('simple',$3)) desc,document_id,ordinal limit $4
      ), expanded as (
        select a.* from authorized a where exists(select 1 from matches m where (m.document_id=a.document_id and m.ordinal=a.ordinal) or (m.claim_key is not null and m.claim_key=a.claim_key))
      )
      select a.document_id as "documentId",a.version,a.title,a.text,a.location,a.timezone,a.itinerary_version as "itineraryVersion",a.claim_key as "claimKey",a.claim_value as "claimValue",
      (a.claim_key is not null and exists(select 1 from authorized b where b.claim_key=a.claim_key and b.claim_value<>a.claim_value)) as disputed
      from expanded a order by a.document_id,a.ordinal limit 200`,[data.orgId,data.loopId,data.query,data.limit]);
    await audit(q,p,'plan:read',null,lease);
    await authorize(q,p,'plan:read',data);
    // Current source version/status is checked again after retrieval, as well as authority.
    for(const row of rows) {
      const latest=await current(q,row.documentId,undefined,'share');
      if(latest.version!==row.version || latest.state!=='ready') throw new EmbaError('conflict');
      await authorize(q,p,'plan:read',latest);
    }
    return rows.map(row=>({...row,sourceUrl:`/api/emba/documents/${row.documentId}?version=${row.version}`,untrusted:true}));
  });
}
