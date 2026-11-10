import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { AccessRequestLink } from './request-link';

export const dynamic = 'force-dynamic';
export default async function RequestPage() {
  const principal = await getPortalPrincipal();
  return <section className="lt-editor"><h1>Request group access</h1><AccessRequestLink signedIn={!!principal} signInAvailable={clerkPortalConfigured()} /></section>;
}
