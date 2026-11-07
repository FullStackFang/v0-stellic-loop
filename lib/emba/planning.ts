import 'server-only';
import type {Db} from '../db';
import type {Principal} from './access';
import {z} from 'zod';
import {listMemory} from './memory';
import {searchKnowledge,listDocuments} from './knowledge';
import {listActivities} from './activities';
import {audit,authorize} from './consent';
import {EmbaError} from './errors';

export const planSchema=z.strictObject({orgId:z.uuid(),loopId:z.uuid(),place:z.string().trim().min(1).max(120),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),query:z.string().trim().min(1).max(500).optional()})
 .refine(v=>Date.parse(v.end)>Date.parse(v.start));
export async function planForMe(db:Db,p:Principal,input:unknown) {
 const d=planSchema.parse(input),scope={orgId:d.orgId,loopId:d.loopId},global={orgId:null,loopId:null};
 // No asynchronous model call, automatic enrollment, or booking. Each source
 // service authorizes and audits; the composed snapshot is checked again below.
 await db.tx(q=>authorize(q,p,'plan:read',scope));
 const globalWants=await listMemory(db,p,{place:d.place,limit:20});
 const scopedWants=await listMemory(db,p,{...scope,place:d.place,limit:20});
 const passages=await searchKnowledge(db,p,{...scope,query:d.query??d.place,limit:10});
 const documents=await listDocuments(db,p,scope);
 const activities=await listActivities(db,p,{...scope,place:d.place,start:d.start,end:d.end,limit:20});
 const wants=[...globalWants.items,...scopedWants.items].filter(w=>w.kind==='want'||!!w.startsAt&&!!w.endsAt&&Date.parse(w.startsAt)<Date.parse(d.end)&&Date.parse(w.endsAt)>Date.parse(d.start));
 const usableActivities=activities.items.filter(a=>a.state==='open'||a.state==='finalized');
 const result={wants,passages,activities:usableActivities,
  truncated:globalWants.truncated||scopedWants.truncated||activities.truncated||passages.length>=200||documents.length===100,
  incompleteEvidence:documents.some(doc=>doc.state!=='ready')||passages.length===0,
  insufficientEvidence:passages.length===0&&usableActivities.length===0,
  conflictingEvidence:passages.some(passage=>passage.disputed),notABooking:true};
 // A fixed byte budget bounds tool output even when conflict expansion brings
 // long cited passages. Keep conflict/truncation flags when any evidence is cut.
 while(Buffer.byteLength(JSON.stringify(result))>32000) {
  result.truncated=true;result.incompleteEvidence=true;
  if(result.passages.length)result.passages.pop();else if(result.activities.length)result.activities.pop();else result.wants.pop();
 }
 return db.tx(async q=>{
  const lease=await authorize(q,p,'plan:read',scope);
  await authorize(q,p,'memory:read',global);await authorize(q,p,'memory:read',scope);
  for(const want of result.wants) {
   const {rows}=await q.query("select 1 from emba_memory m join emba_memory_version v on v.memory_id=m.id and v.person_id=m.person_id and v.version=m.current_version where m.id=$1 and m.person_id=$2 and m.current_version=$3 and v.status='active' and (v.ends_at is null or v.ends_at>clock_timestamp()) for share of m,v",[want.id,p.personId,want.version]);
   if(!rows.length)throw new EmbaError('conflict');
  }
  // Privacy erasure takes activity locks before document attribution locks.
  for(const activity of [...result.activities].sort((a,b)=>a.id.localeCompare(b.id))) {
   const {rows}=await q.query(`select 1 from emba_activity a where a.id=$1 and a.revision=$2 and a.state=$3 and a.degraded=$4
    and (select c.status from emba_commitment c where c.activity_id=a.id and c.revision=a.revision and c.person_id=$5) is not distinct from $6::text for share of a`,[activity.id,activity.revision,activity.state,activity.degraded,p.personId,activity.own_status]);
   if(!rows.length)throw new EmbaError('conflict');
  }
  for(const source of result.passages) {
   const {rows}=await q.query("select 1 from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version where d.id=$1 and d.current_version=$2 and d.deleted_at is null and v.state='ready' for share of d,v",[source.documentId,source.version]);
   if(!rows.length)throw new EmbaError('conflict');
  }
  await authorize(q,p,'plan:read',scope);await audit(q,p,'plan:read',null,lease);
  return result;
 });
}
