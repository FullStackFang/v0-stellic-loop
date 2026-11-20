import { ClerkProvider } from '@clerk/nextjs';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { barGroups } from '@/lib/campus/bar-groups';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnYou } from '@/app/c/on-you';
import { SeatsSmall } from '@/components/loading/seats';
import { getPortalPrincipal, getSignedInPrincipal } from '@/lib/emba/portal-session';
import { frontIsCampus } from '@/lib/campus/schools';
import { CUSTOM, PHOTO, animal, animalOf, customFace } from '@/lib/campus/animals';
import { customFaces } from '@/lib/campus/custom-face';
import { hasInk } from '@/lib/campus/ink';
import { campusOf, pickedFaces } from '@/lib/campus/people';
import { Kit } from '@/components/campus/kit';
import { SiteFoot } from '@/components/campus/foot';
import { SignOut } from '@/components/campus/sign-out';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusScreen } from '@/lib/campus/screen';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import type { Screen } from '@/lib/campus/view';
import { Bar } from './bar';
import { SessionRefresh } from './session-refresh';
import '@/app/c/campus.css';
import './campus-look.css';

/** Whose colours the person sees unless they pick others (their school's, or Loopd's own), and the animal that is their face. */
async function looks(principal: Principal): Promise<{ kit: string; face: string | null; ink: boolean }> {
  try {
    const [school, [faces, ink, made]] = await Promise.all([campusOf(db(), principal), db().tx(async q => [await pickedFaces(q, [principal.personId]), await hasInk(q, principal.personId), await customFaces(q, [principal.personId])] as const)]);
    const picked = faces.get(principal.personId), own = made.get(principal.personId)?.token;
    return { kit: school?.slug ?? 'loop', face: picked === PHOTO ? null : picked === CUSTOM && own ? customFace(own) : animal(picked === undefined || picked < 0 ? animalOf(principal.personId) : picked), ink };
  } catch { return { kit: 'loop', face: null, ink: false }; }
}
/** The person's campus screen, for the account card: the same one the campus pages draw theirs from (app/c/ink/page.tsx). Null if it cannot be read; the bar then has a plain card. */
async function accountScreen(): Promise<Screen | null> {
  try {
    const viewer = await campusViewer(), campus = viewer && (await lookingAt() ?? viewer.campus ?? await findCampus(db(), DEFAULT_CAMPUS));
    return viewer && campus ? await campusScreen(db(), campus, { personId: viewer.personId, admin: viewer.admin, groups: [] }) : null;
  } catch { return null; }
}
// Runs before the page is painted, so a picked or school kit never flashes in after the default. The key is the one components/campus/kit.tsx uses.
const kitScript = (own: string) => `try{document.documentElement.dataset.kit=localStorage.getItem('loop-kit')||${JSON.stringify(own).replace(/</g, '\\u003c')}}catch(e){}`;

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const principal = await getPortalPrincipal().catch(() => null);
  // With the campus screen in front, a signed-in person who belongs to no group has nothing here: back to the front door.
  if (!principal && frontIsCampus() && await getSignedInPrincipal().catch(() => null)) redirect('/');
  // Signed out there is no bar: the page itself carries the way in, in the look it always had.
  let content = <div className="lp">{configured && <SessionRefresh />}<main className="lp-main lp-main-out"><div className="lp-wrap">{children}</div></main></div>;
  if (principal) {
    const [groups, look, screen] = await Promise.all([barGroups(principal), looks(principal), accountScreen()]);
    content = <div className="cs gb"><script dangerouslySetInnerHTML={{ __html: kitScript(look.kit) }} /><Kit own={look.kit} />
      <Bar groups={groups} face={look.face} ink={look.ink} screen={screen} account={configured ? <SignOut /> : null}><Suspense fallback={<SeatsSmall size={16} />}><OnYou /></Suspense></Bar>
      <div className="lp"><main className="lp-main"><div className="lp-wrap">{children}</div></main></div><SiteFoot /></div>;
  }
  return configured ? <ClerkProvider signInUrl="/groups/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
