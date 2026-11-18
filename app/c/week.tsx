import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { CampusScreen } from '@/components/campus/screen';
import { SignOut } from '@/components/campus/sign-out';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, type Campus } from '@/lib/campus/listings';
import { campusScreen, type ShareLink } from '@/lib/campus/screen';
import { campusViewer, mayUse, openableGroups, signInHref } from '@/lib/campus/session';

/**
 * "This week" for one campus, as the person looking may see it. A signed-in person belongs to one school: another
 * school's address sends them to their own, and someone at no school is told where Loop is. The admin opens any.
 * `back` is where sign-in returns to. `link` is the share link the page was opened from, if any.
 */
export async function Week({ campus, back, link }: { campus: Campus; back: string; link?: ShareLink }) {
  const viewer = await campusViewer();
  if (viewer && !mayUse(viewer, campus)) {
    if (viewer.campus) redirect(`/c/${viewer.campus.slug}`);
    return NoSchool();
  }
  const screen = await campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: await openableGroups(viewer) }, { link });
  return <CampusScreen screen={screen} signInHref={signInHref(back)} openId={link?.listingId ?? null} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} />;
}

/** For a signed-in person whose email is at none of the schools: which schools Loop is at, and nothing else. */
export async function NoSchool() {
  const schools = await listCampuses(db());
  const names = schools.map(school => school.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
  return <div className="cs">
    <header className="cs-nav"><Link className="cs-wm" href="/"><Rings />Loop</Link></header>
    <main className="cs-plain">
      <h1>Loop is at {names} for now.</h1>
      <p>The email you signed in with is not at one of these schools, so there is no campus to show you. Sign out and come back with your school email.</p>
      {clerkPortalConfigured() && <p><SignOut className="cs-btn" /></p>}
    </main>
  </div>;
}
