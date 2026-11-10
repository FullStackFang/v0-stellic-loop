'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { accessRequestPreview, disableAccessRequests, enableAccessRequests, requestMembership, reviewMembershipRequest } from '@/lib/emba/access-requests';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
async function mutate(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<Partial<PortalResult> | void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    return { status: 'success', message: 'Saved.', ...result };
  } catch {
    return { status: 'error', message: 'This request is unavailable. Check the link and your access.' };
  }
}
export async function previewAccessRequest(token: string) {
  try { return await accessRequestPreview(db(), token); }
  catch { return null; }
}
export async function enableRequestLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => ({ accessRequestToken: await enableAccessRequests(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), publicLabel: value(data, 'publicLabel') }), message: 'Link enabled. Copy it now; Loop stores only its hash.' }));
}
export async function disableRequestLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => disableAccessRequests(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId') }));
}
export async function submitMembershipRequest(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => { await requestMembership(db(), principal, value(data, 'token')); return { message: 'Request sent to the group organizers.' }; });
}
export async function reviewRequest(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => reviewMembershipRequest(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), personId: value(data, 'personId'), decision: value(data, 'decision') }));
}
