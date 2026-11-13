import Link from 'next/link';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import './archive.css';

export const dynamic = 'force-dynamic';

/** One kept file: label, path under /demo, the day it was last worked on, and whether it was the direction picked. */
type Kept = [label: string, file: string, date: string, picked?: true];
type Stop = { when: string; title: string; state: 'Live' | 'Still running' | 'Parked' | 'Ended'; what: string; turned?: string; live?: [label: string, href: string]; shown: Kept[]; rest: Kept[] };

// Every earlier version of Loop, newest first. `shown` gets a live miniature; `rest` is a plain list.
const STOPS: Stop[] = [
  {
    when: 'November 9 to now', title: 'A layer between your AI and your groups', state: 'Live',
    what: 'Tell a group something, ask it something, say you’re interested. Team first, then club, then trip.',
    live: ['Open your groups', '/groups'],
    shown: [['Look A3, HAI', 'mockups-layer-a3.html', 'Nov 10', true], ['Look A1, Daylight', 'mockups-layer-a1.html', 'Nov 10'], ['Structure B', 'mockups-layer-b.html', 'Nov 10'], ['Sign-in page', 'mockups-groups-signin.html', 'Nov 12']],
    rest: [['Structure A, app shell', 'mockups-layer-a.html', 'Nov 10', true], ['Look A2, Paper', 'mockups-layer-a2.html', 'Nov 10'], ['Structure C', 'mockups-layer-c.html', 'Nov 10'], ['Loop mark, round 1', 'mockups-loop-mark.html', 'Nov 12'], ['Loop mark, round 2', 'mockups-loop-mark-2.html', 'Nov 12'], ['Loop mark, round 3', 'mockups-loop-mark-3.html', 'Nov 12'], ['Loop mark, polish', 'mockups-loop-mark-polish.html', 'Nov 12'], ['Where the older demos live', 'mockups-archive.html', 'Nov 12']],
  },
  {
    when: 'November 2 to 3', title: 'Loop v1, the Sun look', state: 'Parked',
    what: 'A daytime layout where each plan is lit by its own hour and weather.',
    turned: 'the look was approved, but the product under it changed six days later. The layout was never built.',
    shown: [['Sun plan', 'mockups-sun.html', 'Nov 3', true], ['Space and plans', 'mockups-sun-pages.html', 'Nov 3'], ['Night palettes', 'mockups-night.html', 'Nov 2'], ['Daytime directions', 'mockups-day.html', 'Nov 2']],
    rest: [['Night fields', 'mockups-night-fields.html', 'Nov 2'], ['Chart line systems', 'mockups-chart.html', 'Nov 2'], ['Layout overdrive', 'mockups-layout-overdrive.html', 'Nov 2'], ['Layout, Loop v1 spec', 'mockups-layout-loop.html', 'Nov 2'], ['Intent rhythm', 'intent-rhythm.html', 'Nov 3'], ['Welcome prototype, Loop', 'loop-welcome-prototype/index.html', 'Nov 8']],
  },
  {
    when: 'October 21 to 26', title: 'Quorum, the proposal board', state: 'Still running',
    what: 'Post a plan; it locks when enough people are in. Built for the EMBA cohort trip.',
    turned: 'it worked for one trip, but it was its own app. The next version had to live inside the AI people already use.',
    live: ['Open the live trip board', '/b/emba27'],
    shown: [['Prototype v5', 'quorum.html', 'Oct 21', true], ['Luma, aigma, HAI, Delta', 'mockups-quorum-calm.html', 'Oct 21'], ['Light hero fields', 'mockups-quorum-hero.html', 'Oct 21'], ['Vendor side', 'mockups-vendor.html', 'Oct 26']],
    rest: [['Delta mixes', 'mockups-quorum-delta.html', 'Oct 21'], ['Fun directions', 'mockups-quorum-fun.html', 'Oct 21'], ['Orbits', 'mockups-quorum-fx.html', 'Oct 21'], ['Posting a plan', 'mockups-post.html', 'Oct 26']],
  },
  {
    when: 'August 17 to September 3', title: 'Campus Loop, the student app', state: 'Ended',
    what: 'A phone app for first-years to find people to go with, sold to universities.',
    turned: '0 of 6 institutions had a budget or a way to buy. Students also distrusted anything the school could see.',
    shown: [['Full demo', 'stellic.html', 'Sep 3'], ['Loop card v5', 'mockups-loop-card-v5.html', 'Sep 3', true], ['Home v2', 'mockups-home-v2.html', 'Sep 2', true], ['Advisor, tabs', 'mockups-advisor-tabs.html', 'Sep 3', true]],
    rest: [['Anchor', 'mockups-anchor.html', 'Sep 2'], ['Anchor detail', 'mockups-anchor-detail.html', 'Sep 3'], ['Anchor minimal', 'mockups-anchor-min.html', 'Sep 3'], ['Anchor tiles', 'mockups-anchor-tile.html', 'Sep 3'], ['Intent', 'mockups-intent.html', 'Aug 17'], ['Intent @ pins', 'mockups-intent-at.html', 'Aug 17'], ['Intent pills', 'mockups-intent-pills.html', 'Aug 17'], ['Home feed', 'mockups-home-feed.html', 'Aug 17'], ['Home blend', 'mockups-home-blend.html', 'Aug 17'], ['Home chips', 'mockups-home-chips.html', 'Sep 2'], ['Home filters', 'mockups-home-filters.html', 'Sep 3'], ['Loop card', 'mockups-loop-card.html', 'Sep 3'], ['Loop card v2', 'mockups-loop-card-v2.html', 'Sep 3'], ['Loop card v3', 'mockups-loop-card-v3.html', 'Sep 3'], ['Loop card v4', 'mockups-loop-card-v4.html', 'Sep 3'], ['Advisor', 'mockups-advisor.html', 'Sep 3'], ['Advisor v3', 'mockups-advisor-b.html', 'Sep 3'], ['Advisor v4, dial', 'mockups-advisor-dial.html', 'Sep 3'], ['Staff personas', 'mockups-staff-personas.html', 'Aug 18'], ['You hub', 'mockups-you-hub.html', 'Aug 18'], ['Onboarding', 'mockups-onboarding.html', 'Aug 18'], ['Header', 'mockups-header.html', 'Aug 17'], ['Buttons', 'mockups-buttons.html', 'Sep 3'], ['Ranking', 'mockups-ranking-personalization.html', 'Sep 3'], ['Redundancy cuts', 'mockups-redundancy.html', 'Sep 3'], ['Welcome prototype', 'stellic-welcome-prototype/index.html', 'Nov 8']],
  },
];

