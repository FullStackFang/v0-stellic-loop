import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { DoorSignIn } from '@/components/campus/door-sign-in';
import { Tile } from '@/components/campus/screen';
import { CampusShell } from '@/components/campus/shell';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { campusViewer } from '@/lib/campus/session';
import { dayLabel, timeLabel } from '@/lib/campus/time';
import { NoSchool } from './c/week';

/** A few of this week's events, for the pitch: from the first school that has any. Titles and times only, never people. */
async function samples(campuses: Campus[], now: Date) {
  for (const campus of campuses) {
    const week = await weekListings(db(), campus, now);
    if (week.length) return week.slice(0, 3).map(event => ({ id: event.id, title: event.title, day: dayLabel(campus.tz, event.startsAt, now), time: timeLabel(campus.tz, event.startsAt), line: [event.host ?? (event.origin === 'member' ? 'A plan someone posted' : null), campus.name].filter(Boolean).join(' · ') }));
  }
  return [];
}

/** The pitch, a few sample events and the sign-in card. `routing` says whether the card owns the address (/sign-in) or sits on another page (/). */
export async function DoorPage({ routing }: { routing: 'hash' | 'path' }) {
  const campuses = await listCampuses(db()), peek = await samples(campuses, new Date());
  return <div className="cs">
    <header className="cs-nav"><Link className="cs-wm" href="/"><Rings />Loop</Link></header>
    <main className="cs-door">
      <div className="cs-door-say"><h1>Go together. Get more for it.</h1><p>Events from your campus and plans posted by people near you. Show up as a group and the reward unlocks.</p>
        {peek.length > 0 && <ul className="cs-mine" aria-label="On this week">{peek.map(event => <li key={event.id}><Tile top={event.day} big={event.time} /><div><b>{event.title}</b><span>{event.line}</span></div></li>)}</ul>}</div>
      <DoorSignIn routing={routing} configured={clerkPortalConfigured()} schools={campuses.map(({ slug, name, domains }) => ({ slug, name, domains }))} />
    </main>
  </div>;
}

/**
 * The front door when the campus screen is the front of the site (the default). Signed out: the pitch and the
 * sign-in card. Signed in: on to the person's own school. Someone at no school goes to the default campus.
 */
export async function FrontDoor() {
  const viewer = await campusViewer();
  if (viewer?.campus) redirect(`/c/${viewer.campus.slug}`);
  if (viewer?.admin) { const [first] = await listCampuses(db()); if (first) redirect(`/c/${first.slug}`); }
  return <CampusShell>{viewer ? <NoSchool /> : <DoorPage routing="hash" />}</CampusShell>;
}
