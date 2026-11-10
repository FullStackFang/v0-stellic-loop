'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { acceptInvitation, acceptInvitationById, declineInvitation, issueInvitation, revokeInvitation } from '@/lib/emba/invitations';
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
export async function createGroup(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  let namespace: string | null = null;
  const result = await mutate(async principal => {
    const group = await createWorkspace(db(), principal, { name: value(data, 'name'), description: value(data, 'description'), namespace: value(data, 'namespace') });
    namespace = group.namespace;
  });
  if (namespace) redirect(`/groups/${namespace}`);
  return result;
}
export async function inviteMember(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    const expiresAt = value(data, 'expiresAt');
    const invite = await issueInvitation(db(), principal, {
      orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), recipientEmail: value(data, 'recipientEmail'),
      role: value(data, 'role') as 'member', expiresAt: new Date(`${expiresAt}Z`).toISOString(),
    });
    return { message: 'Invitation created. Copy the link and share it privately.', invitationToken: invite.token };
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
