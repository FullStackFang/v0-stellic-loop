import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CampusBar } from '@/components/campus/screen';
import { SignOut } from '@/components/campus/sign-out';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { INK_MOCKUP, INK_PAGE } from '@/lib/campus/ink';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusScreen } from '@/lib/campus/screen';
import { campusViewer, lookingAt, openableGroups, signInHref } from '@/lib/campus/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ink · Loop' };

/**
 * The Ink page: the same top bar as "This week", and under it the approved mockup, which fills the rest of the window
 * and scrolls on its own. Open to signed-out visitors. The bar is drawn from the screen of the campus the person was last
 * looking at, or else their own, so "This week" leads back there, and it
 * names the same groups and shows the same face.
 */
export default async function InkPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const screen = await campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: await openableGroups(viewer) });
  return <div className="cs cs-inkpage">
    <CampusBar screen={screen} on="ink" signInHref={signInHref(INK_PAGE)} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} />
    <iframe className="cs-inkframe" src={INK_MOCKUP} title="Loop Ink" />
  </div>;
}
