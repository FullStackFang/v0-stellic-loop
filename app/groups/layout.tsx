import { ClerkProvider } from '@clerk/nextjs';
import { db } from '@/lib/db';
import { barGroups } from '@/lib/campus/bar-groups';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnYou, startOnYou } from '@/app/c/on-you';
import { SeatsSmall } from '@/components/loading/seats';
import { getPortalPrincipal, getSignedInPrincipal } from '@/lib/emba/portal-session';
import { frontIsCampus } from '@/lib/campus/schools';
import { PHOTO } from '@/lib/campus/animals';
import type { Plan } from '@/lib/campus/ink';
import { Kit } from '@/components/campus/kit';
import { SiteFoot } from '@/components/campus/foot';
import { SignOut } from '@/components/campus/sign-out';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { barScreen } from '@/lib/campus/screen';
import { campusViewer, lookingAt, type CampusViewer } from '@/lib/campus/session';
import type { Screen } from '@/lib/campus/view';
import { Bar } from './bar';
import { SessionRefresh } from './session-refresh';
import '@/app/c/campus.css';
import './campus-look.css';

/**
 * The account card, read on its own (lib/campus/screen.ts, accountViewer): the same card the campus pages draw, without
 * their week. With it, whose colours the person sees unless they pick others (their school's, or Loopd's own), and the
 * animal that is their face. If the card cannot be read the screen is null and the bar has a plain card.
 */
async function account(viewer: CampusViewer | null): Promise<{ kit: string; face: string | null; plan: Plan; screen: Screen | null }> {
  const kit = viewer && viewer.kit !== 'loop' && viewer.campus ? viewer.campus.slug : 'loop';
  try {
    const campus = viewer && (await lookingAt() ?? viewer.campus ?? await findCampus(db(), DEFAULT_CAMPUS));
    if (!viewer || !campus) return { kit, face: null, plan: 'free', screen: null };
    const screen = await barScreen(db(), campus, { personId: viewer.personId, admin: viewer.admin, groups: [] }), me = screen.viewer!;
    return { kit, face: me.face === PHOTO ? null : me.photo, plan: me.plan, screen };
  } catch { return { kit, face: null, plan: 'free', screen: null }; }
}

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const principal = await getPortalPrincipal().catch(() => null);
  // With the campus screen in front, a signed-in person who belongs to no group has nothing here: back to the front door.
  if (!principal && frontIsCampus() && await getSignedInPrincipal().catch(() => null)) redirect('/');
  // Signed out there is no bar: the page itself carries the way in, in the look it always had. The foot is there either way.
  let content = <><div className="lp">{configured && <SessionRefresh />}<main className="lp-main lp-main-out"><div className="lp-wrap">{children}</div></main></div><SiteFoot /></>;
  if (principal) {
    // The bar's counters are read beside everything else, not after the bar is drawn (app/c/on-you.tsx).
    startOnYou();
    const seen = campusViewer().catch(() => null);
    const [groups, { screen, ...look }, viewer] = await Promise.all([barGroups(principal), seen.then(account), seen]);
    // The colours they may wear: Loopd's and their schools', or every school's with Ink (components/campus/kit.tsx).
    const yours = viewer?.kits ?? ['loop', look.kit], any = viewer?.anyKit ?? false;
    content = <div className="cs gb"><Kit own={look.kit} yours={yours} any={any} />
      <Bar groups={groups} kits={yours} anyKit={any} face={look.face} plan={look.plan} screen={screen} account={configured ? <SignOut /> : null}><Suspense fallback={<SeatsSmall size={16} first />}><OnYou /></Suspense></Bar>
      <div className="lp"><main className="lp-main"><div className="lp-wrap">{children}</div></main></div><SiteFoot /></div>;
  }
  return configured ? <ClerkProvider signInUrl="/groups/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
