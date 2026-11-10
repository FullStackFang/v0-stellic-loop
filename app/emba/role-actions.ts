'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { grantRole, revokeMembership, revokeRole } from '@/lib/emba/roles';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');

async function mutate(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign-in is unavailable.' };
  try {
    await run(principal);
    revalidatePath('/emba');
    revalidatePath('/groups');
    return { status: 'success', message: 'Saved.' };
  } catch {
    return { status: 'error', message: 'This membership change is unavailable. Reload and check your access.' };
  }
}

export async function grantScopedRole(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => grantRole(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), personId: value(data, 'personId'), role: value(data, 'role') }));
}
export async function revokeScopedRole(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => revokeRole(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), personId: value(data, 'personId') }));
}
export async function removeOrgMembership(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => revokeMembership(db(), principal, { orgId: value(data, 'orgId'), personId: value(data, 'personId') }));
}
