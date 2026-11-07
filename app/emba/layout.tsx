import Link from 'next/link';
import {ClerkProvider,UserButton} from '@clerk/nextjs';
import {clerkPortalConfigured} from '@/lib/emba/clerk-identity';
import '@/components/TripView.css';
import './portal.css';

export default function EmbaLayout({ children }: { children: React.ReactNode }) {
  const configured=clerkPortalConfigured();
  const content=<div className="lt-trip emba-portal"><header className="lt-header"><Link href="/" className="lt-logo">Loop</Link><span>EMBA member space</span>{configured&&<UserButton />}</header><main className="lt-main">{children}</main></div>;
  return configured?<ClerkProvider signInUrl="/emba/sign-in" signInFallbackRedirectUrl="/emba" signUpFallbackRedirectUrl="/emba" telemetry={{disabled:true}}>{content}</ClerkProvider>:content;
}
