import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture } from '@/test/emba-fixture';
import { deleteDocument, processDocument, uploadDocument } from '@/lib/emba/knowledge';
import { indexKnowledgeVectors, searchKnowledgeVectors } from '@/lib/emba/knowledge-vector';
import type { Db } from '@/lib/db';
import { authenticate } from '@/lib/emba/access';
import { grantLease, revokeLease } from '@/lib/emba/consent';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb({vectors:true});});
afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();});
const modelId='synthetic-test-v1';
it('ranks only the exact authorized loop, expands unembedded conflicting claims, and retries idempotently',async()=>{
 const f=await seedEmbaFixture(t.db);
 const input={documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[0.8,0.2,0]}]};
 await indexKnowledgeVectors(t.db,f.organizer,input);await indexKnowledgeVectors(t.db,f.organizer,input);
 const other=await uploadDocument(t.db,f.organizer,{...f.estonia,operationId:randomUUID(),title:'Excluded strongest',mediaType:'text/plain',body:'Private trip'});
 await processDocument(t.db,f.organizer,other.id,1);
 await indexKnowledgeVectors(t.db,f.organizer,{...input,documentId:other.id,passages:[{ordinal:0,vector:[1,0,0]}]});
 const conflict=await uploadDocument(t.db,f.organizer,{...f.vietnam,operationId:randomUUID(),title:'Correction',mediaType:'application/json',body:JSON.stringify({itineraryVersion:'v2',timezone:'Asia/Ho_Chi_Minh',passages:[{text:'Bus changed',claimKey:'hanoi-bus-departure',claimValue:'15:00'}]})});
 await processDocument(t.db,f.organizer,conflict.id,1);
 await t.db.query('update emba_role set loop_id=$1 where person_id=$2',[f.vietnam.loopId,f.memberA.personId]);
 await expect(searchKnowledgeVectors(t.db,f.memberA,{...f.estonia,modelId,vector:[1,0,0]})).rejects.toThrow('forbidden');
 const hits=await searchKnowledgeVectors(t.db,f.memberA,{...f.vietnam,modelId,vector:[1,0,0],limit:1});
 expect(hits).toHaveLength(2);expect(hits.every(h=>h.disputed&&h.untrusted)).toBe(true);
 expect(hits.map(h=>h.documentId)).not.toContain(other.id);
 expect((await t.db.query('select * from emba_document_embedding')).rows).toHaveLength(2);
 await expect(searchKnowledgeVectors(t.db,f.nonmember,{...f.vietnam,modelId,vector:[1,0,0]})).rejects.toThrow('forbidden');
});
it('invalidates replacement/deletion and rejects stale workers, invalid vectors and model dimension changes',async()=>{
 const f=await seedEmbaFixture(t.db),input={documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[1,0,0]}]};
 await indexKnowledgeVectors(t.db,f.organizer,input);
 for(const vector of [[0,0,0],[NaN,0,0],[Infinity,0,0],[1,0]]) await expect(indexKnowledgeVectors(t.db,f.organizer,{...input,passages:[{ordinal:0,vector}]})).rejects.toThrow();
 await expect(indexKnowledgeVectors(t.db,f.organizer,{...input,passages:Array.from({length:201},(_,ordinal)=>({ordinal,vector:[1,0,0]}))})).rejects.toThrow();
 await expect(searchKnowledgeVectors(t.db,f.memberA,{...f.vietnam,modelId,vector:Array(2049).fill(1)})).rejects.toThrow();
 await expect(indexKnowledgeVectors(t.db,f.organizer,{...input,dimensions:2,passages:[{ordinal:0,vector:[1,0]}]})).rejects.toThrow('conflict');
 expect(await searchKnowledgeVectors(t.db,f.memberA,{...f.vietnam,modelId:'different',vector:[1,0,0]})).toEqual([]);
 await uploadDocument(t.db,f.organizer,{...f.vietnam,documentId:f.document.id,expectedVersion:1,operationId:randomUUID(),title:'Replacement',mediaType:'text/plain',body:'New'});
 expect((await t.db.query('select * from emba_document_embedding')).rows).toEqual([]);
 await expect(indexKnowledgeVectors(t.db,f.organizer,input)).rejects.toThrow('conflict');
 await processDocument(t.db,f.organizer,f.document.id,2);
 await indexKnowledgeVectors(t.db,f.organizer,{...input,version:2});
 await deleteDocument(t.db,f.organizer,f.document.id,2);
 expect((await t.db.query('select * from emba_document_embedding')).rows).toEqual([]);
});
it('enforces vector shape and passage foreign keys in SQL and denies Data API roles',async()=>{
 const f=await seedEmbaFixture(t.db);
 await indexKnowledgeVectors(t.db,f.organizer,{documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[1,0,0]}]});
 for(const value of ['[0,0,0]','[1,0]']) await expect(t.db.query('update emba_document_embedding set embedding=$1::vector',[value])).rejects.toThrow();
 await expect(t.db.query('update emba_document_embedding set ordinal=199')).rejects.toThrow();
 for(const role of ['anon','authenticated']) await expect(t.db.tx(async q=>{
  await q.query(`set local role ${role}`);await q.query('select * from emba_document_embedding');
 })).rejects.toThrow();
});
it('acquires hierarchy authority locks before the source update lock',async()=>{
 const f=await seedEmbaFixture(t.db),statements:string[]=[];
 const observed:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  statements.push(sql);return q.query<T>(sql,params);
 }}))};
 await indexKnowledgeVectors(observed,f.organizer,{documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[1,0,0]}]});
 const hierarchy=statements.findIndex(sql=>sql.includes('for share of l'));
 const source=statements.findIndex(sql=>sql.includes('for update of d,v'));
 expect(hierarchy).toBeGreaterThanOrEqual(0);expect(source).toBeGreaterThan(hierarchy);
});
it('requires current delegated consent, persists audit and fails closed on revocation or deleted evidence before output',async()=>{
 const f=await seedEmbaFixture(t.db);
 await indexKnowledgeVectors(t.db,f.organizer,{documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[1,0,0]}]});
 const principal=(await authenticate(t.db,'synthetic',async()=>({issuer:'urn:loop:synthetic-emba-rehearsal',subject:'person-1',expiresAt:Date.parse('2099-01-01'),clientId:'vector-agent',scopes:['plan:read']})))!;
 const input={...f.vietnam,modelId,vector:[1,0,0]};
 await expect(searchKnowledgeVectors(t.db,principal,input)).rejects.toThrow('forbidden');
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'vector-agent',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect(await searchKnowledgeVectors(t.db,principal,input)).toHaveLength(1);
 expect((await t.db.query("select * from emba_audit where action='plan:read'")).rows.length).toBeGreaterThan(0);
 await revokeLease(t.db,f.memberA,lease.id);
 await expect(searchKnowledgeVectors(t.db,principal,input)).rejects.toThrow('forbidden');
 for(const mutation of ['update emba_role set revoked_at=now() where org_id=$1','update emba_document set deleted_at=now() where org_id=$1']) {
  const changed:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
   const result=await q.query<T>(sql,params);
   if(sql.includes('from expanded a'))await q.query(mutation,[f.orgId]);
   return result;
  }}))};
  await expect(searchKnowledgeVectors(changed,f.memberA,input)).rejects.toThrow();
 }
 const noAudit:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  if(sql.startsWith('insert into emba_audit'))throw new Error('audit unavailable');return q.query<T>(sql,params);
 }}))};
 await expect(searchKnowledgeVectors(noAudit,f.memberA,input)).rejects.toThrow('audit unavailable');
 await t.db.query('update emba_role set revoked_at=now() where org_id=$1',[f.orgId]);
 await expect(indexKnowledgeVectors(t.db,f.organizer,{documentId:f.document.id,version:1,modelId,dimensions:3,passages:[{ordinal:0,vector:[1,0,0]}]})).rejects.toThrow('forbidden');
});
