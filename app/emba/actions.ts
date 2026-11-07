'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { requireFirstParty, grantLease, revokeLease } from '@/lib/emba/consent';
import { saveMemory } from '@/lib/emba/memory';
import { issueInvitation, revokeInvitation, acceptInvitation } from '@/lib/emba/invitations';
import { EmbaError } from '@/lib/emba/errors';
import { canAccessLoop, type Principal } from '@/lib/emba/access';
import type { PortalResult } from '@/components/emba/portal-types';
import { createActivity, saveCommitment, withdrawCommitment, setDependencyConsent, finalizeActivity, closeActivity, readActivity } from '@/lib/emba/activities';
import { setNameDisclosure } from '@/lib/emba/disclosure';
import { saveFeedback, deleteFeedback } from '@/lib/emba/feedback';
import { uploadDocument, processDocument, deleteDocument } from '@/lib/emba/knowledge';
import { approveConfirmation } from '@/lib/emba/confirmation';
import { parseReview } from './review';
import { planForMe } from '@/lib/emba/planning';
import { exportPersonalData, deletePersonalData } from '@/lib/emba/privacy';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
const utc = (data: FormData) => new Date(`${value(data, 'expiresAt')}:00Z`).toISOString();
function intentTime(data: FormData, key: string): string | null {
  const input = value(data, key);
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input)) throw new RangeError('Invalid UTC time');
  const seconds = input.length === 16 ? `${input}:00` : input;
  const parsed = new Date(`${seconds}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,19) !== seconds) throw new RangeError('Invalid UTC time');
  return parsed.toISOString();
}
function selectedScope(data: FormData) {
  const selected = value(data, 'scope');
  if (selected === 'personal') return { orgId: null, loopId: null };
  const parts = selected.split(':');
  if (parts.length !== 2) throw new RangeError('Invalid context');
  return { orgId: parts[0], loopId: parts[1] };
}

async function mutate(run: (principal: Principal) => Promise<Partial<PortalResult> | void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign-in is not configured. No changes were saved.' };
  try {
    await requireFirstParty(db(), principal);
    const result = await run(principal);
    revalidatePath('/emba');
    return { status: 'success', message: 'Saved.', ...result };
  } catch (error) {
    const message = error instanceof EmbaError && error.code === 'conflict'
      ? 'This item changed. Reload before correcting it.'
      : error instanceof ZodError || error instanceof RangeError
        ? 'Check the fields and select at least one allowed action when granting access.'
        : 'This action is unavailable. Access may have expired or been revoked. Reload and try again.';
    return { status: 'error', message };
  }
}

export async function savePreference(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    await saveMemory(db(), principal, {
      operationId: value(data,'operationId'), ...(value(data,'id') ? { id:value(data,'id'), expectedVersion:Number(value(data,'expectedVersion')) } : {}),
      kind:value(data,'kind'), text:value(data,'text'), category:value(data,'category'), place:value(data,'place') || null,
      strength:Number(value(data,'strength')), confidence:1, status:value(data,'status'),
      startsAt:intentTime(data,'startsAt'), endsAt:intentTime(data,'endsAt'),
      orgId:value(data,'orgId') || null, loopId:value(data,'loopId') || null,
    });
  });
}

export async function grantConnection(_previous: PortalResult, data: FormData) {
  return mutate(async principal => { await grantLease(db(),principal,{ clientId:value(data,'clientId'),actions:data.getAll('actions'),expiresAt:utc(data),...selectedScope(data) }); });
}
export async function revokeConnection(_previous: PortalResult, data: FormData) {
  return mutate(principal => revokeLease(db(),principal,value(data,'id')));
}
export async function createInvitation(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    const result = await issueInvitation(db(),principal,{ orgId:value(data,'orgId'),loopId:value(data,'loopId'),recipientEmail:value(data,'recipientEmail'),role:value(data,'role') as 'member',expiresAt:utc(data) });
    return { message:'Invitation created. Share the token privately; email delivery is not configured.', invitationToken:result.token };
  });
}
export async function cancelInvitation(_previous: PortalResult, data: FormData) {
  return mutate(principal => revokeInvitation(db(),principal,value(data,'id')));
}
export async function redeemInvitation(_previous: PortalResult, data: FormData) {
  return mutate(async principal => { await acceptInvitation(db(),principal,value(data,'token')); });
}

export async function publishActivity(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'reviewed') !== 'yes') throw new EmbaError('forbidden');
    await createActivity(db(),principal,Object.fromEntries(['orgId','loopId','title','place','timezone','startsAt','endsAt','deadline'].map(key => [key,value(data,key)])));
  });
}
export async function commitToActivity(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'reviewed') !== 'yes') throw new EmbaError('forbidden');
    await saveCommitment(db(),principal,{ activityId:value(data,'activityId'),revision:Number(value(data,'revision')),operationId:value(data,'operationId'),minOthers:Number(value(data,'minOthers')),requires:value(data,'requires').split(',').map(v=>v.trim()).filter(Boolean) });
  });
}
export async function withdrawFromActivity(_previous: PortalResult, data: FormData) {
  return mutate(principal => withdrawCommitment(db(),principal,value(data,'activityId'),Number(value(data,'revision'))));
}
export async function changeDisclosure(_previous: PortalResult, data: FormData) {
  return mutate(async principal => { await setNameDisclosure(db(),principal,{activityId:value(data,'activityId'),revision:Number(value(data,'revision')),discloseName:value(data,'discloseName')==='yes'}); });
}
export async function changeDependencyConsent(_previous: PortalResult, data: FormData) {
  return mutate(principal => setDependencyConsent(db(),principal,value(data,'activityId'),Number(value(data,'revision')),value(data,'requesterId'),value(data,'allowed')==='yes'));
}
export async function resolveActivity(_previous: PortalResult, data: FormData) {
  return mutate(async principal => { await finalizeActivity(db(),principal,value(data,'activityId'),Number(value(data,'revision'))); });
}
export async function finishActivity(_previous: PortalResult, data: FormData) {
  return mutate(principal => closeActivity(db(),principal,value(data,'activityId'),Number(value(data,'revision')),value(data,'state') as 'completed'|'cancelled'));
}
export async function recordFeedback(_previous: PortalResult, data: FormData) {
  return mutate(principal => saveFeedback(db(),principal,{
    operationId:value(data,'operationId'),activityId:value(data,'activityId'),expectedVersion:Number(value(data,'expectedVersion')),attendance:value(data,'attendance'),
    assessment:value(data,'assessment') === '' ? null : Number(value(data,'assessment')),
    ...(value(data,'assessment') === '' ? {} : {memoryId:value(data,'memory').split(':')[0],expectedMemoryVersion:Number(value(data,'memory').split(':')[1])}),
  }));
}
export async function removeFeedback(_previous: PortalResult, data: FormData) {
  return mutate(principal => deleteFeedback(db(),principal,value(data,'activityId'),Number(value(data,'expectedVersion'))));
}
export async function uploadResource(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    await uploadDocument(db(),principal,{operationId:value(data,'operationId'),orgId:value(data,'orgId'),loopId:value(data,'loopId'),title:value(data,'title'),mediaType:value(data,'mediaType'),body:value(data,'body'),...(value(data,'documentId') ? {documentId:value(data,'documentId'),expectedVersion:Number(value(data,'expectedVersion'))} : {})});
    return {message:'Source accepted. Process it to make its evidence available.'};
  });
}
export async function processResource(_previous: PortalResult, data: FormData) {
  return mutate(principal => processDocument(db(),principal,value(data,'documentId'),Number(value(data,'version'))));
}
export async function removeResource(_previous: PortalResult, data: FormData) {
  return mutate(principal => deleteDocument(db(),principal,value(data,'documentId'),Number(value(data,'version'))));
}
export async function reviewAssistantAction(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    const binding = parseReview(value(data,'binding'));
    if (binding.action === 'publication') {
      const terms=binding.payload.terms;
      if (!await canAccessLoop(db(),principal,terms.orgId,terms.loopId,'post')) throw new EmbaError('forbidden');
      return {message:'Review the exact publication below. Nothing has been approved.',review:{binding:JSON.stringify(binding),clientId:binding.clientId,action:binding.action,revision:1,title:terms.title,place:terms.place,startsAt:terms.startsAt,endsAt:terms.endsAt,timezone:terms.timezone,conditions:`Commitment deadline: ${terms.deadline}. Organization: ${terms.orgId}; loop: ${terms.loopId}.`,disclosure:'Publishes activity details to this loop. Does not commit anyone or disclose participant names.'}};
    }
    const activity = await readActivity(db(),principal,binding.targetId);
    if (activity.revision !== binding.expectedVersion) throw new EmbaError('conflict');
    return {message:'Review the exact action below. Nothing has been approved.',review:{
      binding:JSON.stringify(binding),clientId:binding.clientId,action:binding.action,revision:activity.revision,title:activity.title,place:activity.place,startsAt:activity.starts_at,endsAt:activity.ends_at,timezone:activity.timezone,
      conditions:binding.action === 'commitment' ? `At least ${binding.payload.minOthers} other people; required member IDs: ${binding.payload.requires.join(', ') || 'none'}.` : 'Existing commitment conditions are unchanged.',
      disclosure:binding.action === 'identity_disclosure' ? binding.payload.discloseName ? 'Share your name with eligible finalized participants.' : 'Keep your name hidden.' : 'This action does not grant name disclosure.',
    }};
  });
}
export async function approveAssistantAction(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'reviewed') !== 'yes') throw new EmbaError('forbidden');
    const binding = parseReview(value(data,'binding'));
    if (binding.action === 'publication') {
      if (!await canAccessLoop(db(),principal,binding.payload.terms.orgId,binding.payload.terms.loopId,'post')) throw new EmbaError('forbidden');
    } else {
      const activity = await readActivity(db(),principal,binding.targetId);
      if (activity.revision !== binding.expectedVersion) throw new EmbaError('conflict');
    }
    const confirmation = await approveConfirmation(db(),principal,binding);
    return {message:`Approved for this exact action until ${confirmation.expires_at} (UTC). Give the confirmation ID to the same assistant. It must execute the action before expiry; approval alone does not change participation.`,confirmationId:confirmation.id};
  });
}
export async function planTrip(_previous: PortalResult, data: FormData) {
  return mutate(async principal => ({message:'Planning evidence loaded. Nothing was booked or joined.',planning:await planForMe(db(),principal,{orgId:value(data,'orgId'),loopId:value(data,'loopId'),place:value(data,'place'),start:value(data,'start'),end:value(data,'end'),...(value(data,'query')?{query:value(data,'query')}:{})})}));
}
export async function exportPilotData() {
  return mutate(async principal => ({message:'Your pilot data is ready. Save it securely.',exportJson:JSON.stringify(await exportPersonalData(db(),principal),null,2)}));
}
export async function deletePilotData(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'confirmDeletion') !== 'delete-pilot-data') throw new EmbaError('forbidden');
    await deletePersonalData(db(),principal);
    return {message:'Pilot personal data deleted. Shared public-board identity and organization publications remain. Backup deletion is subject to retention policy.'};
  });
}