const open = { target: '_blank', rel: 'noopener' } as const;
const tail = ([, , date, picked]: Kept) => picked ? <span className="lp-chip">Picked</span> : <span className="lp-date">{date}</span>;

export default async function ArchivePage() {
  if (!await getPortalPrincipal()) return <section className="lt-editor"><h1>How we got here</h1><p>Sign in to see the earlier versions of Loop.</p><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent('/groups/archive')}`}>Sign in</Link></section>;
  return <>
    <h1>How we got here</h1>
    <p>{STOPS.length} versions of Loop in three months, newest first. Each one is kept as it was on the day it stopped. This page needs sign-in; the files it opens are plain links.</p>
    <ol className="lp-tl">{STOPS.map(stop => <li key={stop.title} className={stop.state === 'Live' ? 'lp-tl-now' : undefined}>
      <p className="lp-tl-when">{stop.when}</p>
      <h2>{stop.title} <span className={`lp-chip ${stop.state === 'Live' || stop.state === 'Still running' ? 'lp-chip-open' : 'lp-tl-over'}`}>{stop.state}</span></h2>
      <p>{stop.what}</p>
      {stop.turned && <p className="lp-tl-turn"><b>What turned us:</b> {stop.turned}</p>}
      <ul className="lp-tl-strip">{stop.shown.map(kept => <li key={kept[1]}>
        <a className="lp-tl-thumb" href={`/demo/${kept[1]}`} {...open} aria-label={`Open ${kept[0]}`}><iframe src={`/demo/${kept[1]}`} loading="lazy" tabIndex={-1} aria-hidden="true" /></a>
        <p><span>{kept[0]}</span>{tail(kept)}</p>
      </li>)}</ul>
      <details className="lp-tl-rest"><summary>{stop.rest.length} more from this stop</summary>
        <ul>{stop.rest.map(kept => <li key={kept[1]}><a href={`/demo/${kept[1]}`} {...open}>{kept[0]}</a>{tail(kept)}</li>)}</ul>
      </details>
      {stop.live && <Link className="lp-btn" href={stop.live[1]}>{stop.live[0]}</Link>}
    </li>)}</ol>
  </>;
}
