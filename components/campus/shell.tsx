import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { campusViewer } from '@/lib/campus/session';
import { Kit } from './kit';
import '@/app/c/campus.css';

// Runs before the page is painted, so a picked or school kit never flashes in after the default. It is written here and
// not in kit.tsx because a server component cannot call a function of a client file. The key is the one kit.tsx uses.
const kitScript = (own: string) => `try{document.documentElement.dataset.kit=localStorage.getItem('loop-kit')||${JSON.stringify(own).replace(/</g, '\u003c')}}catch(e){}`;
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
