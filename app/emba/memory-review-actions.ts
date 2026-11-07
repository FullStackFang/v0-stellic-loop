'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { acceptMemoryCandidate, reviewMemoryCandidate } from '@/lib/emba/memory-review';
import type { PortalResult } from '@/components/emba/portal-types';

const unavailable = 'This structured proposal is unavailable. Check the fields and your current access.';
function boundedJson(data: FormData, field: string): unknown {
  const raw = data.get(field);
  if (typeof raw !== 'string' || Buffer.byteLength(raw,'utf8') > 4096) throw new Error('Invalid proposal size');
  return JSON.parse(raw) as unknown;
}

export async function reviewWantProposal(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return {status:'error',message:'Sign-in is not configured. No changes were saved.'};
  try {
    const candidate = boundedJson(data,'candidate');
    const reviewed = await reviewMemoryCandidate(db(),principal,candidate);
    return {status:'success',message:reviewed.outcome === 'stale' ? 'This proposal used an older version. Review the current want and prepare a fresh proposal.' : reviewed.outcome === 'scope_conflict' ? 'This proposal targets a different context or kind.' : reviewed.outcome === 'conflict' ? 'This proposal differs from your current want. Review both before accepting.' : reviewed.outcome === 'unchanged' ? 'This proposal matches your current want.' : 'Review the proposed want before accepting.',memoryReview:{...reviewed,binding:JSON.stringify(reviewed.candidate),operationId:randomUUID()}};
  } catch { return {status:'error',message:unavailable}; }
}

export async function acceptWantProposal(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return {status:'error',message:'Sign-in is not configured. No changes were saved.'};
  if (data.get('reviewed') !== 'yes') return {status:'error',message:'Review the proposal before accepting it.'};
  try {
    const candidate = boundedJson(data,'binding');
    await acceptMemoryCandidate(db(),principal,candidate,String(data.get('operationId') ?? ''));
    revalidatePath('/emba');
    return {status:'success',message:'Accepted and saved as your active want.'};
  } catch { return {status:'error',message:'This proposal changed or is unavailable. Review the current want again.'}; }
}
