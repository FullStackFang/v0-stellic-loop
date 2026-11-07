'use server';

import {revalidatePath} from 'next/cache';
import {ZodError} from 'zod';
import {db} from '@/lib/db';
import {getPortalPrincipal} from '@/lib/emba/portal-session';
import {getAnnouncementSigner} from '@/lib/emba/announcement-signer';
import {publishAnnouncement,retireAnnouncementKey} from '@/lib/emba/announcements';
import {EmbaError} from '@/lib/emba/errors';
import type {Principal} from '@/lib/emba/access';
import type {PortalResult} from '@/components/emba/portal-types';

const value=(data:FormData,key:string)=>String(data.get(key)??'');
async function mutate(data:FormData,run:(p:Principal)=>Promise<string>):Promise<PortalResult> {
  const p=await getPortalPrincipal();
  if(!p)return {status:'error',message:'Sign-in is not configured. No changes were saved.'};
  try {
    if(value(data,'reviewed')!=='yes')throw new EmbaError('forbidden');
    const message=await run(p);revalidatePath('/emba');return {status:'success',message};
  } catch(error) {
    return {status:'error',message:error instanceof EmbaError&&error.code==='conflict'?'This announcement changed. Reload before correcting it.':error instanceof ZodError?'Check the announcement fields.':'This action is unavailable. Signing may be unconfigured or access may have expired or been revoked.'};
  }
}
export async function publishNotice(_previous:PortalResult,data:FormData):Promise<PortalResult> {
  return mutate(data,async p=>{
    const scope={orgId:value(data,'orgId'),loopId:value(data,'loopId')};
    const signer=await getAnnouncementSigner(scope);
    if(!signer)throw new EmbaError('unavailable');
    const saved=await publishAnnouncement(db(),p,{...scope,text:value(data,'text'),...(value(data,'announcementId')?{announcementId:value(data,'announcementId'),expectedVersion:Number(value(data,'expectedVersion'))}:{})},signer);
    return `Published version ${saved.version}. Earlier versions remain unchanged.`;
  });
}
export async function changeAnnouncementKeyStatus(_previous:PortalResult,data:FormData):Promise<PortalResult> {
  return mutate(data,async p=>{
    await retireAnnouncementKey(db(),p,value(data,'keyId'),value(data,'status') as 'retired'|'revoked'|'compromised');
    return 'Key status updated. Existing announcements show the current verification status.';
  });
}
