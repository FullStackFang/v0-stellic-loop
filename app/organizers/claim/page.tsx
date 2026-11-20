import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { clubLink, myClaims, type MyClaim } from '@/lib/campus/club-claim';
import { IMPRINT_PAGE } from '@/lib/campus/imprint';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt, signInHref } from '@/lib/campus/session';
import { siteBar } from '@/app/c/site-bar';
import { askClubReviewAction, claimClubAction } from './actions';
import './claim.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Claim your club · Loopd' };

const PAGE = '/organizers/claim';
const STATE = { approved: 'Yours', waiting: 'Being checked', refused: 'Turned down' } as const;

/**
 * Claiming a club (lib/campus/club-claim.ts): paste the club's CampusGroups link, and with your name on its officer
 * list it is yours at once. Otherwise the claim can be sent to a person at Loopd. `said` is what the last press came to.
 */
export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ said?: string; link?: string; club?: string }> }) {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const [{ bar, foot }, { said, link: pasted, club: named }, claims] = await Promise.all([siteBar({ campus, viewer, back: PAGE, on: 'organizers' }), searchParams,
    viewer ? myClaims(db(), viewer.personId).catch((): MyClaim[] => []) : []]);
  // Only a link that is a club's page is shown back or sent on. The club's name is read from what is kept when it is, and else is what the check found.
  const link = clubLink(pasted)?.page ?? '', club = claims.find(each => each.page === link)?.club ?? (named ?? '').slice(0, 200), role = claims.find(each => each.page === link)?.role;
  const answer = !viewer ? null
    : said === 'approved' && club ? <section className="oc-card oc-yes" role="status"><span className="oc-tab">It is yours</span><h2>{club}</h2>
        <p>{role ? `You are on its officer list as ${role}.` : 'You are on its officer list.'} The organizer&rsquo;s home is being built, and it opens for you first.</p></section>
    : said === 'unlisted' && link ? <section className="oc-card" role="status"><span className="oc-tab">Not on the list</span><h2>{club || 'That club'}</h2>
        <p>Your name is not on its officer list, or you are not signed in with your school email. If the list is out of date, a person at Loopd can check.</p>
        <form action={askClubReviewAction} className="oc-row"><input type="hidden" name="link" value={link} /><input name="note" maxLength={600} aria-label="What should we know" placeholder="What should we know? Your role, and who can vouch for you" />
          <button className="cs-btn go">Send for review</button><a className="cs-btn" href={`${link}officers/`} target="_blank" rel="noreferrer">Open the list</a></form></section>
    : (said === 'sent' || said === 'waiting') ? <section className="oc-card" role="status"><span className="oc-tab">Being checked</span><h2>{club || 'Your club'}</h2><p>A person at Loopd is checking this. It shows here as yours once they have.</p></section>
    : said === 'refused' ? <section className="oc-card" role="status"><span className="oc-tab">Turned down</span><h2>{club || 'That club'}</h2><p>This claim was checked and turned down. If that is wrong, an officer on the club&rsquo;s list can claim it.</p></section>
    : said === 'unreadable' ? <section className="oc-card" role="alert"><span className="oc-tab">Could not read it</span><h2>That page did not open</h2><p>Check that the link is your club&rsquo;s own page on your school&rsquo;s CampusGroups site, and try again.</p></section>
    : said === 'bad' ? <section className="oc-card" role="alert"><span className="oc-tab">Not a club link</span><h2>Paste your club&rsquo;s CampusGroups link</h2><p>It looks like cornell.campusgroups.com/yourclub.</p></section>
    : null;
  return <>
    <div className="cs">{bar}
      <main className="oc">
        <section className="oc-card oc-ask"><span className="oc-tab">Claim your club</span><h1>Which club is yours?</h1>
          <p>Paste its link from your school&rsquo;s CampusGroups site. If you are on its officer list, it is yours at once.</p>
          {viewer ? <form action={claimClubAction} className="oc-row"><input name="link" required maxLength={400} defaultValue={said === 'approved' ? '' : link} aria-label="Your club's CampusGroups link" placeholder="cornell.campusgroups.com/yourclub" /><button className="cs-btn go">Check</button></form>
            : <p className="oc-row"><Link className="cs-btn go" href={signInHref(PAGE)}>Sign in with your school email</Link><Link className="cs-btn" href={IMPRINT_PAGE}>What you get</Link></p>}
        </section>
        {answer}
        {claims.length > 0 && <section className="oc-card"><span className="oc-tab">Your clubs</span>
          <ul className="oc-list">{claims.map(each => <li key={each.page}><span><b>{each.club}</b><small>{each.role ?? 'Officer'}</small></span><span className={`cs-pill ${each.state === 'approved' ? 'yes' : 'hot'}`}>{STATE[each.state]}</span></li>)}</ul></section>}
      </main>
    </div>
    {foot}
  </>;
}
