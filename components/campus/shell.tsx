import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import '@/app/c/campus.css';

/** What every campus page sits in: the campus stylesheet, and the sign-in provider when sign-in is set up. */
export function CampusShell({ children }: { children: ReactNode }) {
  return clerkPortalConfigured() ? <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" telemetry={{ disabled: true }}>{children}</ClerkProvider> : <>{children}</>;
}
