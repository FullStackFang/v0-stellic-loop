import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { CampusScreen } from '@/components/campus/screen';
import { LookingAt } from '@/components/campus/looking-at';
import { AddSchools } from '@/components/campus/add-schools';
import { FitLines, SchoolAsk } from '@/components/campus/no-school';
import { SignOut } from '@/components/campus/sign-out';
import { addedSchools } from '@/lib/campus/linkedin';
import { schoolAsked } from '@/lib/campus/school-ask';
import './no-school.css';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { schoolOf, SWAP_TICKET } from '@/lib/campus/schools';
import { campusScreen, type ShareLink } from '@/lib/campus/screen';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
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
  const screen = await campusScreen(db(), campus, viewer && { personId: viewer.personId, admin: viewer.admin, groups: [] }, { link });
  // The campuses of this school, when it has more than one: what the swap on the map offers.
  const parts = (await listCampuses(db())).filter(each => schoolOf(each.slug) === schoolOf(campus.slug) && SWAP_TICKET[each.slug]);
  const swap = parts.length < 2 ? [] : await Promise.all(parts.map(async each => ({ slug: each.slug, ...SWAP_TICKET[each.slug], count: (await weekListings(db(), each)).length, home: !!viewer && !viewer.admin && viewer.campus?.id === each.id, here: each.id === campus.id })));
  return <><LookingAt slug={campus.slug} /><CampusScreen screen={screen} swap={swap} signInHref={signInHref(back)} openId={link?.listingId ?? null} signOut={viewer && clerkPortalConfigured() ? <SignOut /> : null} onYou={viewer ? <Suspense fallback={null}><OnYou going={screen.tickets.filter(ticket => ticket.mine).map(ticket => ({ id: ticket.id, title: ticket.title, when: `${ticket.day} ${ticket.time}`, href: `/o/${ticket.mine!.token}`, place: ticket.place, people: ticket.going, faces: ticket.mine!.members.flatMap(member => member.photo ? [member.photo] : []).slice(0, 4) }))} /></Suspense> : null} /></>;
}

/**
 * For a signed-in person whose email is at none of the schools (public/demo/mockups-no-school.html): Loop is for
 * schools, the schools it is at, a way back to sign-in with a school email, and a box for the school they are at.
 * Both buttons that leave sign the person out and land on the front page, where the sign-in card is.
 */
export async function NoSchool() {
  const viewer = await campusViewer(), email = viewer?.principal.verifiedEmail ?? null, signs = clerkPortalConfigured();
  const schools = (await listCampuses(db())).filter(each => schoolOf(each.slug) === each.slug);
  const asked = viewer ? await schoolAsked(db(), viewer.personId) : null, linked = viewer ? await addedSchools(db(), viewer.personId) : { profile: null, added: [] };
  return <div className="cs cs-ns">
    <header className="cs-nav"><Link className="cs-wm" href="/"><Rings />Loop</Link>
      <div className="cs-nav-end">{email && <span className="cs-ns-who">{email}</span>}{signs && <SignOut className="cs-btn" />}</div>
    </header>
    <main>
      <section className="cs-ns-band">
        <FitLines lines={[<>Loop is only for <em>schools</em> right now.</>, 'If that changes, we’ll let you know.']} />
        {email && <p>You signed in with <b>{email}</b>, which is not a school email.</p>}
      </section>
      <div className="cs-ns-two">
        <section className="cs-ns-tk">
          <h2 className="cs-ns-tab">At one of these schools?</h2>
          <ul className="cs-ns-schools">{schools.map(school => <li key={school.slug} data-kit={school.slug}><b>{school.name}</b><small>{school.domains[0]}</small></li>)}</ul>
          {signs && <div className="cs-ns-row"><SignOut className="cs-btn go">Sign in with your school email<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" /></svg></SignOut></div>}
        </section>
        <section className="cs-ns-tk">
          <h2 className="cs-ns-tab">Which school are you at?</h2>
          <SchoolAsk asked={asked} email={email} />
        </section>
        {/* The way in with no school email: the address of a LinkedIn profile, and the school to open. */}
        <section className="cs-ns-tk cs-ns-wide">
          <h2 className="cs-ns-tab">No school email?</h2>
          <AddSchools box="cs-ns-box" schools={{ ...linked, home: null, all: schools.map(each => ({ slug: each.slug, name: each.name })) }} />
          <p>Add your LinkedIn profile and pick the schools you have been at. Nothing is read from LinkedIn.</p>
        </section>
      </div>
    </main>
  </div>;
}
