import 'server-only';
import type {Db} from '../db';
import {canAccessLoop,type Principal} from './access';
import {authorize} from './consent';
import {consumeConfirmation,type ConfirmationInput} from './confirmation';
import {activityPublicationSchema,createActivityInTransaction,commitmentSchema,lockAuthorizedActivity,readActivity,saveCommitmentInTransaction} from './activities';
import {disclosureSchema,setNameDisclosureInTransaction} from './disclosure';
import {EmbaError} from './errors';

type Action='commitment'|'identity_disclosure'|'publication';
function review(p:Principal,action:Action,input:unknown):ConfirmationInput {
 if(!p.clientId)throw new EmbaError('forbidden');
 if(action==='publication') {
  const payload=activityPublicationSchema.parse(input);
  return {clientId:p.clientId,action,targetId:payload.activityId,expectedVersion:1,payload};
 }
 const payload=action==='commitment'?commitmentSchema.parse(input):disclosureSchema.parse(input);
 return {clientId:p.clientId,action,targetId:payload.activityId,expectedVersion:payload.revision,payload};
}
export async function prepareAgentAction(db:Db,p:Principal,action:Action,input:unknown) {
 const binding=review(p,action,input);
 if(action==='publication') {
  const payload=activityPublicationSchema.parse(binding.payload);
  await db.tx(async q=>{
   await authorize(q,p,'activity:write',payload.terms);
   if(!await canAccessLoop(q,p,payload.terms.orgId,payload.terms.loopId,'post'))throw new EmbaError('forbidden');
  });
  return {review:binding,activity:payload.terms,reviewPath:'/emba',requiresFirstPartyApproval:true,instruction:'Review the exact proposed activity in the member portal. Preparation does not publish.'};
 }
 await db.tx(async q=>{
  const a=await lockAuthorizedActivity(q,p,binding.targetId,'commit');
  await authorize(q,p,'activity:write',{orgId:a.org_id,loopId:a.loop_id});
  if(!await canAccessLoop(q,p,a.org_id,a.loop_id,'commit'))throw new EmbaError('forbidden');
  if(a.revision!==binding.expectedVersion)throw new EmbaError('conflict');
 });
 const activity=await readActivity(db,p,binding.targetId);
 if(activity.revision!==binding.expectedVersion)throw new EmbaError('conflict');
 return {review:binding,activity,reviewPath:'/emba',requiresFirstPartyApproval:true,
  instruction:'Review these exact details in the member portal. Preparation does not commit or disclose participation.'};
}
export async function executeAgentAction(db:Db,p:Principal,action:Action,confirmationId:string,input:unknown) {
 const binding=review(p,action,input);
 return consumeConfirmation(db,p,confirmationId,binding,(q,confirmed)=>action==='publication'?createActivityInTransaction(q,p,confirmed.payload):action==='commitment'
  ?saveCommitmentInTransaction(q,p,confirmed.payload)
  :setNameDisclosureInTransaction(q,p,confirmed.payload));
}
