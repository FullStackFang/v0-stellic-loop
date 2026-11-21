import { Suspense, type ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';
import { CampusBar } from '@/components/campus/screen';
import { SignOut } from '@/components/campus/sign-out';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { barGroups } from '@/lib/campus/bar-groups';
import type { Campus } from '@/lib/campus/listings';
import { campusScreen } from '@/lib/campus/screen';
import { signInHref, type CampusViewer } from '@/lib/campus/session';
import { SeatsSmall } from '@/components/loading/seats';
import { OnYou, startOnYou } from './on-you';

/**
 * The app's top bar for a campus page that draws no screen of its own (Ink, Admin, "Change a plan"): the same bar as
 * "This week", with the person's groups, the counters and the account, and the foot that goes with it. `back` is
 * where sign-in returns to.
 */
export async function siteBar({ campus, viewer, back, on }: { campus: Campus; viewer: CampusViewer | null; back: string; on?: 'ink' | 'doodles' | 'organizers' }): Promise<{ bar: ReactNode; foot: ReactNode }> {
  if (viewer) startOnYou();
  const [screen, groups] = await Promise.all([campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: [] }), viewer ? barGroups(viewer.principal) : []]);
  const bar = <CampusBar screen={screen} groups={groups} on={on} signInHref={signInHref(back)} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null}>{viewer && <Suspense fallback={<SeatsSmall size={16} first />}><OnYou /></Suspense>}</CampusBar>;
  return { bar, foot: <SiteFoot home={`/c/${campus.slug}`} /> };
}
