'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authConfig } from '@/lib/emba/auth-token';
import { getPortalPrincipal, portalGroupTree } from '@/lib/emba/portal-session';
import { grantLease, listLeases, renewGroupReadLease, revokeLease } from '@/lib/emba/consent';
import { assistantName } from '@/lib/emba/team-text';
import { dayNum, mon } from '@/lib/days';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
type Principal = NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>;
// The team's name, from the listing of groups this person can open. A team that is not in it is simply not named.
const teamName = async (principal: Principal, orgId: unknown, loopId: unknown) => (await portalGroupTree(principal)).find(group => group.orgId === orgId && group.loopId === loopId)?.orgName;
const dayLabel = (ms: number) => { const day = new Date(ms).toISOString().slice(0, 10); return `${mon(day)} ${dayNum(day)}`; };
// `run` may return the sentence to show; without one the message is the plain "Saved."
async function mutate(run: (principal: Principal) => Promise<string | void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const message = await run(principal);
    revalidatePath('/groups/connections');
    return { status: 'success', message: message || 'Saved.' };
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
    const ends = Date.now() + 30 * 86400000;
    await grantLease(db(), principal, { clientId, actions, orgId, loopId, expiresAt: new Date(ends).toISOString() });
    for (const lease of earlier) await revokeLease(db(), principal, String(lease.id));
    const team = await teamName(principal, orgId, loopId);
    return team ? `Saved. ${assistantName(clientId)} can ${actions.length > 1 ? 'read and write' : 'read'} ${team} until ${dayLabel(ends)}.` : undefined;
  });
}
export async function renewGroupRead(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    // An assistant this deployment no longer admits cannot be granted access, so its grant cannot be renewed either.
    const lease = (await listLeases(db(), principal)).find(item => String(item.id) === value(data, 'id'));
    if (!lease || !authConfig().clientIds.includes(String(lease.client_id))) throw new Error('Unknown client');
    await renewGroupReadLease(db(), principal, value(data, 'id'));
    // Short: it shows under the button in the grant's own row, which already names the team and assistant. The new term is 30 days from now, as the grant action counts it.
    return `Renewed until ${dayLabel(Date.now() + 30 * 86400000)}.`;
  });
}
// No message of its own: a revoked row has no form left to show one, and the row turns to Revoked.
export async function revokeGroupRead(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => revokeLease(db(), principal, value(data, 'id')));
}
