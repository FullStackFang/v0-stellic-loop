import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { campusViewer } from '@/lib/campus/session';
import { Kit } from './kit';
import '@/app/c/campus.css';

// Runs before the page is painted, so a picked or school kit never flashes in after the default. It is written here and
// not in kit.tsx because a server component cannot call a function of a client file. The key is the one kit.tsx uses.
// A pick the person may not wear (another school's, without Ink+) is passed over, as kitsFor in kit.tsx has it.
const kitScript = (own: string, any: boolean) => `try{var k=localStorage.getItem('loop-kit'),o=${JSON.stringify(own).replace(/</g,'\u003c')};document.documentElement.dataset.kit=k&&(${any}||k==='loop'||k===o)?k:o}catch(e){}`;
import '@/app/c/campus.css';

/**
 * What every campus page sits in: the campus stylesheet, the colours (the person's pick, or else their school's, or
 * else Loop's own), and the sign-in provider when sign-in is set up.
 */
export async function CampusShell({ children }: { children: ReactNode }) {
  // Signed out there is no school to hold anyone to: the colours last picked on this browser stay.
  const viewer = await campusViewer(), own = viewer?.kit ?? 'loop', any = !viewer || viewer.anyKit;
  const inside = <><script dangerouslySetInnerHTML={{ __html: kitScript(own, any) }} /><Kit own={own} any={any} />{children}</>;
  return clerkPortalConfigured() ? <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" telemetry={{ disabled: true }}>{inside}</ClerkProvider> : inside;
}
