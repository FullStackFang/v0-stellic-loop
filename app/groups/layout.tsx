import { ClerkProvider, UserButton } from '@clerk/nextjs';
import type { Principal } from '@/lib/emba/access';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { groupHandle, treeOrder } from '@/lib/emba/group-path';
import { getPortalPrincipal, portalGroupTree } from '@/lib/emba/portal-session';
import { Rail, type RailGroup } from './rail';
import { SessionRefresh } from './session-refresh';

// The rail lists the groups the signed-in person can open, as a tree. A failure here must not take the page down: each page reports its own access.
async function railGroups(principal: Principal): Promise<RailGroup[]> {
  try {
    return treeOrder(await portalGroupTree(principal)).map(group => ({ namespace: group.namespace, slug: group.slug, name: group.orgName, handle: groupHandle(group), depth: group.depth }));
  } catch { return []; }
}

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const principal = await getPortalPrincipal().catch(() => null);
  // Signed out there is no menu or header: the page itself carries the way in.
  const content = <div className="lp">{principal
    ? <Rail groups={await railGroups(principal)} account={configured ? <UserButton showName appearance={{ elements: { userButtonOuterIdentifier: { color: 'var(--on-dark)', fontSize: '14px' }, userButtonBox: { flexDirection: 'row-reverse' } } }} /> : null} />
    : configured && <SessionRefresh />}
    <main className={principal ? 'lp-main' : 'lp-main lp-main-out'}><div className="lp-wrap">{children}</div></main></div>;
  return configured ? <ClerkProvider signInUrl="/groups/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
