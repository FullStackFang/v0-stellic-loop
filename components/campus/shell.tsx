import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { kitScript } from '@/lib/campus/kit-script';
import { campusViewer } from '@/lib/campus/session';
import { Kit } from './kit';
import '@/app/c/campus.css';

/**
 * What every campus page sits in: the campus stylesheet, the colours (the person's pick if they may wear it, or else
 * their school's, or else Loopd's own), and the sign-in provider when sign-in is set up.
 */
export async function CampusShell({ children }: { children: ReactNode }) {
  // Signed out there is no one to hold to the colours: any may be worn.
  const viewer = await campusViewer(), own = viewer?.kit ?? 'loop', yours = viewer?.kits ?? null, any = viewer?.anyKit ?? true;
  const inside = <><script dangerouslySetInnerHTML={{ __html: kitScript(own, yours, any) }} /><Kit own={own} yours={yours} any={any} />{children}</>;
  return clerkPortalConfigured() ? <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" telemetry={{ disabled: true }}>{inside}</ClerkProvider> : inside;
}
