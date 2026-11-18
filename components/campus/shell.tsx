import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { campusViewer } from '@/lib/campus/session';
import { Kit, kitScript } from './kit';
import '@/app/c/campus.css';

/**
 * What every campus page sits in: the campus stylesheet, the colours (the person's pick, or else their school's, or
 * else Loop's own), and the sign-in provider when sign-in is set up.
 */
export async function CampusShell({ children }: { children: ReactNode }) {
  const own = (await campusViewer())?.kit ?? 'loop';
  const inside = <><script dangerouslySetInnerHTML={{ __html: kitScript(own) }} /><Kit own={own} />{children}</>;
  return clerkPortalConfigured() ? <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" telemetry={{ disabled: true }}>{inside}</ClerkProvider> : inside;
}
