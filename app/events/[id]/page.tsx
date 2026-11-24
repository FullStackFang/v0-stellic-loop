import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';
import { byline, dayOf, PublicFrame, Structured } from '@/components/campus/public-frame';
import { db } from '@/lib/db';
import { eventPath, placePath, PUBLIC_PLACE_DAYS, publicEvent, siteUrl } from '@/lib/campus/public';
import { schoolOf } from '@/lib/campus/schools';
import { timeLabel } from '@/lib/campus/time';

// The same for everyone and read again at most every five minutes (design D9). Each page is built the first time it is asked for.
export const revalidate = 300;
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => { const now = new Date(); return { event: await publicEvent(db(), id, now), now }; });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { event } = await load((await params).id);
  if (!event) return {};
  return { title: `${event.title} · ${event.campus.name} · Loopd`, alternates: { canonical: eventPath(event.id) },
    description: `${event.title}${event.place ? ` at ${event.place.name}` : ''}, near ${event.campus.name}. ${event.going} going.` };
}

/**
 * One public event (openspec campus-public-places): its title, day and time, place, host, the source named with no link
 * out, its about text, and how many are going. Counts only.
 */
export default async function PublicEventPage({ params }: Props) {
  const { event, now } = await load((await params).id);
  if (!event) notFound();
  const tz = event.campus.tz;
  // A place has a page while it has a public event in the next 14 days (design D1), so this one gives it one.
  const placePage = event.place && Date.parse(event.startsAt) < now.getTime() + PUBLIC_PLACE_DAYS * 86400000 ? placePath(event.campus.slug, event.place.tag) : null;
  const structured = { '@context': 'https://schema.org', '@type': 'Event', name: event.title, url: siteUrl(eventPath(event.id)), startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}), ...(event.about ? { description: event.about } : {}),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: event.place?.name ?? event.campus.name, ...(placePage ? { url: siteUrl(placePage) } : {}) },
    ...(event.host ? { organizer: { '@type': 'Organization', name: event.host } } : {}) };
  return <PublicFrame campus={event.campus} made={now}>
    <Structured data={structured} />
    <main className="cs-pub" data-kit={schoolOf(event.campus.slug)}>
      <header className="cs-pub-band">
        <h1>{event.title}</h1>
        <p><time dateTime={event.startsAt}>{dayOf(tz, event.startsAt, now)}, {timeLabel(tz, event.startsAt)}{event.endsAt ? `–${timeLabel(tz, event.endsAt)}` : ''}</time>
          {' · '}{event.place?.name ?? `Near ${event.campus.name}`}</p>
        <ul className="cs-pub-facts">
          <li className="on">{event.going} going</li>
          <li>{byline(event)}</li>
          {placePage && event.place && <li><Link href={placePage}>More at {event.place.name}</Link></li>}
        </ul>
      </header>
      {event.about && <div className="cs-pub-inner">
        <section className="cs-pub-panel" aria-labelledby="cs-pub-about"><h2 id="cs-pub-about">About</h2><p className="cs-pub-about">{event.about}</p></section>
      </div>}
    </main>
  </PublicFrame>;
}
