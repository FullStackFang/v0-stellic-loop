import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { Door, type DoorSchool } from '@/components/campus/door';
import { CampusShell } from '@/components/campus/shell';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { schoolOf } from '@/lib/campus/schools';
import { campusRewards, groupRewardFor } from '@/lib/campus/rewards';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { dayLabel, timeLabel } from '@/lib/campus/time';
import { DOODLES_PAGE } from '@/lib/campus/doodles';

/**
 * One school's ticket for the pitch: an event of this week, the first that has a group reward if any has, with that
 * reward as a Member sees it. Titles and times only, never people.
 */
async function ticket(campus: Campus, now: Date): Promise<DoorSchool> {
  const [week, rewards] = await Promise.all([weekListings(db(), campus, now), campusRewards(db(), campus.id)]);
  const rewarded = week.map(event => ({ event, found: groupRewardFor(rewards, event, 0) })).find(each => each.found);
  const event = rewarded?.event ?? week[0], found = rewarded?.found;
  return {
    slug: campus.slug, name: campus.name, domains: campus.domains,
    event: event ? { title: event.title, day: dayLabel(campus.tz, event.startsAt, now), time: timeLabel(campus.tz, event.startsAt), line: [event.host ?? (event.origin === 'member' ? 'A plan someone posted' : null), campus.name].filter(Boolean).join(' · ') } : null,
    reward: found ? { need: Math.min(6, Math.max(2, found.reward.headCount ?? 3)), text: found.text } : null,
  };
}

/** Each school's ticket for the pitch. The same for everyone: no person is in it. */
export async function pitchTickets(): Promise<DoorSchool[]> {
  const now = new Date();
  return Promise.all((await listCampuses(db())).filter(campus => schoolOf(campus.slug) === campus.slug).map(campus => ticket(campus, now)));
}
/** The tickets, kept for a minute across visitors (openspec/changes/loop-lighter-pages, D4): a burst of visitors costs one read. */
const keptPitch = unstable_cache(pitchTickets, ['door-pitch'], { revalidate: 60 });

/** The pitch, a ticket to try for each school, and the sign-in card. `routing` says whether the card owns the address (/sign-in) or sits on another page (/). */
export async function DoorPage({ routing }: { routing: 'hash' | 'path' }) {
  const schools = await keptPitch();
  // Open on a school that has something on this week.
  return <div className="cs"><Door schools={schools} start={Math.max(0, schools.findIndex(school => school.event))} routing={routing} configured={clerkPortalConfigured()} /></div>;
}

/**
 * The front door when the campus screen is the front of the site (the default). Signed out: the pitch and the
 * sign-in card. Signed in: on to the campus they were last looking at, or else their own. Someone at no school goes to the games; the admin goes to the default campus.
 */
export async function FrontDoor() {
  const viewer = await campusViewer();
  if (viewer?.campus) redirect(`/c/${(await lookingAt() ?? viewer.campus).slug}`);
  if (viewer?.admin) { const [first] = await listCampuses(db()); if (first) redirect(`/c/${first.slug}`); }
  // Signed in at no school: the games are theirs, and the thanks is there (public/demo/mockups-any-email.html, B).
  if (viewer) redirect(DOODLES_PAGE);
  return <CampusShell><DoorPage routing="hash" /></CampusShell>;
}
