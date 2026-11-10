import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import type {Principal} from './access';
import {authConfig} from './auth-token';
import {requireFirstParty} from './consent';
import {approveConfirmation,consumeConfirmation} from './confirmation';
import {EmbaError} from './errors';
import {groupNoteSchema,validateGroupNote,applyConfirmedGroupNote,readGroupNoteReceipt} from './group-memory';

export const groupReviewSchema=z.strictObject({clientId:z.string().min(1).max(200),action:z.literal('group_memory_publication'),targetId:z.uuid(),expectedVersion:z.number().int().positive(),payload:groupNoteSchema})
 .refine(v=>v.targetId===v.payload.recordId&&v.expectedVersion===v.payload.expectedVersion);
function binding(p:Principal,input:unknown){
 if(!p.clientId)throw new EmbaError('forbidden');
 const payload=groupNoteSchema.parse(input);
 return {clientId:p.clientId,action:'group_memory_publication' as const,targetId:payload.recordId,expectedVersion:payload.expectedVersion,payload};
}
const transactionDb=(q:Q):Db=>({...q,tx:fn=>fn(q)});
export async function prepareGroupMemory(db:Db,p:Principal,input:unknown){
 const review=binding(p,input);
 await db.tx(q=>validateGroupNote(q,p,review.payload));
 return {review,reviewPath:'/emba',requiresFirstPartyApproval:true,instruction:'Paste the review in Loop. Review the exact group, note and assistant before approving. This is a member note, not a group decision. Preparation stores no note.'};
}
export async function reviewGroupMemory(db:Db,p:Principal,input:unknown){
 const review=groupReviewSchema.parse(input);
 return db.tx(async q=>{
  await q.query('select id from person where id=$1 for update',[p.personId]);
  await requireFirstParty(q,p);
  if(!authConfig().clientIds.includes(review.clientId))throw new EmbaError('forbidden');
  const {rows}=await q.query(`select id from emba_lease where person_id=$1 and client_id=$2 and org_id=$3 and loop_id=$4
   and 'group-memory:write'=any(actions) and revoked_at is null and expires_at>clock_timestamp() for share`,[p.personId,review.clientId,review.payload.orgId,review.payload.loopId]);
  if(!rows.length)throw new EmbaError('forbidden');
  await validateGroupNote(q,p,review.payload);
  return review;
 });
}
export async function approveGroupMemory(db:Db,p:Principal,input:unknown){
 return db.tx(async q=>{
  const scoped=transactionDb(q),review=await reviewGroupMemory(scoped,p,input);
  return approveConfirmation(scoped,p,review);
 });
}
export async function executeGroupMemory(db:Db,p:Principal,confirmationId:string,input:unknown){
 z.uuid().parse(confirmationId);
 const review=binding(p,input);
 return db.tx(async q=>{
  // Person lock serializes exact retries with confirmation consumption and purge.
  const prior=await readGroupNoteReceipt(q,p,review.payload);
  if(prior)return prior;
  return consumeConfirmation(transactionDb(q),p,confirmationId,review,(_,confirmed)=>applyConfirmedGroupNote(q,p,confirmed.payload));
 });
}
