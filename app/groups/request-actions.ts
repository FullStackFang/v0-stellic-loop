'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { redirect } from 'next/navigation';
import { accessRequestPreview, disableAccessRequests, enableAccessRequests, joinFromShare, replaceJoinLink, requestMembership, reviewMembershipRequest, setJoinMode, type JoinOutcome } from '@/lib/emba/access-requests';
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
const joined: Record<Exclude<JoinOutcome['outcome'], 'joined'>, string> = { requested: 'Request sent to the group organizers.', contact_organizer: 'This link cannot add you to the group again. Contact an organizer of the group.' };
/** Takes the join step, then sends a person who was admitted on to `next`; anyone else is told what happened. */
async function takeJoinStep(run: (principal: Parameters<typeof requestMembership>[1]) => Promise<JoinOutcome>, next: (namespace: string) => string): Promise<PortalResult> {
  let to: string | null = null;
  const result = await mutate(async principal => {
    const { outcome, namespace } = await run(principal);
    if (outcome === 'joined') { to = next(namespace); return; }
    return { status: outcome === 'requested' ? 'success' : 'error', message: joined[outcome] };
  });
  if (to) redirect(to);
  return result;
}
export async function submitMembershipRequest(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return takeJoinStep(principal => requestMembership(db(), principal, value(data, 'token')), namespace => `/groups/${namespace}`);
}
/** The join step from an event's or an ask's share page: a person who is admitted returns to the item they opened. */
export async function joinFromShareLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const kind = value(data, 'kind') === 'ask' ? 'ask' : 'event', token = value(data, 'token');
  return takeJoinStep(principal => joinFromShare(db(), principal, { kind, token }), () => `/${kind === 'ask' ? 'a' : 'e'}/${encodeURIComponent(token)}`);
}
export async function setRequestLinkMode(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => setJoinMode(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), mode: value(data, 'mode') }));
}
export async function replaceRequestLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => ({ accessRequestToken: await replaceJoinLink(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId') }), message: 'Link replaced. The old link no longer works. Copy the new one now; Loop stores only its hash.' }));
}
export async function reviewRequest(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => reviewMembershipRequest(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), personId: value(data, 'personId'), decision: value(data, 'decision') }));
}
