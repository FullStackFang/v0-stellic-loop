import 'server-only';
import type {Db} from '../db';
import {authenticate} from './access';
import {processDocument} from './knowledge';
import {embeddingsEnabled,requireEmbeddingSchema,EMBEDDING_MODEL_ID,EMBEDDING_DIMENSIONS,indexDocumentEmbeddings} from './embeddings';

type Job={documentId:string;version:number;uploadedBy:string|null;attempt:number};
/** Trusted scheduled work only. There is deliberately no request-supplied principal. */
export async function runDocumentBatch(db:Db) {
  const semantic=embeddingsEnabled();
  if(semantic)await requireEmbeddingSchema(db);
  const pending=semantic?`(v.state<>'ready' or exists (
    select 1 from emba_document_passage p where p.document_id=v.document_id and p.version=v.version
      and not exists(select 1 from emba_document_embedding e where e.document_id=p.document_id
        and e.version=p.version and e.ordinal=p.ordinal and e.model_id=$1 and e.dimensions=$2)))`:"v.state<>'ready'";
  const result={claimed:0,ready:0,failed:0};
  const deadline=Date.now()+45_000;
  for(let count=0;count<10&&Date.now()<deadline;count++) {
    // Commit the short claim before acquiring any person/role/source locks.
    // Session locks would be unsafe through a transaction-pooling database URL.
    const job=await db.tx(async q=>{
      const {rows:[row]}=await q.query<Job>(`with candidate as (
        select v.document_id,v.version from emba_document_version v
        join emba_document d on d.id=v.document_id and d.current_version=v.version
        where d.deleted_at is null and ${pending} and v.worker_attempts<5
          and v.next_worker_at<=clock_timestamp()
        order by v.next_worker_at,v.document_id,v.version
        limit 1 for update of v skip locked)
        update emba_document_version v set worker_attempts=v.worker_attempts+1,
          next_worker_at=clock_timestamp()+interval '5 minutes'
        from candidate c where v.document_id=c.document_id and v.version=c.version
        returning v.document_id as "documentId",v.version,v.uploaded_by as "uploadedBy",v.worker_attempts as attempt`,semantic?[EMBEDDING_MODEL_ID,EMBEDDING_DIMENSIONS]:[]);
      return row;
    });
    if(!job)break;
    result.claimed++;
    try {
      // Uploads persist only their author, not tokens. Reconstruct a short-lived
      // worker principal from a current verified identity, then the existing
      // processor rechecks uploader identity and organizer authority at each stage.
      const {rows:[identity]}=await db.query<{issuer:string;subject:string}>(`select issuer,subject from emba_identity
        where person_id=$1 and revoked_at is null and verified_at is not null
        order by issuer,subject limit 1`,[job.uploadedBy]);
      const p=identity&&await authenticate(db,'persisted-document-job',async()=>({...identity,expiresAt:Date.now()+60_000}));
      if(!p)throw new Error('unavailable');
      await processDocument(db,p,job.documentId,job.version);
      if(semantic)await indexDocumentEmbeddings(db,p,{documentId:job.documentId,version:job.version});
      result.ready++;
    } catch {
      result.failed++;
      // Attempt fencing prevents an old invocation from changing a newer claim.
      // No raw provider/SQL/source failure content is persisted or returned.
      await db.query(`update emba_document_version set next_worker_at=clock_timestamp()+($4::integer*interval '1 minute')
        where document_id=$1 and version=$2 and worker_attempts=$3`,
      [job.documentId,job.version,job.attempt,Math.min(2**job.attempt,60)]);
    }
  }
  return result;
}
