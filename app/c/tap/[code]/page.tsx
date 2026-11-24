import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { assistantReady } from '@/lib/campus/interest';
import { findListing } from '@/lib/campus/listings';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { checkedInOf, closable, readTap, wouldBeWith } from '@/lib/campus/tap';
import { dayLabel, timeLabel } from '@/lib/campus/time';
import { siteBar } from '../../site-bar';
import { TAP_SAYS } from './says';
import { TapPress } from './tap-press';
import '../../no-school.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirm · Loopd', robots: { index: false } };

const list = (names: string[]) => names.join(', ').replace(/, ([^,]*)$/, ' and $1');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The link an assistant gives with join and close_loop (openspec campus-assistant-tools, design D6): the same step as the
 * card's button, for the person signed in. Opening it does nothing; only pressing the button does.
 */
export default async function TapPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params, back = `/c/tap/${encodeURIComponent(code)}`;
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref(back));
  const campus = viewer.campus;
  const tap = campus && await assistantReady(db()) ? await readTap(db(), viewer.personId, code, 'link') : { done: false as const, reason: 'unknown' as const };
  const listing = 'done' in tap ? null : await findListing(db(), tap.listingId);
  const home = campus ? `/c/${campus.slug}` : '/';
  let tab = 'Not here', title: string | null = null, when: string | null = null, line: string, press: { label: string; done: string } | null = null;
  if ('done' in tap || !listing || !campus) line = 'done' in tap ? TAP_SAYS[tap.reason] : TAP_SAYS.unknown;
  else {
    title = listing.title;
    when = `${dayLabel(campus.tz, listing.startsAt, new Date())} ${timeLabel(campus.tz, listing.startsAt)}${listing.placeText ?? listing.place?.name ? ` · ${listing.placeText ?? listing.place!.name}` : ''}`;
    if (tap.action === 'join') {
      const withWho = await wouldBeWith(db(), viewer.personId, listing.id);
      tab = 'Join this plan?';
      line = withWho.known.length ? `With ${list([...withWho.known, ...(withWho.others ? [plural(withWho.others, 'other', 'others')] : [])])}.` : withWho.others ? `With ${plural(withWho.others, 'person', 'people')} you do not know yet.` : 'You would start a new group.';
      press = { label: 'Join', done: 'You are in. Check in on your phone when you get there.' };
    } else {
      const can = await closable(db(), viewer.personId, listing.id);
      tab = 'Close the loop?';
      line = 'reason' in can ? (can.reason === 'not_here' ? 'Check in on your phone first.' : can.reason === 'closed' ? 'You already closed the loop on this.' : can.reason === 'not_in' ? 'You are not in a group for this.' : 'This has not started yet.')
        : (({ checkedIn, of }) => `${checkedIn} of ${of} checked in.`)(await checkedInOf(db(), can.outingId));
      if (!('reason' in can)) press = { label: 'Close the loop', done: 'The loop is closed for you.' };
    }
  }
  const { bar, foot } = campus ? await siteBar({ campus, viewer, back }) : { bar: null, foot: null };
  return <>
    <div className="cs">{bar}
      <div className="cs-ns"><div className="cs-ns-two">
        <section className="cs-ns-tk cs-ns-wide">
          <span className="cs-ns-tab">{tab}</span>
          {title && <div className="cs-ns-me"><span><b>{title}</b>{when && <small>{when}</small>}</span></div>}
          <p>{line}</p>
          {press ? <TapPress code={code} label={press.label} back={home} done={press.done} /> : <div className="cs-ns-row"><a className="cs-btn go" href={home}>Back to this week</a></div>}
        </section>
      </div></div>
    </div>
    {foot}
  </>;
}
