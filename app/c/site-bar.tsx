import { Suspense, type ReactNode } from 'react';
import { SiteFoot } from '@/components/campus/foot';
import { CampusBar } from '@/components/campus/screen';
import { SignOut } from '@/components/campus/sign-out';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { barGroups } from '@/lib/campus/bar-groups';
import { listCampuses, type Campus } from '@/lib/campus/listings';
import { schoolOf } from '@/lib/campus/schools';
import type { Door } from '@/components/campus/sign-in-here';
import { barScreen } from '@/lib/campus/screen';
import { signInHref, type CampusViewer } from '@/lib/campus/session';
import { SeatsSmall } from '@/components/loading/seats';
import { OnYou, startOnYou } from './on-you';

/** What the bar's "Sign in" opens over the page: the sign-in card, landing on `back` (the page it was pressed on, when not said). */
export async function barDoor(back?: string): Promise<Door> {
  const schools = (await listCampuses(db())).filter(campus => schoolOf(campus.slug) === campus.slug).map(({ slug, name, domains }) => ({ slug, name, domains }));
  return { schools, configured: clerkPortalConfigured(), back };
}

/**
 * The app's top bar for a campus page that draws no screen of its own (Ink, Admin, "Change a plan"): the same bar as
 * "This week", with the person's groups, the counters and the account, and the foot that goes with it. `back` is
 * where sign-in returns to; without it, the page "Sign in" was pressed on.
 */
export async function siteBar({ campus, viewer, back, on }: { campus: Campus; viewer: CampusViewer | null; back?: string; on?: 'ink' | 'doodles' | 'organizers' }): Promise<{ bar: ReactNode; foot: ReactNode }> {
  if (viewer) startOnYou();
  // The bar draws no week: it reads the account card alone (lib/campus/screen.ts, barScreen).
  const [screen, groups] = await Promise.all([barScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: [] }), viewer ? barGroups(viewer.principal) : []]), door = viewer ? undefined : await barDoor(back);
  const bar = <CampusBar screen={screen} groups={groups} on={on} signInHref={signInHref(back ?? '/')} door={door} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null}>{viewer && <Suspense fallback={<SeatsSmall size={16} first />}><OnYou /></Suspense>}</CampusBar>;
  return { bar, foot: <SiteFoot home={`/c/${campus.slug}`} /> };
}
