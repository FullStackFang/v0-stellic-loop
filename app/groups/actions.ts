'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { setMemberHandle } from '@/lib/emba/tags';
import { acceptInvitation, acceptInvitationById, declineInvitation, revokeInvitation } from '@/lib/emba/invitations';
import { addMemberNow } from '@/lib/emba/add-member';
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
    return { status: 'error', message: 'This change could not be saved. Check your access and try again.' };
  }
}
export async function saveTagHandle(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  const handle = value(data, 'handle').trim().toLowerCase().replace(/^@/, '');
  return mutate(principal => setMemberHandle(db(), principal, { orgId: value(data, 'orgId'), handle: handle || null }));
}
/** Adds a person to the group at once. They have nothing to accept and are sent nothing. */
export async function addMember(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    await addMemberNow(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), email: value(data, 'email'), name: value(data, 'name'), role: value(data, 'role') as 'member' });
    return { message: 'Added.' };
  });
}
export async function cancelInvite(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => revokeInvitation(db(), principal, value(data, 'id')));
}
export async function acceptInvite(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => data.has('id') ? acceptInvitationById(db(), principal, value(data, 'id')) : acceptInvitation(db(), principal, value(data, 'token')));
}
export async function declineInvite(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => declineInvitation(db(), principal, value(data, 'id')));
}
