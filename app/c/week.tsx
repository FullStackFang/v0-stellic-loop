import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { CampusScreen } from '@/components/campus/screen';
import { SiteFoot } from '@/components/campus/foot';
import { LookingAt } from '@/components/campus/looking-at';
import { SignOut } from '@/components/campus/sign-out';
import { DOODLES_PAGE } from '@/lib/campus/doodles';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { schoolOf, SWAP_TICKET } from '@/lib/campus/schools';
import { campusScreen, type ShareLink } from '@/lib/campus/screen';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
import { barGroups } from '@/lib/campus/bar-groups';
import { SeatsSmall } from '@/components/loading/seats';
import { OnYou, startOnYou } from './on-you';
import { barDoor } from './site-bar';

/**
 * "This week" for one campus, as the person looking may see it. A signed-in person belongs to one school: another
 * school's address sends them to their own, and someone at no school goes to the games (Doodles). The admin opens any.
 * `back` is where sign-in returns to. `link` is the share link the page was opened from, if any.
 */
export async function Week({ campus, back, link }: { campus: Campus; back: string; link?: ShareLink }) {
  const viewer = await campusViewer();
  if (viewer && !mayUse(viewer, campus)) {
    if (viewer.campus) redirect(`/c/${viewer.campus.slug}`);
    redirect(DOODLES_PAGE);
  }
  if (viewer) startOnYou();
  const [screen, groups] = await Promise.all([campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: [] }, { link }), viewer ? barGroups(viewer.principal) : []]);
  // The campuses of this school, when it has more than one: what the swap on the map offers.
  const parts = (await listCampuses(db())).filter(each => schoolOf(each.slug) === schoolOf(campus.slug) && SWAP_TICKET[each.slug]);
  const swap = parts.length < 2 ? [] : await Promise.all(parts.map(async each => ({ slug: each.slug, ...SWAP_TICKET[each.slug], count: (await weekListings(db(), each)).length, home: !!viewer && !viewer.admin && viewer.campus?.id === each.id, here: each.id === campus.id })));
  const door = viewer ? undefined : await barDoor(back);
  return <><LookingAt slug={campus.slug} /><CampusScreen screen={screen} groups={groups} swap={swap} signInHref={signInHref(back)} door={door} openId={link?.listingId ?? null} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} onYou={viewer ? <Suspense fallback={<SeatsSmall size={16} first />}><OnYou going={screen.tickets.filter(ticket => ticket.mine).map(ticket => ({ id: ticket.id, title: ticket.title, when: `${ticket.day} ${ticket.time}`, href: `/o/${ticket.mine!.token}`, place: ticket.place, people: ticket.going, faces: ticket.mine!.members.flatMap(member => member.photo ? [member.photo] : []).slice(0, 4) }))} /></Suspense> : null} /><SiteFoot home={`/c/${campus.slug}`} /></>;
}
