import Link from 'next/link';
import { ClerkProvider, UserButton } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import '@/components/TripView.css';
import '../emba/portal.css';

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const content = <div className="lt-trip emba-portal"><header className="lt-header"><Link href="/groups" className="lt-logo">Loop</Link><nav aria-label="Workspace"><Link href="/groups">Groups</Link> · <Link href="/groups/connections">Connections</Link></nav>{configured && <UserButton />}</header><main className="lt-main">{children}</main></div>;
  return configured ? <ClerkProvider signInUrl="/emba/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
