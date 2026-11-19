import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { CampusScreen } from '@/components/campus/screen';
import { SiteFoot } from '@/components/campus/foot';
import { LookingAt } from '@/components/campus/looking-at';
import { AddSchools } from '@/components/campus/add-schools';
import { ConnectLinkedin, FitLines, NotHere } from '@/components/campus/no-school';
import { SignOut } from '@/components/campus/sign-out';
import { addedSchools } from '@/lib/campus/linkedin';
import { linkedinAccount } from '@/lib/campus/linkedin-account';
import { schoolAsked } from '@/lib/campus/school-ask';
import './no-school.css';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { schoolOf, SWAP_TICKET } from '@/lib/campus/schools';
import { campusScreen, type ShareLink } from '@/lib/campus/screen';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
import { barGroups } from '@/lib/campus/bar-groups';
import { OnYou } from './on-you';

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
  const [screen, groups] = await Promise.all([campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: [] }, { link }), viewer ? barGroups(viewer.principal) : []]);
  // The campuses of this school, when it has more than one: what the swap on the map offers.
  const parts = (await listCampuses(db())).filter(each => schoolOf(each.slug) === schoolOf(campus.slug) && SWAP_TICKET[each.slug]);
  const swap = parts.length < 2 ? [] : await Promise.all(parts.map(async each => ({ slug: each.slug, ...SWAP_TICKET[each.slug], count: (await weekListings(db(), each)).length, home: !!viewer && !viewer.admin && viewer.campus?.id === each.id, here: each.id === campus.id })));
  return <><LookingAt slug={campus.slug} /><CampusScreen screen={screen} groups={groups} swap={swap} signInHref={signInHref(back)} openId={link?.listingId ?? null} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} onYou={viewer ? <Suspense fallback={null}><OnYou going={screen.tickets.filter(ticket => ticket.mine).map(ticket => ({ id: ticket.id, title: ticket.title, when: `${ticket.day} ${ticket.time}`, href: `/o/${ticket.mine!.token}`, place: ticket.place, people: ticket.going, faces: ticket.mine!.members.flatMap(member => member.photo ? [member.photo] : []).slice(0, 4) }))} /></Suspense> : null} /><SiteFoot home={`/c/${campus.slug}`} member={groups.length > 0} /></>;
}

/**
 * For a signed-in person whose email is at none of the schools (public/demo/mockups-one-sign-in.html, frames 2 and 3):
 * one ticket. The way in with no school email is LinkedIn. Someone who signed in with it, or connected it here, picks
 * their school and sends their profile for the admin's check, and then waits. Anyone else is asked to continue with
 * LinkedIn, or to use another email (which signs them out, to the front page and its sign-in card). Where LinkedIn is
 * not switched on at the sign-in service, the profile's address can be sent without it.
 */
export async function NoSchool() {
  const viewer = await campusViewer(), email = viewer?.principal.verifiedEmail ?? null, signs = clerkPortalConfigured();
  const schools = (await listCampuses(db())).filter(each => schoolOf(each.slug) === each.slug);
  const asked = viewer ? await schoolAsked(db(), viewer.personId) : null, linked = viewer ? await addedSchools(db(), viewer.personId) : { profile: null, added: [], waiting: [] };
  // Whether a LinkedIn account is theirs: they signed in with it, or connected it on this page.
  const owner = viewer ? await linkedinAccount(viewer.principal) : null, waiting = linked.waiting.length > 0;
  const form = <AddSchools box="cs-ns-box" send="Send for a check" waiting={waiting} schools={{ profile: linked.profile, added: linked.waiting, home: null, all: schools.map(each => ({ slug: each.slug, name: each.name })) }} />;
  const another = <SignOut className="cs-btn">Use another email</SignOut>;
  return <div className="cs cs-ns">
    <header className="cs-nav"><Link className="cs-wm" href="/"><Rings />Loop</Link>
      <div className="cs-nav-end">{email && <span className="cs-ns-who">{email}</span>}{signs && <SignOut className="cs-btn" />}</div>
    </header>
    <main>
      <section className="cs-ns-band">
        <FitLines lines={[<>Loop is only for <em>schools</em> right now.</>, 'If that changes, we’ll let you know.']} />
      </section>
      <div className="cs-ns-two">
        {owner || waiting ? <section className="cs-ns-tk cs-ns-wide">
          <h2 className="cs-ns-tab">{waiting ? 'We are checking' : 'Pick your school'}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- the LinkedIn account's photo, at the sign-in service's own address */}
          {owner && <div className="cs-ns-me">{owner.photo && <img src={owner.photo} alt="" />}<span><b>{owner.name}</b><small>Signed in with LinkedIn</small></span><span className="cs-ns-stamp">Yours</span></div>}
          {form}
          <p>{waiting ? 'We look at each profile ourselves. Come back to this page: your campus opens here once you are in.' : 'LinkedIn does not tell us the address of your profile, so we ask for it: it is what we open to check your school.'}</p>
          {!waiting && <NotHere asked={asked} email={email} />}
        </section> : <section className="cs-ns-tk cs-ns-wide">
          <h2 className="cs-ns-tab">{email ? `${email} is not a school email` : 'No school email'}</h2>
          {signs ? <ConnectLinkedin other={another} fallback={form} /> : form}
          <p>Loop is for schools. With LinkedIn we check your school ourselves.</p>
          <NotHere asked={asked} email={email} />
        </section>}
      </div>
    </main>
  </div>;
}
