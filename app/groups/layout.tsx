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
import { planOf, type Plan } from '@/lib/campus/ink';
import { campusOf, pickedFaces } from '@/lib/campus/people';
import { Kit } from '@/components/campus/kit';
import { SiteFoot } from '@/components/campus/foot';
import { SignOut } from '@/components/campus/sign-out';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { kitScript } from '@/lib/campus/kit-script';
import { campusScreen } from '@/lib/campus/screen';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import type { Screen } from '@/lib/campus/view';
import { Bar } from './bar';
import { SessionRefresh } from './session-refresh';
import '@/app/c/campus.css';
import './campus-look.css';

/** Whose colours the person sees unless they pick others (their school's, or Loopd's own), and the animal that is their face. */
async function looks(principal: Principal): Promise<{ kit: string; face: string | null; plan: Plan }> {
  try {
    const [school, [faces, plan, made]] = await Promise.all([campusOf(db(), principal), db().tx(async q => [await pickedFaces(q, [principal.personId]), await planOf(q, principal.personId), await customFaces(q, [principal.personId])] as const)]);
    const picked = faces.get(principal.personId), own = made.get(principal.personId)?.token;
    return { kit: school?.slug ?? 'loop', face: picked === PHOTO ? null : picked === CUSTOM && own ? customFace(own) : animal(picked === undefined || picked < 0 ? animalOf(principal.personId) : picked), plan };
  } catch { return { kit: 'loop', face: null, plan: 'free' }; }
}
/** The person's campus screen, for the account card: the same one the campus pages draw theirs from (app/c/ink/page.tsx). Null if it cannot be read; the bar then has a plain card. */
async function accountScreen(): Promise<Screen | null> {
  try {
    const viewer = await campusViewer(), campus = viewer && (await lookingAt() ?? viewer.campus ?? await findCampus(db(), DEFAULT_CAMPUS));
    return viewer && campus ? await campusScreen(db(), campus, { personId: viewer.personId, admin: viewer.admin, groups: [] }) : null;
  } catch { return null; }
}

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const principal = await getPortalPrincipal().catch(() => null);
  // With the campus screen in front, a signed-in person who belongs to no group has nothing here: back to the front door.
  if (!principal && frontIsCampus() && await getSignedInPrincipal().catch(() => null)) redirect('/');
  // Signed out there is no bar: the page itself carries the way in, in the look it always had. The foot is there either way.
  let content = <><div className="lp">{configured && <SessionRefresh />}<main className="lp-main lp-main-out"><div className="lp-wrap">{children}</div></main></div><SiteFoot /></>;
  if (principal) {
    const [groups, look, screen, viewer] = await Promise.all([barGroups(principal), looks(principal), accountScreen(), campusViewer().catch(() => null)]);
    // The colours they may wear: Loopd's and their schools', or every school's with Ink+ (components/campus/kit.tsx).
    const yours = viewer?.kits ?? ['loop', look.kit], any = viewer?.anyKit ?? false;
    content = <div className="cs gb"><script dangerouslySetInnerHTML={{ __html: kitScript(look.kit, yours, any) }} /><Kit own={look.kit} yours={yours} any={any} />
      <Bar groups={groups} kits={yours} anyKit={any} face={look.face} plan={look.plan} screen={screen} account={configured ? <SignOut /> : null}><Suspense fallback={<SeatsSmall size={16} />}><OnYou /></Suspense></Bar>
      <div className="lp"><main className="lp-main"><div className="lp-wrap">{children}</div></main></div><SiteFoot /></div>;
  }
  return configured ? <ClerkProvider signInUrl="/groups/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
