import Link from 'next/link';
import type { ReactNode } from 'react';
import { schoolOf } from '@/lib/campus/schools';
import { signInHref } from '@/lib/campus/session';
import { localParts, timeLabel } from '@/lib/campus/time';
import { SiteFoot } from './foot';
import { PlainShell } from './shell';
import { TopBar } from './top-bar';
import '@/app/groups/campus-look.css';
import '@/app/places/public.css';

/**
 * What a public page sits in (openspec campus-public-places; public/demo/mockups-six-adds.html, section 5): the app's bar
 * with a Sign in pill, the page, the dark bar that says what a school email shows, and the foot. It asks nothing about
 * who is looking, so the page is the same for everyone and can be kept for five minutes. Sign in lands on the campus screen.
 * The whole page, bar and foot too, wears the colours of the campus's school, whatever this browser last wore.
 */
export function PublicFrame({ campus, made, children }: { campus: { slug: string; tz: string }; /** When the counts were read. */ made: Date; children: ReactNode }) {
  const home = `/c/${campus.slug}`, kit = schoolOf(campus.slug), signIn = signInHref(home), { date } = localParts(campus.tz, made);
  return <PlainShell>
    <div className="cs gb"><div className="cs-pub-kit" data-kit={kit}>
      <TopBar home={home} account={<Link className="cs-btn sm go" href={signIn}>Sign in</Link>} />
      {children}
      <div className="cs-pub-end">
        <div className="cs-pub-gate"><p>Sign in with a school email to see who you know and to go.</p><Link className="cs-btn go" href={signIn}>Sign in</Link></div>
        <p className="cs-pub-made">Counts as of <time dateTime={made.toISOString()}>{timeLabel(campus.tz, made)} on {date}</time></p>
      </div>
      <SiteFoot home={home} kit={kit} />
    </div></div>
  </PlainShell>;
}

/** The JSON-LD a page carries in its first response, safe inside a script tag. */
export function Structured({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

/** 'Today', or 'Thu 26', on the campus clock. */
export function dayOf(tz: string, at: string, now: Date): string {
  const then = localParts(tz, new Date(at));
  return then.date === localParts(tz, now).date ? 'Today' : `${then.weekday} ${Number(then.date.slice(8))}`;
}

/** A line under an event's title: who puts it on, and the calendar it came from (named, never linked). */
export const byline = (event: { host: string | null; source: string | null }) => [event.host, event.source && `From ${event.source}`].filter(Boolean).join(' · ') || 'Listed by Loopd';
