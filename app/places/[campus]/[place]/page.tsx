import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';
import { byline, dayOf, PublicFrame, Structured } from '@/components/campus/public-frame';
import { db } from '@/lib/db';
import { eventPath, placePath, publicEvents, publicPlace, siteUrl } from '@/lib/campus/public';
import { placeRecord } from '@/lib/campus/record';
import { schoolOf } from '@/lib/campus/schools';
import { timeLabel } from '@/lib/campus/time';

// The same for everyone and read again at most every five minutes (design D9). No page is built ahead: each is built
// the first time it is asked for.
export const revalidate = 300;
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ campus: string; place: string }> };
const DAY = 86400000;

const load = cache(async (campus: string, place: string) => {
  const now = new Date(), found = await publicPlace(db(), campus, place, now);
  if (!found) return null;
  const [events, record] = await Promise.all([
    publicEvents(db(), { id: found.campusId }, { from: now, to: new Date(now.getTime() + 7 * DAY), placeId: found.id, now }),
    found.recordPublic ? placeRecord(db(), found.id, 8, found.campus.tz, now) : null]);
  return { place: found, events, record, now };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { campus, place } = await params, found = await load(campus, place);
  if (!found) return {};
  const on = found.events.length;
  return { title: `${found.place.name} · ${found.place.campus.name} · Loopd`, alternates: { canonical: placePath(found.place.campus.slug, found.place.tag) },
    description: `${found.place.name}, near ${found.place.campus.name}: ${on ? `${on} ${on === 1 ? 'event' : 'events'} this week, with how many students are going` : 'how many student groups have come'}.` };
}


/**
 * A place's public page (openspec campus-public-places): its name and campus, what is on there in the next seven days
 * with how many are going, and its record's three numbers when the admin made the record public. Counts only.
 */
export default async function PublicPlacePage({ params }: Props) {
  const { campus, place: tag } = await params, found = await load(campus, tag);
  if (!found) notFound();
  const { place, events, record, now } = found, tz = place.campus.tz;
  const structured = { '@context': 'https://schema.org', '@type': 'Place', name: place.name, url: siteUrl(placePath(place.campus.slug, place.tag)),
    geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon }, containedInPlace: { '@type': 'Place', name: place.campus.name },
    event: events.map(event => ({ '@type': 'Event', name: event.title, startDate: event.startsAt, ...(event.endsAt ? { endDate: event.endsAt } : {}), url: siteUrl(eventPath(event.id)),
      location: { '@type': 'Place', name: place.name }, ...(event.host ? { organizer: { '@type': 'Organization', name: event.host } } : {}) })) };
  return <PublicFrame campus={place.campus} made={now}>
    <Structured data={structured} />
    <main className="cs-pub" data-kit={schoolOf(place.campus.slug)}>
      <header className="cs-pub-band">
        <h1>{place.name}</h1>
        <p>{place.walk ? `${place.walk} min walk from ${place.campus.name}` : `Near ${place.campus.name}`}</p>
        {record && <ul className="cs-pub-facts" aria-label="Its record, the last 8 weeks">
          <li>{record.said} {record.said === 1 ? 'group' : 'groups'} said they were coming</li>
          <li className="on">{record.showed} showed up in 8 weeks</li>
          <li>{record.back} came back</li>
        </ul>}
      </header>
      <div className="cs-pub-inner">
        <section className="cs-pub-panel" aria-labelledby="cs-pub-week">
          <h2 id="cs-pub-week">This week</h2>
          {events.length ? <ol className="cs-pub-rows">{events.map(event => <li key={event.id}>
            <Link className="cs-pub-row" href={eventPath(event.id)}>
              <time className="cs-pub-when" dateTime={event.startsAt}><small>{dayOf(tz, event.startsAt, now)}</small><b>{timeLabel(tz, event.startsAt)}</b></time>
              <span className="cs-pub-what"><b>{event.title}</b><small>{byline(event)}</small></span>
              <span className="cs-pub-count">{event.going} going</span>
            </Link></li>)}</ol>
            : <p className="cs-pub-none">Nothing is listed here for the next seven days.</p>}
        </section>
      </div>
    </main>
  </PublicFrame>;
}
