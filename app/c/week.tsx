import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { CampusScreen } from '@/components/campus/screen';
import { SiteFoot } from '@/components/campus/foot';
import { LookingAt } from '@/components/campus/looking-at';
import { AddSchools } from '@/components/campus/add-schools';
import { headers } from 'next/headers';
import { ConnectLinkedin, FitLines, MoveUp, SchoolAsk, SchoolStanding } from '@/components/campus/no-school';
import { SignOut } from '@/components/campus/sign-out';
import { addedSchools, profileOptional } from '@/lib/campus/linkedin';
import { linkedinAccount } from '@/lib/campus/linkedin-account';
import { OPEN_AT, schoolAsked, schoolStanding } from '@/lib/campus/school-ask';
import './no-school.css';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { findCampus, listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS, schoolOf, SWAP_TICKET } from '@/lib/campus/schools';
import { campusScreen, type ShareLink } from '@/lib/campus/screen';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
import { barGroups } from '@/lib/campus/bar-groups';
import { OnYou } from './on-you';
import { siteBar } from './site-bar';
import { SeatsSmall } from '@/components/loading/seats';

/**
 * "This week" for one campus, as the person looking may see it. A signed-in person belongs to one school: another
 * school's address sends them to their own, and someone at no school is told where Loopd is. The admin opens any.
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
  return <><LookingAt slug={campus.slug} /><CampusScreen screen={screen} groups={groups} swap={swap} signInHref={signInHref(back)} openId={link?.listingId ?? null} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} onYou={viewer ? <Suspense fallback={<SeatsSmall size={16} first />}><OnYou going={screen.tickets.filter(ticket => ticket.mine).map(ticket => ({ id: ticket.id, title: ticket.title, when: `${ticket.day} ${ticket.time}`, href: `/o/${ticket.mine!.token}`, place: ticket.place, people: ticket.going, faces: ticket.mine!.members.flatMap(member => member.photo ? [member.photo] : []).slice(0, 4) }))} /></Suspense> : null} /><SiteFoot home={`/c/${campus.slug}`} /></>;
}

/**
 * For a signed-in person whose email is at none of the schools (public/demo/mockups-one-sign-in.html, frames 2 and 3):
 * one ticket. The way in with no school email is LinkedIn. Someone who signed in with it, or connected it here, picks
 * their school and sends it for the admin's check, and then waits. They are not asked for the address of their profile. Anyone else is asked to continue with
 * LinkedIn, or to use another email (which signs them out, to the front page and its sign-in card). Where LinkedIn is
 * not switched on at the sign-in service, the profile's address can be sent without it.
 */
export async function NoSchool() {
  const viewer = await campusViewer(), email = viewer?.principal.verifiedEmail ?? null, signs = clerkPortalConfigured();
  const schools = (await listCampuses(db())).filter(each => schoolOf(each.slug) === each.slug);
  const asked = viewer ? await schoolAsked(db(), viewer.personId) : null, standing = viewer && asked ? await schoolStanding(db(), viewer.personId) : null;
  // The address the "Move it up" link gives out: this site's own.
  const site = (await headers()).get('host') ?? 'getloopdin.social';
  const linked = viewer ? await addedSchools(db(), viewer.personId) : { profile: null, added: [], waiting: [] };
  // Whether a LinkedIn account is theirs: they signed in with it, or connected it on this page.
  const owner = viewer ? await linkedinAccount(viewer.principal) : null, waiting = linked.waiting.length > 0;
  // Signed in with LinkedIn, they are not asked for their profile's address as well (once the database can keep a row without one).
  const bare = !!owner && await profileOptional(db());
  const form = <AddSchools box="cs-ns-box" send="Send for a check" profile={!bare} waiting={waiting} schools={{ profile: linked.profile, added: linked.waiting, home: null, all: schools.map(each => ({ slug: each.slug, name: each.name })) }} />;
  const another = <SignOut className="cs-btn">Use another email</SignOut>;
  // The same top bar and foot as every other page, drawn from the first campus: this person has none of their own.
  const first = await findCampus(db(), DEFAULT_CAMPUS), frame = first ? await siteBar({ campus: first, viewer, back: '/' }) : null;
  return <div className="cs">
    {frame?.bar}
    <main className="cs-ns">
      <section className="cs-ns-band">
        {standing
          // A school's full name can be long, so this headline wraps instead of being fitted to the width.
          ? <><h1 className="cs-ns-rank">{standing.school} is <em>#{standing.place}</em> in line.</h1><p>{standing.people < OPEN_AT ? <>Loopd opens at a school when <b>{OPEN_AT} people</b> from it sign up. {OPEN_AT - standing.people} more and it opens there.</> : 'Enough have signed up. Loopd opens there soon.'}</p></>
          : <FitLines lines={[<>Loopd is only for <em>schools</em> right now.</>, 'If that changes, we’ll let you know.']} />}
      </section>
      <div className="cs-ns-two">
        {standing && <>
          <section className="cs-ns-tk"><h2 className="cs-ns-tab">Where it stands</h2><SchoolStanding standing={standing} seats={OPEN_AT} /><SchoolAsk asked={asked} email={email} lined /></section>
          <section className="cs-ns-tk"><h2 className="cs-ns-tab">Move it up</h2><MoveUp school={standing.school} people={standing.people} site={site} /></section>
        </>}
        {owner || waiting ? <section className="cs-ns-tk cs-ns-wide">
          <h2 className="cs-ns-tab">{waiting ? 'We are checking' : 'Pick your school'}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- the LinkedIn account's photo, at the sign-in service's own address */}
          {owner && <div className="cs-ns-me">{owner.photo && <img src={owner.photo} alt="" />}<span><b>{owner.name}</b><small>Signed in with LinkedIn</small></span><span className="cs-ns-stamp">Yours</span></div>}
          {form}
          <p>{waiting ? 'We look at each one ourselves. Sign in again any time: your campus opens here once you are in.' : bare ? 'Pick the school you are at. We look you up on LinkedIn by your name to check it.' : 'LinkedIn does not tell us the address of your profile, so we ask for it: it is what we open to check your school.'}</p>
          {!waiting && !standing && <SchoolAsk asked={asked} email={email} />}
        </section> : <section className="cs-ns-tk cs-ns-wide">
          <h2 className="cs-ns-tab">{email ? `${email} is not a school email` : 'No school email'}</h2>
          {signs ? <ConnectLinkedin other={another} fallback={form} /> : form}
          <p>Loopd is for schools. With LinkedIn we check your school ourselves.</p>
          {!standing && <SchoolAsk asked={asked} email={email} />}
        </section>}
      </div>
    </main>
    {frame?.foot}
  </div>;
}
