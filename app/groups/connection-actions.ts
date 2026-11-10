'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authConfig } from '@/lib/emba/auth-token';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { grantLease, listLeases, renewGroupReadLease, revokeLease } from '@/lib/emba/consent';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
async function mutate(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    await run(principal);
    revalidatePath('/groups/connections');
    return { status: 'success', message: 'Saved.' };
  } catch {
    return { status: 'error', message: 'Connection access could not be changed. Check the deployment setup and your membership.' };
  }
}
const teamGrant = (actions: string[]) => ['plan:read', 'group-memory:write plan:read'].includes([...actions].sort().join(' '));
export async function grantGroupRead(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    const config = authConfig();
    const clientId = value(data, 'clientId');
    if (!config.clientIds.includes(clientId)) throw new Error('Unknown client');
    const [orgId, loopId] = value(data, 'scope').split(':');
    // Read, or read and write. Nothing else can be granted from this page.
    const actions = value(data, 'access') === 'write' ? ['plan:read', 'group-memory:write'] : ['plan:read'];
    // One grant per assistant and team: a new choice replaces the old one, so choosing Read takes write away.
    const earlier = (await listLeases(db(), principal)).filter(lease => lease.client_id === clientId && lease.org_id === orgId && lease.loop_id === loopId && !lease.revoked_at && teamGrant(lease.actions as string[]));
    await grantLease(db(), principal, { clientId, actions, orgId, loopId, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    for (const lease of earlier) await revokeLease(db(), principal, String(lease.id));
  });
}
export async function renewGroupRead(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    // An assistant this deployment no longer admits cannot be granted access, so its grant cannot be renewed either.
    const lease = (await listLeases(db(), principal)).find(item => String(item.id) === value(data, 'id'));
    if (!lease || !authConfig().clientIds.includes(String(lease.client_id))) throw new Error('Unknown client');
    await renewGroupReadLease(db(), principal, value(data, 'id'));
  });
}
export async function revokeGroupRead(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => revokeLease(db(), principal, value(data, 'id')));
}
