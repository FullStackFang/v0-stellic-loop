import { redirect } from 'next/navigation';
import { Door, type DoorSchool } from '@/components/campus/door';
import { CampusShell } from '@/components/campus/shell';
import { db } from '@/lib/db';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { listCampuses, weekListings, type Campus } from '@/lib/campus/listings';
import { campusRewards, groupRewardFor } from '@/lib/campus/rewards';
import { campusViewer } from '@/lib/campus/session';
import { dayLabel, timeLabel } from '@/lib/campus/time';
import { NoSchool } from './c/week';

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

/** The pitch, a ticket to try for each school, and the sign-in card. `routing` says whether the card owns the address (/sign-in) or sits on another page (/). */
export async function DoorPage({ routing }: { routing: 'hash' | 'path' }) {
  const now = new Date(), schools = await Promise.all((await listCampuses(db())).map(campus => ticket(campus, now)));
  // Open on a school that has something on this week.
  return <div className="cs"><Door schools={schools} start={Math.max(0, schools.findIndex(school => school.event))} routing={routing} configured={clerkPortalConfigured()} /></div>;
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
