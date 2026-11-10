import { ClerkProvider, UserButton } from '@clerk/nextjs';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listPortalGroups } from '@/lib/emba/groups';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { Rail } from './rail';
import './groups.css';

// The rail lists the signed-in person's teams. A failure here must not take the page down: each page reports its own access.
async function railGroups() {
  try {
    const principal = await getPortalPrincipal();
    if (!principal) return [];
    return (await listPortalGroups(db(), principal)).filter(group => group.slug === 'workspace').map(group => ({ namespace: group.namespace, name: group.orgName }));
  } catch { return []; }
}

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const content = <div className="lp"><Rail groups={await railGroups()} account={configured ? <UserButton /> : null} /><main className="lp-main"><div className="lp-wrap">{children}</div></main></div>;
  return configured ? <ClerkProvider signInUrl="/emba/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
