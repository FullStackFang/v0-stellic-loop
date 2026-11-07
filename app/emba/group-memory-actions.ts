'use server';
import {revalidatePath} from 'next/cache';
import {db} from '@/lib/db';
import {getPortalPrincipal} from '@/lib/emba/portal-session';
import {reviewGroupMemory,approveGroupMemory} from '@/lib/emba/group-actions';
import {publishGroupNote,withdrawGroupNote,readGroupMemory} from '@/lib/emba/group-memory';
import {registerGroupAddress} from '@/lib/emba/groups';
import {listMyLoops} from '@/lib/emba/roles';
import type {PortalResult} from '@/components/emba/portal-types';
import {authConfig} from '@/lib/emba/auth-token';
import {grantLease} from '@/lib/emba/consent';
const value=(d:FormData,k:string)=>String(d.get(k)??'');
const unavailable:PortalResult={status:'error',message:'This note or group is unavailable. Your access or its version may have changed. Review it again.'};
export async function connectGroupAssistant(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p)return unavailable;
 try{
  const clientId=value(data,'clientId');if(!authConfig().clientIds.includes(clientId))return unavailable;
  await grantLease(db(),p,{clientId,orgId:value(data,'orgId'),loopId:value(data,'loopId'),actions:['plan:read',...(data.get('allowWrites')==='yes'?['group-memory:write']:[])],expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString()});
  revalidatePath('/emba');return {status:'success',message:'Group access granted. Add the Loop connector in your assistant and sign in with this same account. You can revoke access below.'};
 }catch{return unavailable;}
}
function parsed(d:FormData){const raw=value(d,'binding');if(Buffer.byteLength(raw,'utf8')>10000)throw new Error('Invalid size');return JSON.parse(raw);}
export async function reviewSharedNote(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p)return unavailable;
 try{
  const review=await reviewGroupMemory(db(),p,parsed(data));
  const group=(await listMyLoops(db(),p)).find(g=>g.orgId===review.payload.orgId&&g.loopId===review.payload.loopId);
  if(!group)return unavailable;
  const current=review.payload.mutation==='publish'?null:await readGroupMemory(db(),p,{orgId:group.orgId,loopId:group.loopId,recordId:review.targetId});
  await reviewGroupMemory(db(),p,review);
  return {status:'success',message:'Review this exact shared note change. Nothing has been published.',groupReview:{binding:JSON.stringify(review),clientId:review.clientId,group:`${group.orgName} / ${group.path}`,mutation:review.payload.mutation,text:review.payload.mutation==='withdraw'?null:review.payload.text,currentText:current?.text??null,expectedVersion:review.expectedVersion}};
 }catch{return unavailable;}
}
export async function approveSharedNote(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p||data.get('reviewed')!=='yes')return unavailable;
 try{const result=await approveGroupMemory(db(),p,parsed(data));return {status:'success',message:'Approved for ten minutes. Give this confirmation ID to the same assistant to apply the change.',confirmationId:result.id};}catch{return unavailable;}
}
export async function saveSharedNote(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p||data.get('reviewed')!=='yes')return unavailable;
 try{
  await publishGroupNote(db(),p,{orgId:value(data,'orgId'),loopId:value(data,'loopId'),operationId:value(data,'operationId'),text:value(data,'text'),...(value(data,'recordId')?{recordId:value(data,'recordId'),expectedVersion:Number(value(data,'expectedVersion'))}:{})});
  revalidatePath('/emba');return {status:'success',message:'Shared note saved. It is visible to authorized group members.'};
 }catch{return unavailable;}
}
export async function withdrawSharedNote(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p||data.get('reviewed')!=='yes')return unavailable;
 try{await withdrawGroupNote(db(),p,{orgId:value(data,'orgId'),loopId:value(data,'loopId'),recordId:value(data,'recordId'),expectedVersion:Number(value(data,'expectedVersion')),operationId:value(data,'operationId')});revalidatePath('/emba');return {status:'success',message:'Note withdrawn. Future reads will not return its content.'};}catch{return unavailable;}
}
export async function registerSharedGroup(_previous:PortalResult,data:FormData):Promise<PortalResult>{
 const p=await getPortalPrincipal();if(!p)return unavailable;
 try{await registerGroupAddress(db(),p,{orgId:value(data,'orgId'),loopId:value(data,'loopId'),namespace:value(data,'namespace'),slug:value(data,'slug')});revalidatePath('/emba');return {status:'success',message:'Group handle registered.'};}catch{return unavailable;}
}
