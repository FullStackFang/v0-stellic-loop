import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
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
  const inside = <><Kit own={own} yours={yours} any={any} />{children}</>;
  return clerkPortalConfigured() ? <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" telemetry={{ disabled: true }}>{inside}</ClerkProvider> : inside;
}

/**
 * What a page that is the same for everyone sits in (Terms, Privacy): the campus stylesheet and the colours, and nothing
 * that asks who is looking, so the page can be built once (openspec loop-lighter-pages, D3). With nothing picked it wears
 * the colours this browser last wore, which for a member are usually their school's.
 */
export function PlainShell({ children }: { children: ReactNode }) {
  return <><Kit own="loop" yours={null} any worn />{children}</>;
}
